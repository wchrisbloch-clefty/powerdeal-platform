import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { describeReadFailure } from '@/lib/data';
import type { MapPlan } from './schedule';


/**
 * MAP persistence.
 *
 * Lives in app_state keyed per deal rather than on deals.artifacts: a MAP is a
 * living object edited many times, and rewriting the whole artifacts array on
 * every milestone drag would make an edit-heavy surface fight a
 * read-modify-write on a column that also holds briefs and scenarios.
 */

export const mapKey = (dealId: string) => `map:${dealId}`;

/** Distinguishes "no plan stored" from "the store did not answer". */
export class MapReadFailure extends Error {}

export async function getMapPlan(dealId: string): Promise<MapPlan | null> {
  const client = getAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from('app_state')
    .select('value')
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('key', mapKey(dealId))
    .maybeSingle();

  /*
    ⚠️ THE FALLBACK IS A GOOD ONE, WHICH IS EXACTLY THE PROBLEM. null sends the
    panel to `starterPlan`, a real and useful sequence — so a refused read
    renders as a deal nobody has planned yet, complete with a sensible plan.
    The most convincing wrong answer of the twelve.

    Thrown rather than returned so the caller cannot ignore it silently; the
    deal page already wraps this in a catch.
  */
  if (error) throw new MapReadFailure(describeReadFailure(error.message));

  return (data?.value as MapPlan) ?? null;
}

export async function saveMapPlan(
  dealId: string,
  plan: MapPlan,
): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await client
    .from('app_state')
    .upsert(
      {
        key: mapKey(dealId),
        // Never null — app_state.value is jsonb NOT NULL, and an empty plan is
        // an empty milestone array, not an absent row.
        value: { ...plan, updatedAt: new Date().toISOString() },
        user_id: POWERDEAL_USER_ID,
      },
      { onConflict: 'user_id,key' },
    );

  return error ? { ok: false, error: error.message } : { ok: true };
}
