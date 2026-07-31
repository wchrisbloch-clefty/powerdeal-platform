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
  /**
   * Structure of the first HTML table on the page, when there is one.
   *
   * Only useful for scrape targets — EPA publishes the authoritative Class VI
   * record as HTML tables with no feed. Writing a parser against a guessed
   * column layout produces a scraper that silently returns garbage, which is
   * the same failure class as a wrong feed URL returning 200. This reports
   * the real headers and a real row so the parser can be written against
   * what is actually served.
   */
  tableHeaders?: string[];
  tableFirstRow?: string[];
  tableCount?: number;
  /**
   * Shape of an HTML page that is a scrape target but has no data table.
   *
   * The EPA Class VI pages came back with zero tables, so the record is held
   * some other way — link lists, or a dashboard widget rendered client-side.
   * An iframe pointing at ArcGIS would be the good outcome: those are backed
   * by a documented REST API returning JSON, which beats parsing HTML that
   * EPA can restyle at any time.
   */
  bodyChars?: number;
  iframes?: string[];
  linkSample?: string[];
  /**
   * First slice of a non-HTML body.
   *
   * For a JSON API candidate, status and byte count say nothing useful — a
   * 200 can be an empty array, an error envelope, or a login page. The only
   * way to judge whether an endpoint returns the records wanted is to look at
   * what it returns. HTML is excluded because linkSample and the table
   * inspector already cover it and the markup would swamp the output.
   */
  bodySnippet?: string;
}

/** Collapse an HTML fragment to its visible text. */
function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the shape of the first data table on an HTML page.
 *
 * Deliberately dumb regex rather than a DOM parser — this runs on scrape
 * targets a handful of times while a parser is being written, not in the hot
 * path, and pulling in a full HTML parser for that is not worth the weight.
 */
function inspectFirstTable(
  body: string,
): Pick<UrlHealth, 'tableHeaders' | 'tableFirstRow' | 'tableCount'> {
  const tables = [...body.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  if (tables.length === 0) return {};

  // Prefer the first table that actually has header cells; navigation and
  // layout tables usually do not.
  const table = tables.find((t) => /<th\b/i.test(t)) ?? tables[0];

  const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((m) => cellText(m[1]))
    .filter(Boolean);

  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const dataRow = rows.find((r) => /<td\b/i.test(r));
  const firstRow = dataRow
    ? [...dataRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        cellText(m[1]).slice(0, 120),
      )
    : [];

  return {
    tableCount: tables.length,
    ...(headers.length > 0 ? { tableHeaders: headers } : {}),
    ...(firstRow.length > 0 ? { tableFirstRow: firstRow } : {}),
  };
}

/**
 * Describe a table-less HTML page well enough to decide how to scrape it.
 *
 * Runs only when the page has no data table, which is the case that needs
 * investigating. Reports iframes first — an embedded ArcGIS or Power BI
 * dashboard means there is a JSON API behind it, and consuming that is both
 * easier and far more stable than parsing markup.
 */
function inspectPageShape(
  body: string,
): Pick<UrlHealth, 'bodyChars' | 'iframes' | 'linkSample' | 'bodySnippet'> {
  const looksHtml = /^\s*(?:<!doctype html|<html\b)/i.test(body);
  if (!looksHtml) {
    return {
      bodyChars: body.length,
      bodySnippet: body.replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  }

  const iframes = [...body.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .slice(0, 10);

  // Links that plausibly point at the actual records.
  const links = [...body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: cellText(m[2]) }))
    .filter(
      (l) =>
        /class[-\s]?vi|permit|sequestration|\.pdf$|\.xlsx?$|\.csv$/i.test(l.href) ||
        /class\s?vi|permit/i.test(l.text),
    )
    .slice(0, 12)
    .map((l) => `${l.text || '(no text)'} → ${l.href}`);

  return {
    bodyChars: body.length,
    ...(iframes.length > 0 ? { iframes } : {}),
    ...(links.length > 0 ? { linkSample: links } : {}),
  };
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
    const table = inspectFirstTable(body);
    // Only worth describing the page shape when there is no table to read.
    const shape = table.tableCount ? {} : inspectPageShape(body);

    if (itemCount === 0) {
      return {
        status: 'empty',
        httpStatus: res.status,
        itemCount: 0,
        feedTitle,
        sampleTitles,
        ...table,
        ...shape,
        message: 'Responded 200 but contains no items — likely an HTML page, not a feed.',
      };
    }

    return {
      status: 'ok',
      httpStatus: res.status,
      itemCount,
      feedTitle,
      sampleTitles,
      ...table,
      ...shape,
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
              ...(c.tableCount ? { tableCount: c.tableCount } : {}),
              ...(c.tableHeaders ? { tableHeaders: c.tableHeaders } : {}),
              ...(c.tableFirstRow ? { tableFirstRow: c.tableFirstRow } : {}),
              ...(c.bodyChars ? { bodyChars: c.bodyChars } : {}),
              ...(c.iframes ? { iframes: c.iframes } : {}),
              ...(c.linkSample ? { linkSample: c.linkSample } : {}),
              ...(c.bodySnippet ? { bodySnippet: c.bodySnippet } : {}),
            })),
        }
      : {}),
  });
}
