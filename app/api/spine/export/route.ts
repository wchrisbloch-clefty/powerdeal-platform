import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { classifySeedState } from '@/lib/seed-state';
import { renderSpine } from '@/lib/spine-export';
import type { Deal, DealCompetitor } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/spine/export — the pipeline as markdown, for pinning.
 *
 * ══ GET, AND NOTHING ELSE. THAT IS THE FEATURE. ══
 *
 * This file exports exactly one handler. There is no POST, no PUT, no PATCH,
 * no DELETE, and `tests/spine-export.test.ts` asserts their absence rather
 * than trusting that nobody adds one. A chat surface that could write back to
 * `deals` is precisely the silent-write risk this build spent two weeks
 * removing — an unaudited mutation path with a friendly interface on it — and
 * "read-only" is worth nothing as an intention.
 *
 * No audit trail, no verification block and no migration record on this path,
 * deliberately: there is nothing to audit, because nothing is written.
 *
 * ══ IT READS DIRECTLY, NOT THROUGH getDeals() ══
 *
 * `getDeals()` substitutes `SEED_DEALS` on a failed read and filters `Archived`
 * out. Both are right for a dashboard and wrong here. A Spine pinned from
 * demonstration rows would have a model reasoning confidently about accounts
 * that do not exist, and a Spine missing every terminal deal cannot answer
 * "did we already lose this one".
 *
 * ⚠️ 200 EVEN ON A FAILED READ, with the failure IN THE DOCUMENT. Same rule as
 * the drift and model-health routes: the status describes whether the export
 * ran. A 500 here hands the operator an error page; a 200 hands them a file
 * that says, in its own first section, not to pin it.
 */
export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const wantsDownload = new URL(request.url).searchParams.get('download') === '1';

  const markdown = await build(generatedAt);

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      // Date-stamped in the FILENAME too, so a downloaded copy sitting in a
      // folder can be dated without opening it.
      ...(wantsDownload
        ? {
            'Content-Disposition': `attachment; filename="Pipeline-Spine-${generatedAt.slice(0, 10)}.md"`,
          }
        : {}),
    },
  });
}

async function build(generatedAt: string): Promise<string> {
  const client = getAdminClient();
  if (!client) {
    return renderSpine({
      deals: [],
      competitors: [],
      generatedAt,
      state: {
        kind: 'unreadable',
        reason: 'SUPABASE_SERVICE_ROLE_KEY is not set, so the pipeline cannot be read.',
      },
    });
  }

  const [dealRes, compRes] = await Promise.all([
    // No stage filter: a terminal deal belongs in the Spine so the reader can
    // see it was closed rather than wondering where it went.
    client.from('deals').select('*').eq('user_id', POWERDEAL_USER_ID),
    client.from('deal_competitors').select('*').eq('user_id', POWERDEAL_USER_ID),
  ]);

  const state = classifySeedState<Deal>({
    rows: dealRes.data as Deal[] | null,
    error: dealRes.error,
    // A seed deal carries no `created_at` from the database and a synthetic
    // id. The real marker is the id shape used by lib/seed-data.ts.
    isSeed: (d) => typeof d.id === 'string' && d.id.startsWith('seed-'),
  });

  // ⚠️ THE COMPETITOR READ FAILING MUST NOT SILENTLY EMPTY EVERY GRID. That
  // would print "no stored rows — the default grid" on every deal, which is a
  // confident claim about the competitive picture derived from a failed query.
  const competitorError = compRes.error?.message ?? null;
  const competitors = (compRes.data ?? []) as DealCompetitor[];

  const body = renderSpine({
    deals: (dealRes.data ?? []) as Deal[],
    competitors,
    generatedAt,
    state,
  });

  if (!competitorError) return body;

  return [
    body,
    '',
    '---',
    '',
    '## ⚠️ Competitive data could not be read',
    '',
    `Every "no stored rows" above is unverified — the query failed, so nothing`,
    `is known about the competitive picture on any deal.`,
    '',
    `> ${competitorError}`,
  ].join('\n');
}
