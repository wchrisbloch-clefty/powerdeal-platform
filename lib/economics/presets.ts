import type { FinanceInputs, GridInputs, TechInputs, TechKey } from './types';
import { needsInput, userValue } from './types';

/**
 * TECHNOLOGY PRESETS
 *
 * ─────────────────────────────────────────────────────────────────
 * WHY EVERY COST AND PERFORMANCE FIELD BELOW IS EMPTY
 *
 * The build spec is explicit: "Seed only what can be sourced publicly and
 * cited. Do not invent capex or O&M figures. Where a value is unknown, leave
 * the field empty with a 'needs input' state rather than a plausible-looking
 * placeholder."
 *
 * This build environment has no route to a citable source. Outbound HTTPS is
 * proxied and every candidate host is refused at the gateway — nrel.gov,
 * eia.gov, api.openei.org all answer 403 to CONNECT. There is no offline copy
 * of the ATB, no vendor spec sheet in the repository, and nothing in the seed
 * data carries a capex figure.
 *
 * So the presets ship structurally complete and numerically empty. Loading one
 * gives you the right FIELDS, the right units, the right incentive set and the
 * right input model — and it asks you for the numbers.
 *
 * That is the spec's stated preference, not a shortcut around it. A capex I
 * half-remembered would render identically to one I had sourced, would carry a
 * provenance chip claiming a tier it had not earned, and would survive into a
 * customer conversation precisely because it looked fine.
 *
 * TO SEED THESE PROPERLY: fill the fields below with `sourced(...)` entries,
 * one per value, each carrying its citation and retrieval date. NREL's Annual
 * Technology Baseline covers capex and O&M for the combustion technologies;
 * SOFC figures generally come from manufacturer spec sheets, which is a
 * `verified` tier when it is a published document and `reported` when it is an
 * analyst summary of one.
 * ─────────────────────────────────────────────────────────────────
 */

export interface TechPreset {
  key: TechKey;
  label: string;
  /** Grid uses a different input set entirely — see GridInputs. */
  usesGridInputs: boolean;
  /** Shown under the dropdown so the empty state reads as intent, not breakage. */
  note: string;
  inputs: TechInputs;
}

/** Every numeric field unset. The units are the contract; the values are yours. */
function emptyTech(): TechInputs {
  return {
    efficiencyPct: needsInput('%'),
    capexPerKw: needsInput('$/kW'),
    omPerKwYr: needsInput('$/kW-yr'),
    redundancyPct: needsInput('%'),
    serviceIntervalHrs: needsInput('hrs'),
    tempDeratePct: needsInput('%'),
    minUnitMw: needsInput('MW'),
    leadTimeMonths: needsInput('months'),
  };
}

const NEEDS_SOURCING =
  'Values need sourcing — enter from a spec sheet or published dataset and the chip will show your entry as untagged, which is honest: it is your number.';

export const PRESETS: TechPreset[] = [
  {
    key: 'sofc',
    label: 'Fuel cell (SOFC)',
    usesGridInputs: false,
    note: NEEDS_SOURCING,
    inputs: emptyTech(),
  },
  {
    key: 'sc-gas-turbine',
    label: 'Simple-cycle gas turbine',
    usesGridInputs: false,
    note: NEEDS_SOURCING,
    inputs: emptyTech(),
  },
  {
    key: 'cc-gas-turbine',
    label: 'Combined-cycle gas turbine',
    usesGridInputs: false,
    note: NEEDS_SOURCING,
    inputs: emptyTech(),
  },
  {
    key: 'recip-engine',
    label: 'Gas reciprocating engine',
    usesGridInputs: false,
    note: NEEDS_SOURCING,
    inputs: emptyTech(),
  },
  {
    key: 'grid',
    label: 'Grid supply',
    usesGridInputs: true,
    note: 'Different input set — delivered rate components, not capex and fuel. Where the deal has a utility on record, tariff components can be pre-filled and are marked REPORTED.',
    inputs: emptyTech(),
  },
  {
    key: 'custom',
    label: 'Custom',
    usesGridInputs: false,
    note: 'Blank by design. Enter everything.',
    inputs: emptyTech(),
  },
];

export function presetFor(key: TechKey): TechPreset {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[PRESETS.length - 1];
}

/**
 * Shared financial assumptions.
 *
 * These carry starting values because they are the user's own commercial
 * assumptions rather than claims about a technology — a term and a cost of
 * capital are inputs to their model, not facts about the world that need a
 * citation. They are untagged for exactly that reason, and every one is
 * editable.
 *
 * Fuel price starts at $4.00/MMBtu because that is the figure the worked
 * examples in the spec are computed at, which makes the heat-rate chain
 * verifiable on first load.
 */
export function defaultFinance(): FinanceInputs {
  return {
    fuelPricePerMmbtu: userValue(4.0, '$/MMBtu'),
    capacityFactor: userValue(0.95, 'fraction'),
    costOfCapitalPct: userValue(8, '%'),
    termYears: userValue(20, 'years'),
  };
}

export function emptyGrid(): GridInputs {
  return {
    energyCentsPerKwh: needsInput('¢/kWh'),
    demandPerKwMonth: needsInput('$/kW-month'),
    transmissionCentsPerKwh: needsInput('¢/kWh'),
    transmissionPerKwMonth: needsInput('$/kW-month'),
    ancillaryCentsPerKwh: needsInput('¢/kWh'),
    escalationPct: needsInput('%/yr'),
    fourCpPerKwYr: needsInput('$/kW-yr'),
  };
}

/**
 * The spec's worked heat-rate chain, rendered in the UI as a reference strip.
 *
 * Deliberately NOT mapped onto the technology presets. The spec presents these
 * four efficiencies as a worked example of the conversion at $4.00/MMBtu, not
 * as per-technology values, and assigning them to specific technologies would
 * be exactly the invented default the spec rules out. They exist here so the
 * arithmetic is checkable on screen against a known-good table.
 */
export const HEAT_RATE_REFERENCE = [
  { efficiencyPct: 53, heatRate: 6438, fuelCents: 2.58 },
  { efficiencyPct: 45, heatRate: 7582, fuelCents: 3.03 },
  { efficiencyPct: 42.5, heatRate: 8028, fuelCents: 3.21 },
  { efficiencyPct: 37, heatRate: 9222, fuelCents: 3.69 },
] as const;

/** The price the reference strip above is computed at. */
export const REFERENCE_FUEL_PRICE = 4.0;

/** ERCOT — 4CP exposure renders only for these. */
export const FOUR_CP_STATES = ['TX'] as const;

export function hasFourCpExposure(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = state.trim().toUpperCase();
  return s === 'TX' || s === 'TEXAS';
}
