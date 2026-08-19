import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { runSweep, sweepError } from '@/lib/engine/sweep';
import { isCronAuthorized } from '@/lib/cron-auth';
import { recordAgentRun } from '@/lib/agent-runs';
import type { Deal, UserSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';
// A cold sweep fetches ~17 feeds and summarizes up to 60 items.
export const maxDuration = 300;

/**
 * GET /api/feed/sweep — the cron entry point.
 *
 * Vercel Cron issues GET, so the scheduled job could never have reached the
 * POST handler below. Authorization is required here with no interactive
 * fallback: an unauthenticated GET must not be able to trigger a full sweep.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return POST(request);
}

/**
 * POST /api/feed/sweep — pull every configured source, grade, map, store.
 *
 * The feed no longer waits on this. /app/intelligence fetches its own sources
 * on load, so the sweep's job is PERSISTENCE: writing notable items to
 * feed_items and market_watch_log so trends accumulate over time and the weekly
 * recap has material to work from. Nothing a reader sees on arrival depends on
 * it having run.
 *
 * Two callers:
 *   · The cron, with the CRON_SECRET header — sweeps every user.
 *   · The operator pressing "Sweep" — scoped to the single account.
 */
export async function POST(request: NextRequest) {
  // Per-request, not module scope — a module-level constant would measure time
  // since the lambda booted, which is not the run's duration.
  const startedAt = Date.now();
  // ── Cron path ──
  if (isCronAuthorized(request)) {
    // Cron sweeps every user, so this is the one place that deliberately does
    // NOT scope to POWERDEAL_USER_ID — it iterates user_settings itself.
    const service = getAdminClient();
    if (!service) {
      // RECORD THE REFUSAL. This path returned 503 and wrote nothing, so a
      // missing service key and a job that never fired produced the same
      // evidence: no `feed-sweep` entry at all. Every other job had one.
      await recordAgentRun('feed-sweep', {
        ok: false,
        durationMs: Date.now() - startedAt,
        itemsProcessed: 0,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not set — the scheduled sweep cannot run.',
      });
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is required for scheduled sweeps.' },
        { status: 503 },
      );
    }

    const results: Record<string, unknown> = {};
    let users: UserSettings[] = [];
    /**
     * ⚠️ A THROW USED TO SKIP THE RECORD ENTIRELY.
     *
     * `runSweep` was awaited inside the loop with nothing around it, so any
     * throw — a Supabase read that rejects, a parser that dies on one feed —
     * escaped the handler and jumped past `recordAgentRun` below. The comment
     * there says "recorded whether or not it worked", and that was true only
     * of paths that REACHED it.
     *
     * The observable result is the one we have: `agents:runs` holds an entry
     * for every job except this one. Not a failure counter climbing — no key
     * at all, which reads as "never scheduled" rather than "fails every time".
     *
     * Same class as the `app_state` write that resolved with `{ error }`:
     * checklist rule 9, a health surface that cannot distinguish "did not run"
     * from "could not record that it ran".
     */
    let thrown: string | null = null;
    try {
      const { data: settingsRows, error: settingsError } = await service
        .from('user_settings')
        .select('*');
      if (settingsError) throw new Error(`user_settings read failed: ${settingsError.message}`);
      users = (settingsRows ?? []) as UserSettings[];

      for (const settings of users) {
        // The settings read two lines up already throws on error; this one did
        // not, so a refused deals read swept the feed against an empty pipeline
        // and reported "0 items mapped" as a successful sweep.
        const { data: deals, error: dealsError } = await service
          .from('deals')
          .select('*')
          .eq('user_id', settings.user_id);
        if (dealsError) {
          throw new Error(`deals read failed for ${settings.user_id}: ${dealsError.message}`);
        }

        results[settings.user_id] = await runSweep(
          service,
          settings.user_id,
          (deals ?? []) as Deal[],
          { sourcePrefs: settings.source_prefs },
        );
      }
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }

    // Recorded whether or not it worked — an unrecorded failure is
    // indistinguishable from a job that never ran.
    //
    // ⚠️ THE ERROR TEXT IS THE DIAGNOSIS, AND IT USED TO BE THROWN AWAY.
    // This counted the users whose sweep reported errors and recorded
    // "1 of 1 user sweeps reported errors" — true, and useless. runSweep
    // already returns the real messages ("Reuters Energy: 404", "Store failed:
    // ...", "No items returned"), and every one was discarded at exactly the
    // point somebody would go looking. Ten consecutive failures produced ten
    // identical, unactionable records.
    //
    // Deduplication and capping live inside sweepError, not here — a transform
    // applied at the call site is a transform no test can reach, and the
    // mutation that removed it from this line passed the suite.
    const failing = Object.values(results).filter(
      (r) => (r as { errors?: string[] }).errors?.length,
    );
    const messages = failing.flatMap((r) => (r as { errors?: string[] }).errors ?? []);
    const items = Object.values(results).reduce<number>(
      (n, r) => n + ((r as { new_items?: number }).new_items ?? 0),
      0,
    );
    await recordAgentRun('feed-sweep', {
      ok: thrown === null && failing.length === 0,
      durationMs: Date.now() - startedAt,
      itemsProcessed: items,
      error: thrown
        ? `Sweep threw before completing: ${thrown}`
        : sweepError(failing.length, users.length, messages),
    });

    // ZERO USERS IS NOT A SUCCESS. An empty `user_settings` table skipped the
    // loop, reported no failures, and would have recorded ok:true with nothing
    // swept — a green job that did nothing, which is the shape this build
    // keeps finding.
    if (thrown === null && users.length === 0) {
      await recordAgentRun('feed-sweep', {
        ok: false,
        durationMs: Date.now() - startedAt,
        itemsProcessed: 0,
        error: 'No rows in user_settings — the sweep had nobody to sweep for.',
      });
    }

    if (thrown) {
      return NextResponse.json({ error: thrown, swept_users: users.length }, { status: 500 });
    }
    return NextResponse.json({ swept_users: users.length, results });
  }

  // ── Interactive path ──
  // No session to read: sign-in was removed, so this runs as the service role
  // scoped to the single operator. Both queries filter user_id explicitly
  // because that bypasses RLS.
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured — swept items need somewhere to persist.' },
      { status: 503 },
    );
  }

  const [{ data: deals }, { data: settings }] = await Promise.all([
    supabase.from('deals').select('*').eq('user_id', POWERDEAL_USER_ID),
    supabase
      .from('user_settings')
      .select('source_prefs')
      .eq('user_id', POWERDEAL_USER_ID)
      .maybeSingle(),
  ]);

  try {
    const result = await runSweep(supabase, POWERDEAL_USER_ID, (deals ?? []) as Deal[], {
      sourcePrefs: (settings?.source_prefs as UserSettings['source_prefs']) ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sweep failed.' },
      { status: 500 },
    );
  }
}
