import { NextResponse } from 'next/server';
import { probeAllSources, probeUrl, pooled } from '@/lib/feed-health-probe';
import { FEED_CANDIDATES } from '@/lib/verticals/feed-candidates';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/feed/health - probe every configured source.
 *
 * Publisher feed URLs move, and a dead source otherwise fails silently: the
 * sweep logs a warning nobody reads and the feed just gets quieter. This makes
 * the failure visible and actionable from Settings.
 *
 * WARNING: THE PROBE ITSELF NOW LIVES IN lib/feed-health-probe.ts, and the
 * daily cron calls it IN PROCESS rather than fetching this URL. It used to
 * fetch, and Vercel Deployment Protection 302'd the request into an SSO login
 * every day. There is still exactly one definition of "healthy"; it is just no
 * longer reachable only across a network that can refuse it.
 *
 * This route remains because the Sources panel needs an HTTP endpoint, and
 * because `?candidates=1` belongs to the interactive path.
 */
export async function GET(request: Request) {
  const results = await probeAllSources();
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
