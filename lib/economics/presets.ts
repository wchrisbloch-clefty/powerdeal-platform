import type { FinanceInputs, GridInputs, Sourced, TechInputs, TechKey } from './types';
import { needsInput, sourced, sourcedRange, userValue } from './types';
import { heatRate } from './lcoe';

/**
 * TECHNOLOGY PRESETS
 *
 * ─────────────────────────────────────────────────────────────────
 * SOURCING STATUS
 *
 * The two gas-turbine presets are seeded from Lazard's LCOE+ v18.0 (June
 * 2025), supplied directly. Every seeded field carries tier 'verified', the
 * citation, and — where Lazard publishes a band rather than a point — the band
 * itself, with `value` as its midpoint. The UI says "midpoint of 1,150–1,450"
 * rather than showing 1,300 as though someone measured it.
 *
 * Reciprocating engine and SOFC stay empty: Lazard v18.0 covers neither, and
 * nothing else reachable from this build environment could source them. They
 * ship with the right fields and no numbers, which is the spec's stated
 * preference over a plausible-looking default.
 *
 * ⚠️  CAPACITY FACTOR IS DELIBERATELY NOT SEEDED FROM LAZARD.
 *
 * Lazard models gas peaking at 10–15% CF. Behind-the-meter competitors in this
 * pipeline run 80–95%. Loading Lazard's CF would spread their capex over a
 * tenth of the output, inflate their LCOE, and make our comparison look better
 * than it is — wrong in our own favour, which is the worst direction to be
 * wrong and the hardest to catch, because nobody audits a number that flatters
 * them. Capacity factor stays at the module default and the field carries a
 * warning whenever a Lazard-seeded preset is loaded.
 * ─────────────────────────────────────────────────────────────────
 */

const LAZARD = 'Lazard LCOE+ v18.0, June 2025';
const LAZARD_DATE = '2025-06-01';

/** An alternate published capex case, offered rather than silently chosen. */
export interface CapexCase {
  id: string;
  label: string;
  capex: Sourced;
  /** Rendered with the option — the condition it is valid under. */
  condition: string | null;
}

export interface TechPreset {
  key: TechKey;
  label: string;
  /** Grid uses a different input set entirely — see GridInputs. */
  usesGridInputs: boolean;
  /** Shown under the dropdown so the empty state reads as intent, not breakage. */
  note: string;
  inputs: TechInputs;
  /** Present when the source publishes more than one capex case. */
  capexCases?: CapexCase[];
  /**
   * Set on presets whose source models a capacity factor incompatible with a
   * BTM baseload comparison. Drives the warning on the CF field.
   */
  capacityFactorWarning?: string;
  /** The published heat-rate band, shown beside the derived efficiency. */
  heatRateNote?: string;
}

/** Every numeric field unset. The units are the contract; the values are yours. */
function emptyTech(): TechInputs {
  return {
    efficiencyPct: needsInput('%'),
    capexPerKw: needsInput('$/kW'),
    omPerKwYr: needsInput('$/kW-yr'),
    variableOmPerMwh: needsInput('$/MWh'),
    redundancyPct: needsInput('%'),
    serviceIntervalHrs: needsInput('hrs'),
    tempDeratePct: needsInput('%'),
    minUnitMw: needsInput('MW'),
    leadTimeMonths: needsInput('months'),
    assetLifeYears: needsInput('years'),
  };
}

/**
 * Efficiency from a published heat-rate band.
 *
 * Lazard publishes heat rate; this module's input is efficiency, and the two
 * are the same equation read in opposite directions (η = 3412 / HR). The
 * conversion is exact, so the tier carries through — but the source string
 * names the heat rate it came from, because a plant engineer who checks will
 * check against the heat rate, not the percentage.
 *
 * Note the inversion: the LOW heat rate is the HIGH efficiency.
 */
function efficiencyFromHeatRate(hrLow: number, hrHigh: number): Sourced {
  // Midpoint of the HEAT RATE band, then converted — not the midpoint of the
  // converted efficiencies. The two differ (η is 1/HR, so the mapping is not
  // linear): for the peaking band they are 31.81% and 31.87%. Taking the heat
  // rate midpoint means the derived read-out under the slider shows exactly
  // 10,725 Btu/kWh, the true middle of Lazard's published band — which is the
  // number a plant engineer will check against. No efficiency band is carried,
  // because a linear band in η would misrepresent a band published in HR.
  const midHeatRate = (hrLow + hrHigh) / 2;
  return {
    value: (3412 / midHeatRate) * 100,
    unit: '%',
    tier: 'verified',
    source: `${LAZARD} — derived from heat rate ${hrLow.toLocaleString()}–${hrHigh.toLocaleString()} Btu/kWh (midpoint ${midHeatRate.toLocaleString()})`,
    retrievedAt: LAZARD_DATE,
  };
}

const NEEDS_SOURCING =
  'Values need sourcing — enter from a spec sheet or published dataset and the chip will show your entry as untagged, which is honest: it is your number.';

const CF_WARNING =
  'Lazard models this at 10–15% capacity factor. BTM competitors run 80–95%. Their CF is deliberately NOT loaded — using it would spread capex over a tenth of the output and inflate their LCOE, making our comparison look better than it is.';

/** Fields Lazard v18.0 does not publish, shared by both turbine presets. */
function lazardUnsourced() {
  return {
    redundancyPct: needsInput('%'),
    serviceIntervalHrs: needsInput('hrs'),
    tempDeratePct: needsInput('%'),
    minUnitMw: needsInput('MW'),
  };
}

export const PRESETS: TechPreset[] = [
  {
    key: 'sofc',
    label: 'Fuel cell (SOFC)',
    usesGridInputs: false,
    note: `Not covered by Lazard v18.0. ${NEEDS_SOURCING}`,
    inputs: emptyTech(),
  },
  {
    key: 'sc-gas-turbine',
    label: 'Simple-cycle gas turbine',
    usesGridInputs: false,
    note: `Seeded from ${LAZARD} — "Gas Peaking, New Build". Ranges shown as midpoints; every value editable.`,
    capacityFactorWarning: CF_WARNING,
    heatRateNote: 'Lazard published band: 10,275–11,175 Btu/kWh',
    inputs: {
      ...lazardUnsourced(),
      efficiencyPct: efficiencyFromHeatRate(10_275, 11_175),
      capexPerKw: sourcedRange(1150, 1450, '$/kW', 'verified', LAZARD, LAZARD_DATE),
      omPerKwYr: sourcedRange(10.0, 17.0, '$/kW-yr', 'verified', LAZARD, LAZARD_DATE),
      variableOmPerMwh: sourcedRange(3.5, 5.0, '$/MWh', 'verified', LAZARD, LAZARD_DATE),
      leadTimeMonths: sourced(24, 'months', 'verified', `${LAZARD} — construction period`, LAZARD_DATE),
      assetLifeYears: sourced(30, 'years', 'verified', `${LAZARD} — asset life`, LAZARD_DATE),
    },
  },
  {
    key: 'cc-gas-turbine',
    label: 'Combined-cycle gas turbine',
    usesGridInputs: false,
    note: `Seeded from ${LAZARD} — "Gas Combined Cycle, New Build". Two capex cases published; pick one below.`,
    capacityFactorWarning: CF_WARNING,
    heatRateNote: 'Lazard published band: 6,475–6,550 Btu/kWh',
    capexCases: [
      {
        id: 'base',
        label: '$1,200–1,600/kW — base case',
        capex: sourcedRange(1200, 1600, '$/kW', 'verified', LAZARD, LAZARD_DATE),
        condition: "Lazard's headline new-build case.",
      },
      {
        id: 'market-quotes',
        label: '$2,400–2,600/kW — recent market quotes',
        capex: sourcedRange(
          2400,
          2600,
          '$/kW',
          'verified',
          `${LAZARD} — recent market quotes`,
          LAZARD_DATE,
        ),
        condition:
          'Applies to post-2028 commercial operation date. Roughly double the base case — if the competing project has a post-2028 COD, this is the honest number to compare against.',
      },
    ],
    inputs: {
      ...lazardUnsourced(),
      efficiencyPct: efficiencyFromHeatRate(6475, 6550),
      capexPerKw: sourcedRange(1200, 1600, '$/kW', 'verified', LAZARD, LAZARD_DATE),
      omPerKwYr: sourcedRange(10.0, 25.5, '$/kW-yr', 'verified', LAZARD, LAZARD_DATE),
      variableOmPerMwh: sourcedRange(2.75, 5.0, '$/MWh', 'verified', LAZARD, LAZARD_DATE),
      leadTimeMonths: sourced(24, 'months', 'verified', `${LAZARD} — construction period`, LAZARD_DATE),
      assetLifeYears: sourced(30, 'years', 'verified', `${LAZARD} — asset life`, LAZARD_DATE),
    },
  },
  {
    key: 'recip-engine',
    label: 'Gas reciprocating engine',
    usesGridInputs: false,
    note: `Not covered by Lazard v18.0. ${NEEDS_SOURCING}`,
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

/** Sanity check used by the preset test: derived efficiency must round-trip. */
export function heatRateFor(preset: TechPreset): number | null {
  return heatRate(preset.inputs.efficiencyPct.value);
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
 * Capacity factor starts at 0.95 — a BTM baseload assumption — and is NEVER
 * overwritten by a preset. See the warning at the top of this file.
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
 * Deliberately NOT mapped onto the technology presets — it is a worked example
 * of the conversion at $4.00/MMBtu, not a set of per-technology values.
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
