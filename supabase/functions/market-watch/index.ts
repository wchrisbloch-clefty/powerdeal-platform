import { isAuthorized, unauthorized, ok, serverError } from '../_shared/auth.ts';
import { contractStamp } from '../_shared/contract.ts';
import { serviceClient, listUsers, listDeals, writeState } from '../_shared/appState.ts';
import { recordAgentRun } from '../_shared/appState.ts';
import { callClaude, parseJsonArray, anthropicConfigured } from '../_shared/anthropic.ts';
import { POWERDEAL_IDENTITY } from '../_shared/identity.ts';

/**
 * Weekly Market Watch sweep — Friday 8am CT (13:00 UTC).
 *
 * Delegates the fetch/grade/map pipeline to the app's /api/feed/sweep, which
 * already owns the RSS engine, the tiering rules, and the summary cache.
 * Reimplementing that here would mean two copies of the grading logic drifting
 * apart. This function's own job is the weekly ROLLUP: what the week's signals
 * mean, ranked, with the accounts to call.
 */
Deno.serve(async (request: Request) => {
  const startedAt = Date.now();
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = serviceClient();
    const appUrl = Deno.env.get('APP_URL');
    const cronSecret = Deno.env.get('CRON_SECRET');

    // ── 1. Trigger the sweep in the app ──
    // Vercel Deployment Protection guards *.vercel.app by default, so this
    // call gets a 401 from Vercel's edge before the route runs. Vercel Cron
    // invocations are exempt; an external POST from here is not. Set
    // VERCEL_PROTECTION_BYPASS (Vercel → Settings → Deployment Protection →
    // Protection Bypass for Automation) to get through it, or serve the app
    // from a custom domain, which the default policy exempts.
    let sweepResult: unknown = null;
    let sweepError: string | null = null;
    if (appUrl && cronSecret) {
      try {
        const headers: Record<string, string> = { 'x-cron-secret': cronSecret };
        const bypass = Deno.env.get('VERCEL_PROTECTION_BYPASS');
        if (bypass) headers['x-vercel-protection-bypass'] = bypass;

        const res = await fetch(`${appUrl}/api/feed/sweep`, { method: 'POST', headers });
        if (res.ok) {
          sweepResult = await res.json();
        } else {
          sweepError = res.status === 401
            ? 'sweep 401 — CRON_SECRET mismatch, or Vercel Deployment Protection is blocking the call (set VERCEL_PROTECTION_BYPASS)'
            : `sweep ${res.status}`;
          sweepResult = { error: sweepError };
        }
      } catch (err) {
        sweepError = (err as Error).message;
        sweepResult = { error: sweepError };
      }
    } else {
      sweepError = 'APP_URL and CRON_SECRET are required to trigger a sweep.';
      sweepResult = { skipped: sweepError };
    }

    // ── 2. Per-user weekly rollup ──
    const users = await listUsers(supabase);
    // One record per job, not per user — the status page asks whether the
    // job ran, not whether it ran for a particular row.
    const ownerForRecord = users[0]?.user_id ?? '';
    const summaries: Record<string, unknown> = {};
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    for (const user of users) {
      if (!user.notify.market_watch) continue;

      const [deals, { data: watchRows }] = await Promise.all([
        listDeals(supabase, user.user_id),
        supabase
          .from('market_watch_log')
          .select('category, headline, summary, source_tier, impact_rank, deal_ids, outreach_hook')
          .eq('user_id', user.user_id)
          .gte('swept_at', weekAgo)
          .order('impact_rank', { ascending: false })
          .limit(40),
      ]);

      const entries = watchRows ?? [];

      if (entries.length === 0) {
        const state = {
          generated_at: new Date().toISOString(),
          items: 0,
          note: 'No market watch entries this week.',
        };
        await writeState(supabase, user.user_id, 'market_watch_latest', state);
        summaries[user.user_id] = state;
        continue;
      }

      let rollup = '';
      if (anthropicConfigured()) {
        const roster = deals
          .map((d) => `${d.deal_id}|${d.company}|${d.vertical}|${d.state ?? '—'}|${d.utility ?? '—'}`)
          .join('\n');

        const feed = entries
          .map(
            (e, i) =>
              `[${i + 1}] (${e.source_tier}, impact ${e.impact_rank}) ${e.headline}` +
              (e.summary ? `\n    ${String(e.summary).slice(0, 300)}` : ''),
          )
          .join('\n');

        rollup = await callClaude({
          system: POWERDEAL_IDENTITY,
          maxTokens: 2500,
          user: `Write this week's Market Watch rollup.

Structure:
1. THE WEEK IN ONE LINE — the single most consequential thing that happened for this pipeline.
2. RANKED SIGNALS — the 5 that matter most, each with the accounts it hits and the specific reason to reach out. Skip anything with no account impact.
3. PEER RADAR — companies named in the signals that are NOT in the roster and look like prospects.
4. WHAT TO DO MONDAY — three actions, each tied to a named account.

Only use facts present in the entries below. Never state a rate, price, or timeline that does not appear there.

PIPELINE ROSTER (deal_id|company|vertical|state|utility):
${roster || '(no active deals)'}

THIS WEEK'S ENTRIES:
${feed}`,
        });
      }

      const accountsHit = new Set<string>();
      for (const e of entries) {
        for (const id of (e.deal_ids as string[] | null) ?? []) {
          const deal = deals.find((d) => d.id === id);
          if (deal) accountsHit.add(deal.company);
        }
      }

      const state = {
        generated_at: new Date().toISOString(),
        items: entries.length,
        accounts_hit: [...accountsHit],
        top_hooks: entries
          .filter((e) => e.outreach_hook)
          .slice(0, 5)
          .map((e) => ({ headline: e.headline, hook: e.outreach_hook })),
        rollup: rollup || 'ANTHROPIC_API_KEY not set — rollup skipped.',
      };

      await writeState(supabase, user.user_id, 'market_watch_latest', state);
      summaries[user.user_id] = { items: entries.length, accounts: accountsHit.size };
    }

    // A failed sweep is a failed run, even though the rollup above still wrote.
    // Reporting ok:true here would put "healthy" on the status page for a job
    // whose entire purpose — refreshing the feed the rollup reads — did not
    // happen. The rollup would then summarise last week's data every week,
    // and nothing anywhere would say so.
    await recordAgentRun(supabase, ownerForRecord, 'market-watch', {
      ok: !sweepError,
      durationMs: Date.now() - startedAt,
      itemsProcessed: Object.keys(summaries).length,
      ...(sweepError ? { error: sweepError } : {}),
    });

    return ok({
      ...contractStamp(),
      ran_at: new Date().toISOString(),
      sweep: sweepResult,
      users: Object.keys(summaries).length,
      summaries,
    });
  } catch (err) {
    // Recorded on the failure path as well — an unrecorded failure looks
    // exactly like a job that was never deployed.
    try {
      const client = serviceClient();
      // error-blind-ok: this is the FAILURE path's bookkeeping. It runs inside a
      // catch whose only job is recording that the run failed, and it is itself
      // wrapped in a catch so a second failure cannot mask the first. Inspecting
      // this error would have nowhere to report it that is not the error we are
      // already reporting.
      const { data } = await client.from('user_settings').select('user_id').limit(1).maybeSingle();
      await recordAgentRun(client, (data?.user_id as string) ?? '', 'market-watch', {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch { /* bookkeeping must never mask the original error */ }
    return serverError(err);
  }
});
