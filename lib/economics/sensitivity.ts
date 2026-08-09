import type { FinanceInputs, Sourced, TechInputs } from './types';
import { computeLcoe } from './lcoe';

/**
 * SENSITIVITY (spec 1.8)
 *
 * For the current configuration, which lever actually moves LCOE.
 *
 * Each input is swept across a range with everything else held constant, and
 * the levers are ranked by absolute swing. Fuel price, capacity factor and cost
 * of capital usually dominate; capex usually does not, which is counter to what
 * most buyers assume and is therefore the point of showing it.
 */

export interface SensitivityRow {
  field: string;
  label: string;
  /** The value swept from / to, in the input's own unit. */
  low: number;
  high: number;
  unit: string;
  /** LCOE at each end, ¢/kWh. */
  lcoeAtLow: number;
  lcoeAtHigh: number;
  /** Absolute swing, ¢/kWh — the ranking key. */
  swing: number;
  /** True when a higher input value LOWERS lcoe (efficiency, capacity factor). */
  inverse: boolean;
}

/** Relative sweep, used where no natural bound exists. */
const SWEEP = 0.25;

interface Lever {
  field: string;
  label: string;
  unit: string;
  get: (t: TechInputs, f: FinanceInputs) => number | null;
  set: (t: TechInputs, f: FinanceInputs, v: number) => [TechInputs, FinanceInputs];
  /** Physical or definitional ceiling, applied after the relative sweep. */
  max?: number;
  min?: number;
}

/** Swept values keep the original provenance — only the number moves. */
const set = (s: Sourced, v: number): Sourced => ({ ...s, value: v });

const LEVERS: Lever[] = [
  {
    field: 'fuelPricePerMmbtu',
    label: 'Fuel price',
    unit: '$/MMBtu',
    min: 0,
    get: (_t, f) => f.fuelPricePerMmbtu.value,
    set: (t, f, v) => [t, { ...f, fuelPricePerMmbtu: set(f.fuelPricePerMmbtu, v) }],
  },
  {
    field: 'capacityFactor',
    label: 'Capacity factor',
    unit: 'fraction',
    min: 0.05,
    max: 1,
    get: (_t, f) => f.capacityFactor.value,
    set: (t, f, v) => [t, { ...f, capacityFactor: set(f.capacityFactor, v) }],
  },
  {
    field: 'costOfCapitalPct',
    label: 'Cost of capital',
    unit: '%',
    min: 0,
    get: (_t, f) => f.costOfCapitalPct.value,
    set: (t, f, v) => [t, { ...f, costOfCapitalPct: set(f.costOfCapitalPct, v) }],
  },
  {
    field: 'capexPerKw',
    label: 'Capex',
    unit: '$/kW',
    min: 0,
    get: (t) => t.capexPerKw.value,
    set: (t, f, v) => [{ ...t, capexPerKw: set(t.capexPerKw, v) }, f],
  },
  {
    field: 'efficiencyPct',
    label: 'Efficiency',
    unit: '%',
    min: 1,
    max: 100,
    get: (t) => t.efficiencyPct.value,
    set: (t, f, v) => [{ ...t, efficiencyPct: set(t.efficiencyPct, v) }, f],
  },
  {
    field: 'omPerKwYr',
    label: 'O&M',
    unit: '$/kW-yr',
    min: 0,
    get: (t) => t.omPerKwYr.value,
    set: (t, f, v) => [{ ...t, omPerKwYr: set(t.omPerKwYr, v) }, f],
  },
  {
    field: 'redundancyPct',
    label: 'Redundancy',
    unit: '%',
    min: 0,
    get: (t) => t.redundancyPct.value,
    set: (t, f, v) => [{ ...t, redundancyPct: set(t.redundancyPct, v) }, f],
  },
  {
    field: 'termYears',
    label: 'Term',
    unit: 'years',
    min: 1,
    get: (_t, f) => f.termYears.value,
    set: (t, f, v) => [t, { ...f, termYears: set(f.termYears, v) }],
  },
];

/**
 * Returns levers ranked by absolute LCOE swing, largest first.
 *
 * A lever whose current value is unset is skipped rather than swept from an
 * assumed base — a sensitivity ranking built on a guessed capex ranks the
 * guess, not the project.
 */
export function sensitivity(tech: TechInputs, finance: FinanceInputs): SensitivityRow[] {
  const base = computeLcoe(tech, finance);
  if (!base.breakdown) return [];

  const rows: SensitivityRow[] = [];

  for (const lever of LEVERS) {
    const current = lever.get(tech, finance);
    if (current === null || !Number.isFinite(current)) continue;

    let low = current * (1 - SWEEP);
    let high = current * (1 + SWEEP);
    if (lever.min !== undefined) low = Math.max(low, lever.min);
    if (lever.max !== undefined) high = Math.min(high, lever.max);
    // A value already pinned at its bound has nothing to sweep.
    if (!(high > low)) continue;

    const [tLow, fLow] = lever.set(tech, finance, low);
    const [tHigh, fHigh] = lever.set(tech, finance, high);
    const atLow = computeLcoe(tLow, fLow).breakdown;
    const atHigh = computeLcoe(tHigh, fHigh).breakdown;
    if (!atLow || !atHigh) continue;

    rows.push({
      field: lever.field,
      label: lever.label,
      low,
      high,
      unit: lever.unit,
      lcoeAtLow: atLow.total,
      lcoeAtHigh: atHigh.total,
      swing: Math.abs(atHigh.total - atLow.total),
      inverse: atHigh.total < atLow.total,
    });
  }

  return rows.sort((a, b) => b.swing - a.swing);
}
