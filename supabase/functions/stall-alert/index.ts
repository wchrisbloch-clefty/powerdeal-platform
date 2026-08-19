import { isAuthorized, unauthorized, ok, serverError } from '../_shared/auth.ts';
import { serviceClient, listUsers, listDeals, writeState, type DealRow } from '../_shared/appState.ts';
import { recordAgentRun } from '../_shared/appState.ts';

/**
 * Daily stall detection — 7am CT (12:00 UTC).
 *
 * Two jobs:
 *   1. Increment days_in_stage on every in-flight deal. The column is the
 *      input to the health score, so if nothing ticks it, health silently
 *      stops degrading and a dead deal keeps looking alive.
 *   2. Diagnose deals past the stall threshold and write the alert.
 *
 * The diagnosis is rule-based, not model-generated. The cause of a stall is
 * almost always structural and visible in the record — no economic buyer, one
 * thread, an unmapped decision process. A model call here would spend tokens
 * to restate what the columns already say, and would occasionally invent a
 * reason that isn't in the data.
 */

const STALL_DAYS = 30;
const CRITICAL_DAYS = 60;

interface StallAlert {
  deal_id: string;
  company: string;
  stage: string;
  days_in_stage: number;
  health_score: number;
  severity: 'warning' | 'critical';
  diagnosis: string;
  next_step: string;
}

Deno.serve(async (request: Request) => {
  const startedAt = Date.now();
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = serviceClient();
    const users = await listUsers(supabase);
    const summary: Record<string, unknown> = {};

    for (const user of users) {
      const deals = await listDeals(supabase, user.user_id);

      // ── 1. Tick the clock ──
      // One statement per deal keeps the health-score trigger firing, which is
      // the point — a bulk UPDATE that skipped the trigger would leave health
      // stale exactly when it should be dropping.
      //
      // ⚠️ THIS UPDATE IGNORED ITS ERROR, AND IT IS THE WORST PLACE IN EITHER
      // RUNTIME TO DO THAT. supabase-js resolves with `{ error }` rather than
      // throwing, so a refused write left the loop finishing normally, the
      // state written, the run recorded ok, and 200 returned — while
      // days_in_stage never advanced.
      //
      // schedule.sql already names this as the symptom to check first: "if
      // this job stops running, health scores silently stop degrading and
      // stalled deals keep looking healthy." An unchecked write produces
      // exactly that WITHOUT the job stopping, so the one diagnostic the
      // comment points at reports green.
      //
      // Thrown, not collected: a tick that only partly landed leaves the book
      // in a state where some deals aged and some did not, which is worse to
      // reason about than a run that failed outright and can be re-fired.
      for (const deal of deals) {
        const { error } = await supabase
          .from('deals')
          .update({ days_in_stage: deal.days_in_stage + 1 })
          .eq('id', deal.id);
        if (error) {
          throw new Error(
            `days_in_stage tick failed on ${deal.deal_id} (${deal.id}): ${error.message}. ` +
              `Aborting before the tick lands on only part of the book.`,
          );
        }
      }

      /*
        ⚠️ THIS `continue` USED TO SKIP THE STATE WRITE TOO, so a user who had
        turned the alert off and a user whose job had died left the same trace:
        a `stall_alerts_latest` key that stopped moving. Smaller consequence
        than the ccus_latest case — the operator chose this — and the same
        defect, which is the point: one key carrying two facts.

        The tick above still ran for them. That is deliberate: days_in_stage
        feeds the health score whether or not anybody wants an alert about it.
      */
      if (!user.notify.stall_alert) {
        await writeState(supabase, user.user_id, 'stall_alerts_latest', {
          generated_at: new Date().toISOString(),
          checked: deals.length,
          stalled: null,
          notifications_enabled: false,
          note: 'Stall alerts are switched off for this account. The day counter still advanced.',
        });
        summary[user.user_id] = { checked: deals.length, stalled: 'disabled' };
        continue;
      }

      // ── 2. Diagnose ──
      const alerts = deals
        .map((d) => ({ ...d, days_in_stage: d.days_in_stage + 1 }))
        .filter((d) => d.days_in_stage > STALL_DAYS)
        .map(diagnose)
        .sort((a, b) => b.days_in_stage - a.days_in_stage);

      const state = {
        generated_at: new Date().toISOString(),
        checked: deals.length,
        stalled: alerts.length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        notifications_enabled: true,
        alerts,
      };

      await writeState(supabase, user.user_id, 'stall_alerts_latest', state);
      summary[user.user_id] = { checked: deals.length, stalled: alerts.length };
    }

    await recordAgentRun(supabase, users[0]?.user_id ?? '', 'stall-alert', {
      ok: true,
      durationMs: Date.now() - startedAt,
      itemsProcessed: Object.keys(summary).length,
    });
    return ok({ ran_at: new Date().toISOString(), users: users.length, summary });
  } catch (err) {
    // Recorded on the failure path as well — an unrecorded failure looks
    // exactly like a job that was never deployed.
    try {
      const supabase = serviceClient();
      // error-blind-ok: this is the FAILURE path's bookkeeping. It runs inside a
      // catch whose only job is recording that the run failed, and it is itself
      // wrapped in a catch so a second failure cannot mask the first. Inspecting
      // this error would have nowhere to report it that is not the error we are
      // already reporting.
      const { data } = await supabase.from('user_settings').select('user_id').limit(1).maybeSingle();
      await recordAgentRun(supabase, (data?.user_id as string) ?? '', 'stall-alert', {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch { /* bookkeeping must never mask the original error */ }
    return serverError(err);
  }
});

/**
 * Name the most likely structural cause, most-blocking first.
 *
 * Order matters: no economic buyer outranks single-threading, because a deal
 * with three contacts and nobody who can sign is stalled for a different
 * reason than one with a signer and a single thread.
 */
function diagnose(deal: DealRow): StallAlert {
  const severity: StallAlert['severity'] =
    deal.days_in_stage > CRITICAL_DAYS ? 'critical' : 'warning';

  let diagnosis: string;
  let nextStep: string;

  if (!deal.economic_buyer) {
    diagnosis =
      'No economic buyer identified. The deal is likely sitting with someone who cannot say yes.';
    nextStep = `Ask ${deal.champion ?? 'your contact'} directly: who signs, and what is their approval limit?`;
  } else if (!deal.multi_threaded) {
    diagnosis =
      'Single-threaded. Progress depends entirely on one person, and that person has gone quiet.';
    nextStep =
      'Get a second contact this week — operations or sustainability. Health is capped at 6 until you do.';
  } else if (!deal.decision_mapped) {
    diagnosis =
      'Decision process unmapped. You cannot forecast a close date because nobody has confirmed the steps.';
    nextStep = 'Build a MAP and walk it through with the champion. Find the committee and the security gate.';
  } else if (!deal.champion) {
    diagnosis = 'No champion. Nobody inside the account is selling this when you are not in the room.';
    nextStep = 'Identify who benefits most from this landing, and give them something to carry.';
  } else if (deal.days_in_stage > CRITICAL_DAYS) {
    diagnosis = `${deal.days_in_stage} days in ${deal.stage} with the fundamentals in place. The compelling event is missing.`;
    nextStep =
      'Find the deadline — a rate increase, a permit expiry, a capex cycle — or disqualify and free the time.';
  } else {
    diagnosis = `${deal.days_in_stage} days in ${deal.stage} with no logged movement.`;
    nextStep = deal.next_move ?? 'Set an explicit next move with a date, or move this to no-decision.';
  }

  return {
    deal_id: deal.deal_id,
    company: deal.company,
    stage: deal.stage,
    days_in_stage: deal.days_in_stage,
    health_score: deal.health_score,
    severity,
    diagnosis,
    next_step: nextStep,
  };
}
