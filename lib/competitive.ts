import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import type { CompetitorTier, DealCompetitor } from '@/lib/types';

/**
 * PER-DEAL COMPETITIVE STATE.
 *
 * Posture is a SET. One opportunity can face the grid, a combustion OEM and a
 * packaged integrator at once — three arguments that are not compatible with
 * each other, because a pricing defense against a utility rate and one against
 * a bundled integrator offer are different documents for different readers.
 *
 * Per-DEAL, never per-account. Williams is the proof: a midstream customer and
 * an integrator competitor on the same account. One account-level posture
 * cannot hold both, and whichever half it held would be wrong for the other.
 */

/**
 * Do-nothing is always in the deal, whether or not anyone recorded it.
 *
 * It is deliberately NOT stored as a row. Storing it would make it look
 * optional — something you might or might not have entered — when it is a
 * permanent condition of every opportunity. The no-decision card generates from
 * this constant plus the deal's own critical_event, so it exists even for a
 * deal with an empty competitor set.
 */
export const NO_DECISION: Pick<DealCompetitor, 'competitor' | 'tier' | 'posture'> = {
  competitor: 'Do nothing',
  tier: 'tier-1',
  posture:
    'The status quo has a scheduled, compounding cost. A flat comparison hides it.',
};

export async function competitorsForDeal(dealId: string): Promise<DealCompetitor[]> {
  const client = getAdminClient();
  if (!client) return [];

  const { data } = await client
    .from('deal_competitors')
    .select('*')
    .eq('deal_id', dealId)
    .eq('user_id', POWERDEAL_USER_ID)
    .order('tier', { ascending: true })
    .order('competitor', { ascending: true });

  return (data as DealCompetitor[]) ?? [];
}

export interface UpsertCompetitor {
  dealId: string;
  competitor: string;
  tier: CompetitorTier;
  posture?: string | null;
  whatWasSaid?: string | null;
  whatLanded?: string | null;
  status?: DealCompetitor['status'];
}

/**
 * Add or update one competitor on a deal.
 *
 * Upsert on (deal_id, competitor) because the database enforces one row per
 * competitor per deal — two rows would let two postures against the same
 * opponent diverge inside one opportunity.
 */
export async function upsertCompetitor(
  input: UpsertCompetitor,
): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await client.from('deal_competitors').upsert(
    {
      deal_id: input.dealId,
      competitor: input.competitor.trim(),
      tier: input.tier,
      posture: input.posture ?? null,
      what_was_said: input.whatWasSaid ?? null,
      what_landed: input.whatLanded ?? null,
      status: input.status ?? 'active',
      updated_at: new Date().toISOString(),
      user_id: POWERDEAL_USER_ID,
    },
    { onConflict: 'deal_id,competitor' },
  );

  if (error) {
    const hint = /relation .*deal_competitors/i.test(error.message)
      ? ' — run supabase/migrations/20260810_deal_competitors.sql'
      : '';
    return { ok: false, error: `${error.message}${hint}` };
  }
  return { ok: true };
}

export async function removeCompetitor(
  dealId: string,
  competitor: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await client
    .from('deal_competitors')
    .delete()
    .eq('deal_id', dealId)
    .eq('competitor', competitor)
    .eq('user_id', POWERDEAL_USER_ID);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * The postures a card can be generated against.
 *
 * Always includes do-nothing, whether or not the deal has any recorded
 * competitors. A deal with an empty set still faces the status quo, and a
 * competitive surface that showed nothing for such a deal would be describing
 * the record rather than the situation.
 */
export function postures(competitors: DealCompetitor[]): {
  key: string;
  competitor: string;
  tier: CompetitorTier;
  posture: string | null;
  recorded: boolean;
}[] {
  const active = competitors.filter((c) => c.status === 'active');
  return [
    {
      key: 'no-decision',
      competitor: NO_DECISION.competitor,
      tier: NO_DECISION.tier,
      posture: NO_DECISION.posture,
      recorded: false,
    },
    ...active.map((c) => ({
      key: c.id,
      competitor: c.competitor,
      tier: c.tier,
      posture: c.posture,
      recorded: true,
    })),
  ];
}

/**
 * The other competitors in the deal, for a card's "competitive set" header.
 *
 * Every card names the postures it is NOT addressing. Without it a rep can
 * carry the integrator card into a meeting where the real threat is do-nothing
 * and never notice the mismatch — the card would read as complete because it
 * says nothing about what it left out.
 */
export function otherPostures(
  competitors: DealCompetitor[],
  currentKey: string,
): string[] {
  return postures(competitors)
    .filter((p) => p.key !== currentKey)
    .map((p) => p.competitor);
}
