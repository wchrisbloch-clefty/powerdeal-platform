import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { isCronAuthorized } from '@/lib/cron-auth';
import { buildWeeklyRecap, storeRecap } from '@/lib/engine/recap';
import { recordAgentRun } from '@/lib/agent-runs';
import type { Deal, UserSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';
// A week of rows plus one narrative call, per user.
export const maxDuration = 300;

/**
 * GET /api/cron/recap — the scheduled weekly recap (Market Watch Tier 2).
 *
 * Cron-only. Vercel Cron issues GET, and an unauthenticated caller must not be
 * able to trigger a model call for every user. On-demand regeneration for the
 * operator lives on /api/recap instead.
 *
 * The result is stored in app_state rather than a new table, for the same
 * reason feed triage state is: a schema change would mean running migration SQL
 * before the feature works at all, and there is exactly one current recap per
 * user.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const service = getAdminClient();
  if (!service) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required for scheduled recaps.' },
      { status: 503 },
    );
  }

  // Cron covers every user, so this deliberately does not scope to the single
  // operator — it iterates user_settings itself.
  const startedAt = Date.now();
  const { data: settingsRows } = await service.from('user_settings').select('*');
  const users = (settingsRows ?? []) as UserSettings[];
  const results: Record<string, string> = {};

  for (const settings of users) {
    // Someone who switched the weekly recap off should not have one generated,
    // let alone be billed a model call for it.
    if (settings.notify_weekly_recap === false) {
      results[settings.user_id] = 'skipped — recap disabled';
      continue;
    }

    try {
      const { data: deals } = await service
        .from('deals')
        .select('*')
        .eq('user_id', settings.user_id);

      const recap = await buildWeeklyRecap(service, settings.user_id, (deals ?? []) as Deal[]);
      await storeRecap(service, settings.user_id, recap);
      results[settings.user_id] =
        `${recap.totalItems} items, ${recap.accountsHit.length} accounts`;
    } catch (err) {
      // One user's failure must not abort the rest of the run.
      results[settings.user_id] = `failed: ${(err as Error).message}`;
    }
  }

  const failed = Object.values(results).filter((r) => r.startsWith('failed:'));
  const items = Object.values(results).reduce((n, r) => {
    const m = r.match(/^(\d+) items/);
    return n + (m ? Number(m[1]) : 0);
  }, 0);
  await recordAgentRun('weekly-recap', {
    ok: failed.length === 0,
    durationMs: Date.now() - startedAt,
    itemsProcessed: items,
    error: failed.length > 0 ? failed[0] : null,
  });

  return NextResponse.json({ recapped_users: users.length, results });
}

