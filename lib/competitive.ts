import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { CATALOG_BY_KEY, presenceWrite } from '@/lib/competitor-catalog';
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
 * Do-nothing lives in the CATALOG, not here, and is deliberately NOT stored as
 * a row. Storing it would make a permanent condition of every opportunity look
 * optional — something you might or might not have entered.
 *
 * More generally: nothing on this table is a competitor list. It records where
 * a deal DIFFERS from the defaults, and the defaults are in
 * lib/competitor-catalog. A deal with zero rows is the ordinary deal — the grid
 * and the status quo, both on — not an unconfigured one.
 */

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

/**
 * How many competitor rows this deal has, or NULL when the read failed.
 *
 * ⚠️ NULL AND 0 ARE DIFFERENT ANSWERS AND THE MEDDPICC 'C' DEPENDS ON THE
 * DIFFERENCE. Zero rows is the ordinary deal — the grid and the status quo,
 * both on by default, nothing overridden — and it scores the Competition
 * pillar as a genuine gap. A read that FAILED knows nothing, and reporting it
 * as zero would print "Competition: gap" on a deal with a fully worked
 * competitive grid.
 *
 * `competitorsForDeal` above returns `[]` on failure, which is right for
 * rendering a grid (the defaults still apply) and wrong for scoring. This is
 * the scoring read, and it keeps the distinction supabase-js erases by
 * resolving with `{ data: null, error }`.
 */
export async function competitorCountForDeal(dealId: string): Promise<number | null> {
  const client = getAdminClient();
  if (!client) return null;

  const { count, error } = await client
    .from('deal_competitors')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .eq('user_id', POWERDEAL_USER_ID);

  if (error) return null;
  return count ?? 0;
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
 * Flip one row of the toggle grid.
 *
 * The DECISION is pure and lives in lib/competitor-catalog — what a toggle
 * writes has to be the same answer the panel renders and the tests assert, and
 * it can only be the same answer if there is one implementation of it. This
 * function does the IO and nothing else.
 *
 * `key` is a catalog key ('grid') or a stored row id. Never a display name:
 * the grid's display name follows the Spine's Utility Territory field, so a
 * rename there would otherwise orphan the row that switched it off and the
 * grid would silently turn itself back on.
 */
export async function setPresence(input: {
  dealId: string;
  key: string;
  on: boolean;
  /** Loaded once by the caller so the read and the write see one state. */
  competitors: DealCompetitor[];
}): Promise<{ ok: boolean; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const entry = CATALOG_BY_KEY.get(input.key);
  const existing = entry
    ? input.competitors.find(
        (c) => c.competitor.trim().toLowerCase() === entry.name.trim().toLowerCase(),
      ) ?? null
    : input.competitors.find((c) => c.id === input.key) ?? null;

  if (!entry && !existing) {
    return { ok: false, error: `Unknown competitor: ${input.key}` };
  }
  if (entry?.presence === 'always') {
    // Do-nothing is a permanent condition of every opportunity, not a choice.
    return { ok: false, error: 'Do nothing is in every deal and cannot be switched off.' };
  }

  // A hand-typed competitor has no catalog default, so its default is "off" —
  // it exists only because someone added it.
  const decision = presenceWrite(entry ?? { presence: 'off' }, input.on, existing);

  if (decision.action === 'none') return { ok: true };

  if (decision.action === 'delete') {
    return removeCompetitor(input.dealId, existing!.competitor);
  }

  return upsertCompetitor({
    dealId: input.dealId,
    competitor: existing?.competitor ?? entry!.name,
    tier: existing?.tier ?? entry!.tier,
    posture: existing?.posture ?? null,
    whatWasSaid: existing?.what_was_said ?? null,
    whatLanded: existing?.what_landed ?? null,
    status: decision.status,
  });
}
