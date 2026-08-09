import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
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

export async function getMapPlan(dealId: string): Promise<MapPlan | null> {
  const client = getAdminClient();
  if (!client) return null;

  const { data } = await client
    .from('app_state')
    .select('value')
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('key', mapKey(dealId))
    .maybeSingle();

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
