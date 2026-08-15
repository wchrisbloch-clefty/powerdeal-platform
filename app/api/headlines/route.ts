import { NextResponse } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { rankHeadlines, headlineSummary } from '@/lib/engine/headlines';
import { classifySeedState, describeSeedState } from '@/lib/seed-state';
import type { Deal, FeedItem } from '@/lib/types';
import { explainFailure, keyShape } from '@/lib/supabase/diagnose';

export const dynamic = 'force-dynamic';

/**
 * GET /api/headlines — the swept feed, ranked by what it means for the pipeline.
 *
 * Everything this needs was already being written and nothing joined it:
 * `deal_ids` on every swept item, the outreach hook on the row, the deals
 * themselves one table away. The ranking lives in `lib/engine/headlines.ts`,
 * pure and exhaustively tested; this route reads two tables and hands them over.
 *
 * ══ THE READ STATE IS PART OF THE RESPONSE ══
 *
 * Both reads are classified rather than coerced. `supabase-js` RESOLVES with
 * `{ data: null, error }`, so a failed query hands back an empty array to
 * anyone who reaches for `.length` — and this build has already shipped that
 * bug three times, every one of them rendering a broken read as a quiet empty
 * state. `feed_state` and `deal_state` say which happened, and the client
 * renders the difference.
 *
 * 200 EVEN WHEN A READ FAILED. The status describes whether the ROUTE ran.
 * Downgrading to 500 would blank a client that could otherwise say precisely
 * what went wrong, which is worse than the failure.
 */
export async function GET() {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({
      headlines: [],
      summary: null,
      feed_state: {
        kind: 'unreadable',
        reason: 'SUPABASE_SERVICE_ROLE_KEY is not set, so nothing can be read.',
      },
      deal_state: {
        kind: 'unreadable',
        reason: 'SUPABASE_SERVICE_ROLE_KEY is not set, so nothing can be read.',
      },
    });
  }

  const [feedRes, dealRes] = await Promise.all([
    supabase
      .from('feed_items')
      .select('*')
      .eq('user_id', POWERDEAL_USER_ID)
      .order('cached_at', { ascending: false })
      .limit(200),
    supabase.from('deals').select('*').eq('user_id', POWERDEAL_USER_ID),
  ]);

  const feedState = classifySeedState<FeedItem>({
    rows: feedRes.data as FeedItem[] | null,
    error: feedRes.error,
    // `arrival: 'seed'` is the platform's own demonstration material. Counted
    // and labelled, never silently mixed into a ranking that reads as findings
    // about the operator's world.
    isSeed: (row) => row.arrival === 'seed',
  });

  const dealState = classifySeedState<Deal>({
    rows: dealRes.data as Deal[] | null,
    // The raw message says WHAT ("JWT issued at future") and not WHERE. The
    // diagnosis names the client, the key scheme and the actual fix.
    error: dealRes.error
      ? {
          message: explainFailure({
            client: 'service-role',
            message: dealRes.error.message,
            key: keyShape(process.env.SUPABASE_SERVICE_ROLE_KEY),
          }),
        }
      : null,
  });

  const items = (feedRes.data ?? []) as FeedItem[];
  const deals = (dealRes.data ?? []) as Deal[];

  // RANKED EVEN WHEN THE DEALS READ FAILED. Without deals nothing maps to an
  // account, so the ranking falls back to provenance and recency — narrower,
  // still useful, and `deal_state` says why it is narrower. Refusing to rank
  // would be a hard gate, and there are none here.
  const headlines = rankHeadlines(items, deals, Date.now(), {
    limit: 12,
    // A failed read must not make the ranker claim every mapping is dangling.
    dealsReadable: dealState.kind !== 'unreadable',
  });

  return NextResponse.json({
    headlines,
    summary: headlineSummary(headlines),
    feed_state: feedState,
    feed_copy: describeSeedState(feedState, 'swept items'),
    deal_state: dealState,
    deal_copy: describeSeedState(dealState, 'deals'),
    /**
     * Reported so the count on screen is auditable against the table. A view
     * that shows 12 of 60 without saying so reads as "there are 12".
     */
    considered: items.length,
  });
}
