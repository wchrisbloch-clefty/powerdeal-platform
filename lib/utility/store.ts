import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { describeReadFailure } from '@/lib/data';
import {
  STATE_MARKET_STRUCTURE, resolveUtility, structureForState,
  type ResolveInput, type StateMarketStructure, type UtilityContext, type UtilityRecord,
} from '@/lib/utility/model';

/**
 * READS FOR THE UTILITY LAYER — none of which touch a deal.
 *
 * That is the requirement, not a coincidence. A market review of a prospect
 * nobody has entered has no deal row, so if a deals join were the only path
 * to utility resolution, origination would get nothing. Every function here
 * takes a state code or a utility name.
 *
 * NO user_id SCOPING EITHER. Market structure is a fact about a jurisdiction,
 * identical for every user; scoping it per user would make it unreachable from
 * a surface that has no owner to scope by.
 */

/**
 * Level 0 for one state.
 *
 * Falls back to the shipped constant when Supabase is not configured. Level 0
 * exists so origination works with zero research on any prospect anywhere, and
 * a level that goes dark in solo mode would not be that.
 */
export async function marketStructure(
  state: string | null | undefined,
): Promise<StateMarketStructure | null> {
  const code = (state ?? '').trim().toUpperCase();
  if (!code) return null;

  const client = getAdminClient();
  if (!client) return structureForState(code);

  const { data, error } = await client
    .from('state_market_structure')
    .select('state, structure, note')
    .eq('state', code)
    .maybeSingle();

  // The stored row is authoritative — storing ~50 rows that change once a
  // decade is what lets a reclassification be an UPDATE rather than a deploy.
  // The constant is the seed and the fallback, never an override.
  if (error || !data) return structureForState(code);
  return { state: data.state, structure: data.structure, note: data.note ?? undefined };
}

/** Every jurisdiction, for a coverage view. Reference data, so it is small. */
export async function allMarketStructures(): Promise<StateMarketStructure[]> {
  const client = getAdminClient();
  if (!client) return STATE_MARKET_STRUCTURE;

  const { data, error } = await client
    .from('state_market_structure')
    .select('state, structure, note')
    .order('state');

  if (error || !data?.length) return STATE_MARKET_STRUCTURE;
  return data.map((r) => ({ state: r.state, structure: r.structure, note: r.note ?? undefined }));
}

function toRecord(r: Record<string, unknown>): UtilityRecord {
  return {
    key: r.key as string,
    name: r.name as string,
    state: r.state as string,
    type: r.type as UtilityRecord['type'],
    serviceModel: (r.service_model as UtilityRecord['serviceModel']) ?? null,
    iso: (r.iso as string) ?? null,
    standbyTariff: (r.standby_tariff as string) ?? null,
    departingLoadCharge: (r.departing_load_charge as string) ?? null,
    exitFee: (r.exit_fee as string) ?? null,
    minimumTake: (r.minimum_take as string) ?? null,
    allRequirementsContract:
      r.all_requirements_contract === null || r.all_requirements_contract === undefined
        ? null
        : Boolean(r.all_requirements_contract),
    notes: (r.notes as string) ?? null,
  };
}

/**
 * Levels 1–3 for one utility, by key or by name.
 *
 * Returns null for anything not seeded, and that is the ordinary case by
 * design: six utilities are stored, everything else resolves at Level 0 from
 * its state until somebody has a reason to add it. A comprehensive US utility
 * reference would be thousands of rows rotting continuously — the same failure
 * mode as the maintained battlecard library this build abandoned.
 */
export async function utilityRecord(
  nameOrKey: string | null | undefined,
): Promise<UtilityRecord | null> {
  const q = (nameOrKey ?? '').trim();
  if (!q) return null;

  const client = getAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from('utilities')
    .select('*')
    .or(`key.eq.${q.toLowerCase()},name.ilike.${q}`)
    .limit(1);

  /*
    ⚠️ A REFUSED LOOKUP USED TO RETURN null, WHICH IS THE SAME ANSWER AS "THIS
    UTILITY IS NOT IN THE TABLE". Both drop resolveUtilityContext to a lower
    level, and the panel then says the record does not go any further — a
    statement about coverage, made because a query failed.

    `readFailed` is thrown rather than returned so the one caller cannot ignore
    it by accident; resolveUtilityContext catches it and turns it into a named
    gap, which is the vocabulary this module already uses for everything it
    cannot establish.
  */
  if (error) throw new UtilityReadFailure(describeReadFailure(error.message));

  return data?.length ? toRecord(data[0] as Record<string, unknown>) : null;
}

/** Distinguishes "the table does not have it" from "the table did not answer". */
export class UtilityReadFailure extends Error {}

/**
 * Resolve as far as the record allows, from fields alone.
 *
 * Deliberately takes `state`, `siteUtility` and `accountUtility` rather than a
 * deal. A caller that HAS a deal passes its fields; a caller doing a market
 * review on a company nobody has entered passes a state and gets Level 0.
 */
export async function resolveUtilityContext(
  input: Pick<ResolveInput, 'state' | 'siteUtility' | 'accountUtility'>,
): Promise<UtilityContext> {
  // Resolve the name first so the record lookup uses the same precedence the
  // label does — site, then account. Two different answers here would put one
  // utility on the card and another in the risk list.
  const shallow = resolveUtility(input);

  let readError: string | null = null;
  const [stateStructure, record] = await Promise.all([
    marketStructure(input.state),
    shallow.utilityName
      ? utilityRecord(shallow.utilityName).catch((err: unknown) => {
          if (err instanceof UtilityReadFailure) {
            readError = err.message;
            return null;
          }
          throw err;
        })
      : Promise.resolve(null),
  ]);

  const resolved = resolveUtility({ ...input, stateStructure, record });
  if (readError) {
    // A gap, not a silent level drop. `gaps` is this module's existing channel
    // for "named, never silently skipped", so the refusal travels the same
    // path as every other thing the record could not establish.
    return {
      ...resolved,
      gaps: [
        `Utility record could not be read, so anything below the state's market ` +
          `structure is unknown rather than absent. ${readError}`,
        ...resolved.gaps,
      ],
    };
  }
  return resolved;
}
