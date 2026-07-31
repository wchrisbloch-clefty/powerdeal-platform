import { NextResponse } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';
import {
  buildWeeklyRecap,
  storeRecap,
  RECAP_STATE_KEY,
  type WeeklyRecap,
} from '@/lib/engine/recap';
import type { Deal } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/recap — the stored weekly recap, for whichever surface renders it.
 *
 * Reads only. Generating on read would mean a model call every time someone
 * opened the page, which is the opposite of what a weekly artifact should cost.
 * `stale` lets the caller say so honestly when the cron has not run recently.
 */
export async function GET() {
  const stored = await getAppState<WeeklyRecap>(RECAP_STATE_KEY);
  if (!stored) return NextResponse.json({ recap: null, stale: false });

  const ageDays = (Date.now() - Date.parse(stored.generatedAt)) / 86_400_000;
  return NextResponse.json({ recap: stored, stale: ageDays > 8 });
}

/** POST /api/recap — regenerate now, without waiting for the cron. */
export async function POST() {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured — the recap reads persisted sweep rows.' },
      { status: 503 },
    );
  }

  try {
    const { data: deals } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', POWERDEAL_USER_ID);

    const recap = await buildWeeklyRecap(supabase, POWERDEAL_USER_ID, (deals ?? []) as Deal[]);
    await storeRecap(supabase, POWERDEAL_USER_ID, recap);
    return NextResponse.json({ recap, stale: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Recap failed.' },
      { status: 500 },
    );
  }
}
