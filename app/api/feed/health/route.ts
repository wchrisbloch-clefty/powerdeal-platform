import { NextResponse } from 'next/server';
import { getActiveVertical } from '@/lib/active-vertical';
import { fetchWithTimeout } from '@/lib/utils';
import { FEED_REQUEST_HEADERS } from '@/lib/engine/feed-headers';
import { FEED_CANDIDATES } from '@/lib/verticals/feed-candidates';
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
  feedTitle: string | null;
  sampleTitles: string[];
}

/** Probe result for one URL, independent of which source it belongs to. */
interface UrlHealth {
  status: 'ok' | 'empty' | 'error';
  httpStatus: number | null;
  itemCount: number;
  message: string | null;
  /** First feed <title>, so a wrong-but-live URL is obvious in the output. */
  feedTitle: string | null;
  /**
   * First few item titles. Item count alone cannot tell a correctly-scoped
   * feed from a site-wide one served at a section URL — the only way to know
   * a source is on-topic is to read what it actually carries.
   */
  sampleTitles: string[];
}

async function probeUrl(url: string): Promise<UrlHealth> {
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: FEED_REQUEST_HEADERS, redirect: 'follow' },
      15000,
    );

    if (!res.ok) {
      return {
        status: 'error',
        httpStatus: res.status,
        itemCount: 0,
        feedTitle: null,
        sampleTitles: [],
        message:
          res.status === 404
            ? 'Feed URL has moved. Find the current one and update lib/verticals/powerdeal.ts.'
            : res.status === 403
              ? 'Publisher is blocking this client even with a browser user agent.'
              : res.status === 429
                ? 'Rate limited. Back off and retry, or drop the source.'
                : `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const body = await res.text();
    const itemCount = (body.match(/<(?:item|entry)\b/gi) ?? []).length;

    // All <title> values in document order. The first is the channel/feed
    // title; the rest are items.
    const titles = [
      ...body.matchAll(
        /<title[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]{1,200}?)(?:\]\]>)?\s*<\/title>/gi,
      ),
    ].map((m) => m[1].replace(/\s+/g, ' ').trim());

    const feedTitle = titles[0] ?? null;
    const sampleTitles = titles.slice(1, 4);

    if (itemCount === 0) {
      return {
        status: 'empty',
        httpStatus: res.status,
        itemCount: 0,
        feedTitle,
        sampleTitles,
        message: 'Responded 200 but contains no items — likely an HTML page, not a feed.',
      };
    }

    return {
      status: 'ok',
      httpStatus: res.status,
      itemCount,
      feedTitle,
      sampleTitles,
      message: null,
    };
  } catch (err) {
    return {
      status: 'error',
      httpStatus: null,
      itemCount: 0,
      feedTitle: null,
      sampleTitles: [],
      message: (err as Error).message,
    };
  }
}

async function probe(source: SourceConfig): Promise<SourceHealth> {
  const result = await probeUrl(source.url);
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    role: source.role,
    ...result,
  };
}

/** Run tasks with bounded concurrency — N simultaneous requests trips rate limits. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) break;
        results.push(await fn(item));
      }
    }),
  );
  return results;
}

export async function GET(request: Request) {
  const vertical = getActiveVertical();
  const sources = [...vertical.sources, ...vertical.discovery];

  const results = await pooled(sources, 5, probe);
  const ok = results.filter((r) => r.status === 'ok');
  const broken = results.filter((r) => r.status !== 'ok');

  /**
   * ?candidates=1 additionally probes the replacement URLs in
   * lib/verticals/feed-candidates.ts. The list is fixed in code — the caller
   * cannot supply a URL, so this is not an open fetch proxy.
   */
  const wantCandidates =
    new URL(request.url).searchParams.get('candidates') === '1';

  const candidates = wantCandidates
    ? await pooled(
        FEED_CANDIDATES.flatMap((set) =>
          set.urls.map((url) => ({ sourceId: set.sourceId, failure: set.failure, url })),
        ),
        4,
        async (c) => ({ ...c, ...(await probeUrl(c.url)) }),
      )
    : undefined;

  return NextResponse.json({
    checked: results.length,
    ok: ok.length,
    broken: broken.length,
    sources: results.sort(
      (a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name),
    ),
    ...(candidates
      ? {
          candidates: candidates
            .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.url.localeCompare(b.url))
            // Only the winners matter; failures are noise once there is a winner.
            .map((c) => ({
              sourceId: c.sourceId,
              url: c.url,
              status: c.status,
              httpStatus: c.httpStatus,
              itemCount: c.itemCount,
              feedTitle: c.feedTitle,
              sampleTitles: c.sampleTitles,
            })),
        }
      : {}),
  });
}
