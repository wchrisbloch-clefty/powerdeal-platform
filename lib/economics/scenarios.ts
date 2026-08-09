import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';
import type { Deal, DealArtifact } from '@/lib/types';
import type { Scenario } from './types';

/**
 * SCENARIO PERSISTENCE
 *
 * Scenarios attached to a deal live in `deals.artifacts` with
 * type: 'economics-scenario', so the deal page shows the economics work
 * alongside briefs and plans rather than in a parallel place nobody opens.
 *
 * `artifacts` is jsonb, so carrying the full input set on the artifact needs no
 * migration. The artifact's `url` is a working deep-link back into the module
 * with the scenario loaded — an artifact row whose link does nothing is a dead
 * entry in a list the operator learns to skip.
 *
 * Scenarios pinned without a deal (exploratory modelling) live in app_state.
 * They are not lost, and they can be attached to a deal later.
 */

export const SCENARIO_ARTIFACT_TYPE = 'economics-scenario';
export const LOOSE_SCENARIOS_KEY = 'economics:scenarios';

export function scenarioHref(scenario: Scenario): string {
  const params = new URLSearchParams({ scenario: scenario.id });
  if (scenario.dealId) params.set('deal', scenario.dealId);
  return `/app/economics?${params.toString()}`;
}

function toArtifact(scenario: Scenario): DealArtifact {
  return {
    type: SCENARIO_ARTIFACT_TYPE,
    label: scenario.name,
    url: scenarioHref(scenario),
    format: 'json',
    created_at: scenario.createdAt,
    data: scenario as unknown as Record<string, unknown>,
  };
}

/** Scenarios saved against a deal, newest first. */
export function scenariosOn(deal: Pick<Deal, 'artifacts'>): Scenario[] {
  return (deal.artifacts ?? [])
    .filter((a) => a.type === SCENARIO_ARTIFACT_TYPE && a.data)
    .map((a) => a.data as unknown as Scenario)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Attach a scenario to a deal.
 *
 * Read-modify-write on the artifacts array. Same single-operator trade as
 * feed-state: a lock would cost more than the race it prevents here.
 * Re-saving a scenario with an existing id REPLACES it, so editing a pinned
 * scenario does not leave a trail of near-identical entries on the deal.
 */
export async function saveScenarioToDeal(
  dealId: string,
  scenario: Scenario,
): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { data: deal, error: readErr } = await client
    .from('deals')
    .select('id, artifacts')
    .eq('id', dealId)
    .eq('user_id', POWERDEAL_USER_ID)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  if (!deal) return { ok: false, error: 'Deal not found.' };

  const existing: DealArtifact[] = (deal.artifacts as DealArtifact[]) ?? [];
  const withScenario = { ...scenario, dealId };
  const next = [
    ...existing.filter(
      (a) =>
        !(
          a.type === SCENARIO_ARTIFACT_TYPE &&
          (a.data as unknown as Scenario | undefined)?.id === scenario.id
        ),
    ),
    toArtifact(withScenario),
  ];

  const { error: writeErr } = await client
    .from('deals')
    .update({ artifacts: next, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('user_id', POWERDEAL_USER_ID);

  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}

export async function removeScenarioFromDeal(
  dealId: string,
  scenarioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { data: deal } = await client
    .from('deals')
    .select('id, artifacts')
    .eq('id', dealId)
    .eq('user_id', POWERDEAL_USER_ID)
    .maybeSingle();
  if (!deal) return { ok: false, error: 'Deal not found.' };

  const next = ((deal.artifacts as DealArtifact[]) ?? []).filter(
    (a) =>
      !(
        a.type === SCENARIO_ARTIFACT_TYPE &&
        (a.data as unknown as Scenario | undefined)?.id === scenarioId
      ),
  );

  const { error } = await client
    .from('deals')
    .update({ artifacts: next, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('user_id', POWERDEAL_USER_ID);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Scenarios pinned without a deal attached. */
export async function looseScenarios(): Promise<Scenario[]> {
  return (await getAppState<Scenario[]>(LOOSE_SCENARIOS_KEY)) ?? [];
}

export async function saveLooseScenario(scenario: Scenario): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const current = await looseScenarios();
  // Cap the loose tray. Deal-attached scenarios are the durable record; these
  // are scratch, and an unbounded jsonb blob is a slow leak.
  const next = [scenario, ...current.filter((s) => s.id !== scenario.id)].slice(0, 25);

  const { error } = await client
    .from('app_state')
    .upsert(
      { key: LOOSE_SCENARIOS_KEY, value: next, user_id: POWERDEAL_USER_ID },
      { onConflict: 'user_id,key' },
    );

  return error ? { ok: false, error: error.message } : { ok: true };
}
