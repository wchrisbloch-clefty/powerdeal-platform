import { NextResponse } from 'next/server';
import { getActiveVertical } from '@/lib/active-vertical';
import { fetchWithTimeout } from '@/lib/utils';
import type { SourceConfig } from '@/lib/verticals/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/feed/health — probe every configured source.
 *
 * Publisher feed URLs move, and a dead source otherwise fails silently: the
 * sweep logs a warning nobody reads and the feed just gets quieter. This makes
 * the failure visible and actionable from Settings.
 *
 * Run it after deploying, and again any time the feed looks thin.
 */

interface SourceHealth {
  id: string;
  name: string;
  url: string;
  role: 'core' | 'discovery';
  status: 'ok' | 'empty' | 'error';
  httpStatus: number | null;
  itemCount: number;
  message: string | null;
}

async function probe(source: SourceConfig): Promise<SourceHealth> {
  const base = {
    id: source.id,
    name: source.name,
    url: source.url,
    role: source.role,
  };

  try {
    const res = await fetchWithTimeout(
      source.url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; PowerDealBot/1.0; +https://powerdeal.app)',
          Accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      },
      15000,
    );

    if (!res.ok) {
      return {
        ...base,
        status: 'error',
        httpStatus: res.status,
        itemCount: 0,
        message:
          res.status === 404
            ? 'Feed URL has moved. Find the current one and update lib/verticals/powerdeal.ts.'
            : res.status === 403
              ? 'Publisher is blocking this client. May need a different user agent, or the feed is gone.'
              : `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const body = await res.text();
    const itemCount = (body.match(/<(?:item|entry)\b/gi) ?? []).length;

    if (itemCount === 0) {
      return {
        ...base,
        status: 'empty',
        httpStatus: res.status,
        itemCount: 0,
        message: 'Responded 200 but contains no items — likely an HTML page, not a feed.',
      };
    }

    return {
      ...base,
      status: 'ok',
      httpStatus: res.status,
      itemCount,
      message: null,
    };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      httpStatus: null,
      itemCount: 0,
      message: (err as Error).message,
    };
  }
}

export async function GET() {
  const vertical = getActiveVertical();
  const sources = [...vertical.sources, ...vertical.discovery];

  // Bounded concurrency — 21 simultaneous requests trips rate limits.
  const results: SourceHealth[] = [];
  const queue = [...sources];
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;
      results.push(await probe(source));
    }
  });
  await Promise.all(workers);

  const ok = results.filter((r) => r.status === 'ok');
  const broken = results.filter((r) => r.status !== 'ok');

  return NextResponse.json({
    checked: results.length,
    ok: ok.length,
    broken: broken.length,
    sources: results.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)),
  });
}
