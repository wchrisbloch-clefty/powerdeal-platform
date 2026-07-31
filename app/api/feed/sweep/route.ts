import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { runSweep } from '@/lib/engine/sweep';
import { isCronAuthorized } from '@/lib/cron-auth';
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
  // ── Cron path ──
  if (isCronAuthorized(request)) {
    // Cron sweeps every user, so this is the one place that deliberately does
    // NOT scope to POWERDEAL_USER_ID — it iterates user_settings itself.
    const service = getAdminClient();
    if (!service) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is required for scheduled sweeps.' },
        { status: 503 },
      );
    }

    const { data: settingsRows } = await service.from('user_settings').select('*');
    const users = (settingsRows ?? []) as UserSettings[];
    const results: Record<string, unknown> = {};

    for (const settings of users) {
      const { data: deals } = await service
        .from('deals')
        .select('*')
        .eq('user_id', settings.user_id);

      results[settings.user_id] = await runSweep(
        service,
        settings.user_id,
        (deals ?? []) as Deal[],
        { sourcePrefs: settings.source_prefs },
      );
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
