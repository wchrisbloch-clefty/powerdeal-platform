import type { SourceTier } from '@/lib/types';

/**
 * ECONOMICS MODULE — types
 *
 * Every number that this module did not get from the user carries where it came
 * from. Same discipline as the intelligence feed's provenance spine, applied to
 * cost inputs, because the failure mode is the same one: a figure that looks
 * authoritative, gets copied into a customer conversation, and cannot be
 * defended when someone asks.
 */

/**
 * A number with its provenance.
 *
 * `value: null` is the "needs input" state and is a first-class, expected
 * condition — not an error. A field we could not source ships empty on purpose.
 * An empty field is a prompt; a plausible-looking default is a wrong number
 * waiting to be quoted at a plant manager.
 *
 * `tier: null` means the user typed it. That is deliberately NOT a provenance
 * grade: it is their number, and claiming a tier for it would be inventing
 * authority the value does not have.
 */
export interface Sourced {
  value: number | null;
  /** Present for display and for catching unit mistakes in review. */
  unit: string;
  tier: SourceTier | null;
  source: string | null;
  /** ISO date. Null when user-entered. */
  retrievedAt: string | null;
  /**
   * The published band, when the source gives a range rather than a point.
   *
   * `value` is then the midpoint — and the UI says so. A midpoint presented as
   * a fact is the same failure as an invented default: it looks like a figure
   * someone measured. Carrying the band means the reader can see the number is
   * the middle of 1,150–1,450, not a measurement of 1,300.
   */
  low?: number | null;
  high?: number | null;
  /**
   * Reserved (spec 1.9). Some competitive inputs may originate from internal
   * material. The flag is carried on the SOURCE so a later export filter can
   * act on it. Nothing enforces it today, by design — tag the source, don't
   * restrict the use.
   */
  internal?: boolean;
}

/** A user-entered number: no tier, no source, no date. Honest by omission. */
export function userValue(value: number | null, unit: string): Sourced {
  return { value, unit, tier: null, source: null, retrievedAt: null };
}

/** A field we could not source. Renders as "needs input". */
export function needsInput(unit: string): Sourced {
  return { value: null, unit, tier: null, source: null, retrievedAt: null };
}

/** A sourced point value. */
export function sourced(
  value: number,
  unit: string,
  tier: SourceTier,
  source: string,
  retrievedAt: string,
): Sourced {
  return { value, unit, tier, source, retrievedAt };
}

/**
 * A sourced range. `value` becomes the midpoint and the band travels with it.
 *
 * Ranges are the normal case for published cost data — a single capex figure
 * for "new-build combined cycle" would be the fiction, not the band.
 */
export function sourcedRange(
  low: number,
  high: number,
  unit: string,
  tier: SourceTier,
  source: string,
  retrievedAt: string,
): Sourced {
  return { value: (low + high) / 2, low, high, unit, tier, source, retrievedAt };
}

export function hasRange(s: Sourced | undefined): boolean {
  return Boolean(
    s && s.low !== null && s.low !== undefined && s.high !== null && s.high !== undefined,
  );
}

export function isNeeded(s: Sourced | undefined): boolean {
  return !s || s.value === null || Number.isNaN(s.value);
}

// ── Technology configuration ──────────────────────────────────────

export const TECH_KEYS = [
  'sofc',
  'sc-gas-turbine',
  'cc-gas-turbine',
  'recip-engine',
  'grid',
  'custom',
] as const;
export type TechKey = (typeof TECH_KEYS)[number];

/**
 * The generation-technology input set.
 *
 * Efficiency is NOT independent of fuel cost — it drives heat rate, which
 * drives fuel ¢/kWh. The UI shows that chain rather than hiding it, because a
 * plant engineer thinks in heat rate and the conversion is the credibility
 * signal.
 */
export interface TechInputs {
  efficiencyPct: Sourced;
  capexPerKw: Sourced;
  /** Fixed O&M. */
  omPerKwYr: Sourced;
  /**
   * Variable O&M, billed per unit of output rather than per unit of capacity.
   *
   * Separate from fixed O&M because the units are genuinely different and
   * folding $/MWh into a $/kW-yr field is a unit error that produces a
   * confident wrong answer. Converts straight to ¢/kWh (÷10) with no capacity
   * factor involved — it is already per-MWh-generated.
   */
  variableOmPerMwh: Sourced;
  /** Overbuild required to serve firm load. Multiplies capex. */
  redundancyPct: Sourced;
  serviceIntervalHrs: Sourced;
  tempDeratePct: Sourced;
  /** Constraint notes, not cost inputs — they never enter the LCOE. */
  minUnitMw: Sourced;
  leadTimeMonths: Sourced;
  /**
   * Asset life. Deliberately NOT wired to the financing term: a 30-year asset
   * financed over 20 years is an ordinary structure, and silently driving CRF
   * from asset life would change the answer without the user asking.
   */
  assetLifeYears: Sourced;
}

/** Shared financial assumptions. Always user-owned — never preset-sourced. */
export interface FinanceInputs {
  fuelPricePerMmbtu: Sourced;
  capacityFactor: Sourced;
  costOfCapitalPct: Sourced;
  termYears: Sourced;
}

/**
 * Grid supply (spec 1.4).
 *
 * Deliberately a different input set: grid has no capex/O&M/fuel structure, and
 * forcing it into one would misrepresent the comparison. Escalation is the
 * lever that matters — doing nothing has a scheduled, compounding cost, and a
 * flat comparison hides exactly that.
 */
export interface GridInputs {
  energyCentsPerKwh: Sourced;
  demandPerKwMonth: Sourced;
  transmissionCentsPerKwh: Sourced;
  transmissionPerKwMonth: Sourced;
  ancillaryCentsPerKwh: Sourced;
  escalationPct: Sourced;
  /** ERCOT only. Rendered conditionally on the deal's state. */
  fourCpPerKwYr: Sourced;
}

// ── Results ───────────────────────────────────────────────────────

export interface LcoeBreakdown {
  /** ¢/kWh */
  capex: number;
  om: number;
  fuel: number;
  total: number;
  /** Derived intermediates, surfaced because they are the credibility layer. */
  heatRateBtuPerKwh: number | null;
  effectiveCapexPerKw: number | null;
  crf: number | null;
}

export interface GridBreakdown {
  energy: number;
  demand: number;
  transmission: number;
  ancillary: number;
  fourCp: number;
  /** Year-1 delivered cost before escalation, ¢/kWh. */
  yearOne: number;
  /** Levelized over the term with escalation applied, ¢/kWh. */
  levelized: number;
}

/** A missing input, named. Rendered so the user knows what to fill in. */
export interface MissingInput {
  field: string;
  label: string;
}

export interface EconomicsResult {
  lcoe: LcoeBreakdown | null;
  grid: GridBreakdown | null;
  /** Non-empty means the result is incomplete and must not be presented. */
  missing: MissingInput[];
}

// ── Scenarios ─────────────────────────────────────────────────────

/**
 * A pinned configuration (spec 1.3).
 *
 * The complete input set, not a reference to sliders. Comparison is between two
 * independently-configured scenarios — never one slider driving several
 * technologies at once, which either erases the differences or looks rigged.
 */
export interface Scenario {
  id: string;
  name: string;
  tech: TechKey;
  inputs: TechInputs;
  finance: FinanceInputs;
  grid: GridInputs;
  incentives: IncentiveSelection[];
  /** Snapshot of the result at pin time, so the tray renders without recompute. */
  result: EconomicsResult;
  createdAt: string;
  dealId?: string | null;
}

// ── Incentives ────────────────────────────────────────────────────

export const INCENTIVE_KEYS = [
  'itc-48e',
  'rec',
  '45q',
  'chp',
  'state',
  'local-property-tax',
] as const;
export type IncentiveKey = (typeof INCENTIVE_KEYS)[number];

/**
 * Incentives are separate line items, never one lumped adjustment.
 *
 * Eligibility varies by jurisdiction and technology; a rolled-up figure is
 * precisely what collapses under diligence. Each carries its own source tag and
 * its own contribution to the final number.
 */
export interface IncentiveDef {
  key: IncentiveKey;
  label: string;
  unit: string;
  /** How the entered figure converts to a ¢/kWh adjustment. */
  basis: 'capex-pct' | 'per-mwh' | 'per-tonne' | 'per-kwh' | 'per-kw-yr';
  /** Rendered inline, always — not a tooltip. */
  condition: string | null;
  appliesTo: TechKey[] | 'all';
}

export interface IncentiveSelection {
  key: IncentiveKey;
  enabled: boolean;
  amount: Sourced;
  /**
   * REC only (spec 1.7). The fuel pathway is not optional metadata — it is the
   * condition the figure is valid under, and it travels with the number into
   * every export. A bare $/MWh REC figure is not a claim this module will make.
   */
  fuelPathway?: RecFuelPathway;
}

export const REC_FUEL_PATHWAYS = ['pipeline-natural-gas', 'renewable-fuel'] as const;
export type RecFuelPathway = (typeof REC_FUEL_PATHWAYS)[number];
