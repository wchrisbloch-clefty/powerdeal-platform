import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { canRun } from '@/lib/engine/model-routing';
import { summarizeItem } from '@/lib/engine/summarize';
import { fetchContent } from '@/lib/engine/fetch-content';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/feed/resummarize — fill in summaries the sweep could not produce.
 *
 * WHY IT EXISTS. Sixty items landed on the first working sweep and 33 of them
 * stored with a null `synthesis`, on an afternoon when Gemini was retired and
 * Groq was at 99.5% of its daily ceiling. Those items are correct as stored —
 * the summary is an enhancement, the item is the artifact — but once a working
 * model is configured there was no way to go back for them short of waiting
 * 24 hours for the cache to expire and re-running the whole sweep.
 *
 * WHAT IT DOES NOT DO. It does not run on a schedule and it is not wired to a
 * button that fires on page load. It is invoked deliberately, it is capped,
 * and it reports what it found.
 *
 * ══ A NULL SUMMARY HAS THREE CAUSES AND THIS ROUTE TELLS THEM APART ══
 *
 *   not-relevant — the model read it and returned its NOT RELEVANT sentinel.
 *                  Working as designed. Stays null.
 *   summarized   — a model was unavailable last time and is available now.
 *   failed       — still unavailable. Named with the provider error.
 *
 * That breakdown is the answer to "why are 33 missing", and it is not
 * knowable from the rows themselves. Before this route the only way to ask was
 * to spend the tokens and watch.
 *
 * ⚠️ KNOWN LIMITATION, STATED RATHER THAN HIDDEN. `feed_items` has no column
 * recording WHY a synthesis is null, so a re-run re-spends tokens on the
 * not-relevant items. That is why it is capped and manual instead of a cron.
 * Fixing it properly needs a `summary_state` column; adding one was not worth
 * a migration against a live table for a route that runs by hand. The count in
 * the response tells the operator how much of a re-run would be wasted.
 */

/** Bounded by default. A backfill that can spend unbounded tokens is a bill. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface Outcome {
  id: string;
  title: string;
  result: 'summarized' | 'not-relevant' | 'failed';
  detail?: string;
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to read and update feed_items.' },
      { status: 503 },
    );
  }

  // ⚠️ REPORTED, NEVER ENFORCED. With no provider configured this returns the
  // count of missing summaries and does no work — it does not 503, because
  // "how many are missing" is a useful answer on its own and refusing to give
  // it is the hard gate this build does not have anywhere.
  const aiAvailable = canRun('summarize');

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit')) || DEFAULT_LIMIT),
  );

  // `count: 'exact'` on a separate query so the total is the TOTAL, not the
  // page. Reporting "25 missing" when 33 are missing would make a capped run
  // look like a complete one.
  const { count: totalMissing, error: countError } = await supabase
    .from('feed_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', POWERDEAL_USER_ID)
    .is('synthesis', null);

  if (countError) {
    return NextResponse.json(
      { error: `Could not count missing summaries: ${countError.message}` },
      { status: 500 },
    );
  }

  if (!aiAvailable) {
    return NextResponse.json({
      ran: false,
      total_missing: totalMissing ?? 0,
      reason:
        'No AI provider is configured, so nothing was re-summarized. The count is still accurate.',
      outcomes: [],
    });
  }

  const { data: rows, error: readError } = await supabase
    .from('feed_items')
    .select('id, title, url, source_name')
    .eq('user_id', POWERDEAL_USER_ID)
    .is('synthesis', null)
    .order('cached_at', { ascending: false })
    .limit(limit);

  if (readError) {
    return NextResponse.json(
      { error: `Could not read feed_items: ${readError.message}` },
      { status: 500 },
    );
  }

  const outcomes: Outcome[] = [];

  // Sequential on purpose, same reason the sweep is: the free tiers rate-limit,
  // and a backfill that gets itself throttled halfway is a backfill that has to
  // be run again.
  for (const row of rows ?? []) {
    const item = row as { id: string; title: string; url: string | null; source_name: string | null };
    try {
      const content = await fetchContent(item.url ?? '', '');
      const summary = await summarizeItem(
        {
          title: item.title,
          content: content.text,
          url: item.url ?? undefined,
          source: item.source_name ?? undefined,
        },
        'summary',
        // Deliberately no client: the cache read looks for a NON-null synthesis
        // on this exact URL, and every row here has a null one. Passing it
        // would cost a query per item to learn what we already know.
        null,
      );

      const text = summary.text.trim();
      if (text === 'NOT RELEVANT' || text === '') {
        outcomes.push({
          id: item.id,
          title: item.title,
          result: 'not-relevant',
          detail: 'The model read it and judged it off-topic. Left null, which is correct.',
        });
        continue;
      }

      // supabase-js RESOLVES with `{ error }`. An unchecked update here would
      // report "summarized" for a row that never changed.
      const { error: writeError } = await supabase
        .from('feed_items')
        .update({ synthesis: summary.text })
        .eq('id', item.id)
        .eq('user_id', POWERDEAL_USER_ID);

      if (writeError) {
        outcomes.push({
          id: item.id,
          title: item.title,
          result: 'failed',
          detail: `Summarized, but the write failed: ${writeError.message}`,
        });
        continue;
      }

      outcomes.push({ id: item.id, title: item.title, result: 'summarized' });
    } catch (err) {
      outcomes.push({
        id: item.id,
        title: item.title,
        result: 'failed',
        detail: (err as Error).message,
      });
    }
  }

  const tally = {
    summarized: outcomes.filter((o) => o.result === 'summarized').length,
    not_relevant: outcomes.filter((o) => o.result === 'not-relevant').length,
    failed: outcomes.filter((o) => o.result === 'failed').length,
  };

  return NextResponse.json({
    ran: true,
    total_missing: totalMissing ?? 0,
    attempted: outcomes.length,
    remaining: Math.max(0, (totalMissing ?? 0) - tally.summarized),
    tally,
    outcomes,
    note:
      tally.not_relevant > 0
        ? `${tally.not_relevant} item(s) are null because the model judged them off-topic, not because a model was down. Re-running will re-spend tokens on those — there is no column recording the distinction.`
        : undefined,
  });
}

/**
 * GET — the count, without spending anything.
 *
 * Separated from POST so "how many are missing" is answerable without deciding
 * to pay for the answer.
 */
export async function GET() {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }, { status: 503 });
  }

  const [{ count: missing, error: missingError }, { count: total, error: totalError }] =
    await Promise.all([
      supabase
        .from('feed_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', POWERDEAL_USER_ID)
        .is('synthesis', null),
      supabase
        .from('feed_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', POWERDEAL_USER_ID),
    ]);

  const error = missingError ?? totalError;
  if (error) {
    return NextResponse.json({ error: `Could not count: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    total: total ?? 0,
    missing_summary: missing ?? 0,
    ai_configured: canRun('summarize'),
  });
}
