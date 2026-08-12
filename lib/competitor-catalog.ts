import { resolveUtility, GENERIC_GRID_LABEL } from '@/lib/utility/model';
import type { CompetitorTier, DealCompetitor, Deal } from '@/lib/types';

/**
 * Everything the grid label needs, and no more.
 *
 * Not a Deal: the same resolution has to work for a prospect with no deal
 * row at all, which is the whole point of the utility layer being reachable
 * without one.
 */
export type GridNameInput = Pick<Deal, 'utility'> &
  Partial<Pick<Deal, 'beachhead_utility' | 'state'>>;

/**
 * COMPETITOR PRESENCE — a toggle grid, defaulted to the common case.
 *
 * Not a pick-one-at-a-time form. The question "who is in this deal?" has a
 * known answer set almost every time — the status quo, the incumbent utility,
 * and combustion — and a form that made a rep type all three is a form that
 * gets used once. Presence is a set of switches over a fixed catalog, and the
 * zero-click state is already right for the majority of deals.
 *
 * SELECTION IS SEPARATE FROM DETAIL, and that separation is the whole design.
 * Toggling is two seconds and requires nothing else; posture, what-was-said and
 * what-landed are added later, on the entries that earn it. Requiring detail at
 * toggle time would put a text field between the rep and the record, which is
 * the reason the previous per-competitor form stayed empty.
 *
 * This module is PURE — no server imports — because the toggle grid renders on
 * the client, the API writes from it, and the tests exercise it directly. All
 * three must agree on what "on" means, and they can only agree if they share
 * one implementation.
 */

/**
 * What the grid posture is CALLED in this deal.
 *
 * Delegates to the utility resolver so there is one implementation of "which
 * counterparty is this" — the toggle grid, the card title, the negative header
 * and the risk list all have to name the same one, and they can only agree if
 * they share the resolution.
 *
 * Resolution order is SITE FIRST, then account, then generic. On a national
 * account the account-level Utility Territory describes the company; the
 * beachhead is where the electrons and the tariff actually are.
 *
 * The ISO guard applies here: 'ERCOT' does not become a counterparty name and
 * does not get autocorrected into a TDU either. See lib/utility/model.
 */
export function gridCompetitorName(deal: GridNameInput): string {
  return resolveUtility({
    state: deal.state ?? null,
    siteUtility: deal.beachhead_utility ?? null,
    accountUtility: deal.utility ?? null,
  }).gridLabel;
}

/** Whether the grid name came from the record or from the fallback. */
export function gridNameIsGeneric(deal: GridNameInput): boolean {
  return gridCompetitorName(deal) === GENERIC_GRID_LABEL;
}

/**
 * Why the name is generic, when it is — so the panel can say something more
 * useful than nothing. An ISO in the field is a different problem from an empty
 * field, and only one of them is fixed by typing a utility name.
 */
export function gridNameGap(deal: GridNameInput): string | null {
  const ctx = resolveUtility({
    state: deal.state ?? null,
    siteUtility: deal.beachhead_utility ?? null,
    accountUtility: deal.utility ?? null,
  });
  if (ctx.utilityName) return null;
  return ctx.isoInField
    ? `Utility Territory reads “${ctx.isoInField}”, a market operator rather than the utility that bills this site. Which TDU serves the beachhead is a fact about the site, so it is not inferred.`
    : 'No utility named on this deal, so the grid argument stays generic. Naming the beachhead’s utility makes it a rate the buyer recognises on their own bill.';
}

export type PresenceDefault =
  /** In every deal, cannot be switched off, never stored as a row. */
  | 'always'
  /** On unless explicitly switched off. Absence of a row means present. */
  | 'on'
  /** Off unless explicitly switched on. */
  | 'off';

export interface CatalogEntry {
  /** Stable identity. Never displayed, never derived from the deal record. */
  key: string;
  /**
   * The value written to `deal_competitors.competitor`.
   *
   * Deliberately NOT the display name for the grid. If the stored value were
   * "CenterPoint" and the Spine's Utility Territory later changed to "PG&E",
   * the switched-off row would no longer be found and the grid would silently
   * turn itself back on. Identity is stable; the display name resolves at
   * render time.
   */
  name: string;
  tier: CompetitorTier;
  presence: PresenceDefault;
  /** Visible without expanding. Tier 1 only — the daily fight. */
  topLevel: boolean;
  /** Resolves its display name from the deal record instead of `name`. */
  resolveName?: (deal: GridNameInput) => string;
  hint?: string;
  /** A doctrine posture, where one exists independent of the deal. */
  posture?: string;
}

/**
 * The doctrine's competitive set, from system prompt section 1A.
 *
 * Tier 1 is the grid and combustion, and combustion is split into turbines and
 * reciprocating engines because they are not the same argument — a turbine deal
 * turns on heat rate and permit timeline, a recip deal on maintenance interval
 * and emissions envelope. Collapsing them into "combustion" would produce one
 * card that fits neither.
 *
 * Bloom is ALIGNED and is deliberately absent. There is no toggle for it
 * because there is no state in which it belongs in this grid.
 */
export const CATALOG: CatalogEntry[] = [
  {
    key: 'no-decision',
    name: 'Do nothing',
    tier: 'tier-1',
    presence: 'always',
    topLevel: true,
    hint: 'In every deal. The dominant loss mode, and the only one with no salesperson on the other side.',
    // The one posture that is doctrine rather than a per-deal fact, so it is a
    // constant here. What varies per deal is the forcing function, and that
    // lives on the deal record as critical_event.
    posture:
      'The status quo has a scheduled, compounding cost. A flat comparison hides it.',
  },
  {
    key: 'grid',
    name: 'Grid supply',
    tier: 'tier-1',
    presence: 'on',
    topLevel: true,
    resolveName: gridCompetitorName,
    hint: 'On by default. Switch off only for a site where grid supply was never an option.',
  },
  {
    key: 'turbines',
    name: 'Combustion turbines (GE LM / Solar)',
    tier: 'tier-1',
    presence: 'off',
    topLevel: true,
  },
  {
    key: 'recips',
    name: 'Reciprocating engines (Wärtsilä / INNIO / CAT)',
    tier: 'tier-1',
    presence: 'off',
    topLevel: true,
  },
  {
    // TOP LEVEL, not collapsed with the situational tiers. Tier 1B is Tier 1
    // family and it dominates data-center deals — burying it behind a
    // disclosure would hide the most likely opponent in the fastest-growing
    // segment of the book.
    key: 'tier-1b',
    name: 'Packaged integrator',
    tier: 'tier-1b',
    presence: 'off',
    topLevel: true,
    hint: 'Competes on commercial model, not specification — the comparison is our PPA/EaaS structure against their bundle. Hard rule 17: never answer one with a heat rate.',
  },
  { key: 'battery', name: 'Batteries / storage', tier: 'tier-2', presence: 'off', topLevel: false },
  { key: 'wind', name: 'Wind', tier: 'tier-2', presence: 'off', topLevel: false },
  {
    key: 'linear-gen',
    name: 'Linear generators (Mainspring-class)',
    tier: 'tier-2',
    presence: 'off',
    topLevel: false,
  },
  {
    key: 'other-fuel-cell',
    name: 'Other fuel-cell makers',
    tier: 'tier-3',
    presence: 'off',
    topLevel: false,
    hint: 'Only when the prospect is already fuel-cell shopping.',
  },
];

export const CATALOG_BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

/** One row of the toggle grid. Catalog entries and free-text additions alike. */
export interface PresenceRow {
  key: string;
  /** What the rep and the card call it. */
  label: string;
  tier: CompetitorTier;
  on: boolean;
  toggleable: boolean;
  topLevel: boolean;
  /** Added by hand rather than from the catalog. */
  custom: boolean;
  /** The stored row, when one exists. Null means the default is doing the work. */
  record: DealCompetitor | null;
  hint?: string;
}

function hasDetail(c: DealCompetitor | null): boolean {
  return Boolean(c && (c.posture || c.what_was_said || c.what_landed));
}

function findRecord(competitors: DealCompetitor[], name: string): DealCompetitor | null {
  const want = name.trim().toLowerCase();
  return competitors.find((c) => c.competitor.trim().toLowerCase() === want) ?? null;
}

/**
 * The toggle grid for one deal: catalog defaults, overridden by stored rows.
 *
 * A stored row always wins over the default, in both directions. That is what
 * makes the zero-click state safe to rely on — the record can always contradict
 * it, and the contradiction is what gets written.
 */
export function presenceGrid(
  deal: GridNameInput,
  competitors: DealCompetitor[],
): PresenceRow[] {
  const claimed = new Set<string>();

  const rows: PresenceRow[] = CATALOG.map((entry) => {
    const record = findRecord(competitors, entry.name);
    if (record) claimed.add(record.id);

    const on =
      entry.presence === 'always'
        ? true
        : record
          ? record.status === 'active'
          : entry.presence === 'on';

    return {
      key: entry.key,
      label: entry.resolveName ? entry.resolveName(deal) : entry.name,
      tier: entry.tier,
      on,
      toggleable: entry.presence !== 'always',
      topLevel: entry.topLevel,
      custom: false,
      record,
      hint: entry.hint,
    };
  });

  // Anything typed in by hand — "Wärtsilä via Burns & McDonnell". The named
  // competitor in a given deal is a fact about that deal, and the catalog
  // cannot hold it without flattening it into a bucket.
  for (const c of competitors) {
    if (claimed.has(c.id)) continue;
    rows.push({
      key: c.id,
      label: c.competitor,
      tier: c.tier,
      on: c.status === 'active',
      toggleable: true,
      topLevel: false,
      custom: true,
      record: c,
    });
  }

  return rows;
}

export type PresenceWrite =
  | { action: 'none' }
  | { action: 'delete' }
  | { action: 'upsert'; status: 'active' | 'not-present' };

/**
 * What toggling a row should write.
 *
 * Two rules carry the weight here.
 *
 * Returning to the DEFAULT deletes the row rather than storing the default as
 * data. Otherwise every deal accumulates rows that say only "the normal thing
 * is true", and an empty table stops being distinguishable from an
 * unconfigured one.
 *
 * A row with DETAIL is never deleted. Toggling is two seconds, and two seconds
 * must not be enough to destroy a recorded posture or a buyer's own words. It
 * is switched to 'not-present' instead, which is reversible.
 */
export function presenceWrite(
  entry: Pick<CatalogEntry, 'presence'>,
  on: boolean,
  existing: DealCompetitor | null,
): PresenceWrite {
  const defaultOn = entry.presence !== 'off';

  if (on === defaultOn && !hasDetail(existing)) {
    return existing ? { action: 'delete' } : { action: 'none' };
  }
  return { action: 'upsert', status: on ? 'active' : 'not-present' };
}

export interface CardControl {
  /** Sent to /api/ai as postureKey. Stable across utility renames. */
  postureKey: string;
  label: string;
  tier: CompetitorTier;
  task: 'no-decision-card' | 'pricing-defense-card';
  /** True when nothing beyond presence has been recorded for this posture. */
  thin: boolean;
}

/**
 * The card buttons, DERIVED FROM THE TOGGLE STATE.
 *
 * Not a separate list to maintain. Every deal therefore has at least two cards
 * available the moment it exists — do-nothing and the grid — with no entry
 * required first, and turning a competitor on immediately produces its button.
 *
 * `thin` is a hint, never a gate. A card generates from whatever is on record
 * and names its own gaps; refusing to generate one would leave a rep with
 * nothing instead of something honest about what it does not know.
 */
export function cardControls(
  deal: GridNameInput,
  competitors: DealCompetitor[],
): CardControl[] {
  return presenceGrid(deal, competitors)
    .filter((r) => r.on)
    .map((r) => ({
      postureKey: r.key,
      label: r.label,
      tier: r.tier,
      task:
        r.key === 'no-decision'
          ? ('no-decision-card' as const)
          : ('pricing-defense-card' as const),
      thin: !hasDetail(r.record),
    }));
}

/**
 * The postures a card is NOT addressing — the negative header's payload.
 *
 * Reads the TOGGLE SET, so switching a competitor on changes the header of
 * every card generated afterwards. A header built from stored rows alone would
 * omit the grid on the majority of deals, which is precisely the posture most
 * likely to be the real one.
 */
export function otherPostureNames(
  deal: GridNameInput,
  competitors: DealCompetitor[],
  currentKey: string,
): string[] {
  return presenceGrid(deal, competitors)
    .filter((r) => r.on && r.key !== currentKey)
    .map((r) => r.label);
}
