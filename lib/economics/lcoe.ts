import type {
  EconomicsResult,
  FinanceInputs,
  GridBreakdown,
  GridInputs,
  IncentiveSelection,
  LcoeBreakdown,
  MissingInput,
  Sourced,
  TechInputs,
} from './types';
import { INCENTIVES } from './incentives';

/**
 * LCOE MATH — pure functions, no I/O, no React.
 *
 * Kept separate so it can be unit-tested and so the same math backs the UI, the
 * business case generator (Part 2) and the no-decision battlecard (Part 3).
 * Three implementations of the same formula would drift, and the one that
 * drifts is always the one in front of the customer.
 *
 * Every function returns null rather than a fallback when an input is missing.
 * A zero substituted for an unknown capex produces a confident, wrong LCOE.
 */

/** Btu per kWh. Physical constant — 1 kWh = 3,412.14 Btu. */
export const BTU_PER_KWH = 3412;
export const HOURS_PER_YEAR = 8760;

const v = (s: Sourced | undefined): number | null =>
  s && s.value !== null && Number.isFinite(s.value) ? s.value : null;

/**
 * Heat rate from efficiency.
 *
 * Displayed read-only beside the efficiency slider. A plant engineer thinks in
 * heat rate; showing the conversion is the credibility signal, not a UI detail.
 *
 *   53%   → 6,438 Btu/kWh
 *   45%   → 7,582
 *   42.5% → 8,028
 *   37%   → 9,222
 */
export function heatRate(efficiencyPct: number | null): number | null {
  if (efficiencyPct === null || efficiencyPct <= 0) return null;
  return BTU_PER_KWH / (efficiencyPct / 100);
}

/**
 * Fuel cost in ¢/kWh.
 *
 * At $4.00/MMBtu: 53% → 2.58¢, 45% → 3.03¢, 42.5% → 3.21¢, 37% → 3.69¢.
 */
export function fuelCents(
  heatRateBtuPerKwh: number | null,
  fuelPricePerMmbtu: number | null,
): number | null {
  if (heatRateBtuPerKwh === null || fuelPricePerMmbtu === null) return null;
  return (heatRateBtuPerKwh / 1_000_000) * fuelPricePerMmbtu * 100;
}

/**
 * Capital recovery factor.
 *
 * r = 0 is a real input (an internally-funded project modelled at zero cost of
 * capital), and the standard formula divides by zero there — it degenerates to
 * straight-line 1/n, which is the correct limit.
 */
export function crf(ratePct: number | null, termYears: number | null): number | null {
  if (ratePct === null || termYears === null || termYears <= 0) return null;
  const r = ratePct / 100;
  if (r === 0) return 1 / termYears;
  const compounded = Math.pow(1 + r, termYears);
  return (r * compounded) / (compounded - 1);
}

/**
 * Effective capex after redundancy overbuild.
 *
 * Technologies need different amounts of overbuild to serve the same firm load.
 * A buyer comparing nameplate $/kW is comparing the wrong number, and this is
 * the line where that becomes visible.
 */
export function effectiveCapex(
  capexPerKw: number | null,
  redundancyPct: number | null,
): number | null {
  if (capexPerKw === null) return null;
  return capexPerKw * (1 + (redundancyPct ?? 0) / 100);
}

/** Annualized $/kW → ¢/kWh at a given capacity factor. */
function perKwYearToCents(perKwYear: number, capacityFactor: number): number {
  return (perKwYear / (HOURS_PER_YEAR * capacityFactor)) * 100;
}

export function computeLcoe(
  tech: TechInputs,
  finance: FinanceInputs,
): { breakdown: LcoeBreakdown | null; missing: MissingInput[] } {
  const missing: MissingInput[] = [];
  const need = (s: Sourced | undefined, field: string, label: string) => {
    const n = v(s);
    if (n === null) missing.push({ field, label });
    return n;
  };

  const efficiency = need(tech.efficiencyPct, 'efficiencyPct', 'Efficiency');
  const capex = need(tech.capexPerKw, 'capexPerKw', 'Capex $/kW');
  const om = need(tech.omPerKwYr, 'omPerKwYr', 'O&M $/kW-yr');
  const fuelPrice = need(finance.fuelPricePerMmbtu, 'fuelPricePerMmbtu', 'Fuel price');
  const cf = need(finance.capacityFactor, 'capacityFactor', 'Capacity factor');
  const rate = need(finance.costOfCapitalPct, 'costOfCapitalPct', 'Cost of capital');
  const term = need(finance.termYears, 'termYears', 'Term');

  // Redundancy legitimately defaults to 0 (no overbuild) rather than blocking.
  const redundancy = v(tech.redundancyPct) ?? 0;

  const hr = heatRate(efficiency);
  const effCapex = effectiveCapex(capex, redundancy);
  const factor = crf(rate, term);

  if (missing.length > 0 || cf === null || cf <= 0 || effCapex === null || factor === null) {
    return {
      breakdown: null,
      missing:
        cf !== null && cf <= 0
          ? [...missing, { field: 'capacityFactor', label: 'Capacity factor must be above zero' }]
          : missing,
    };
  }

  const capexComponent = perKwYearToCents(effCapex * factor, cf);
  // Fixed O&M is per unit of CAPACITY and so divides by run hours; variable
  // O&M is already per unit of ENERGY and converts directly ($/MWh ÷ 10).
  // Dividing the variable term by capacity factor as well would double-count
  // utilisation and inflate O&M at low CF — where the peaking comparison lives.
  const omComponent =
    perKwYearToCents(om!, cf) + (v(tech.variableOmPerMwh) ?? 0) / 10;
  const fuelComponent = fuelCents(hr, fuelPrice) ?? 0;

  return {
    breakdown: {
      capex: capexComponent,
      om: omComponent,
      fuel: fuelComponent,
      total: capexComponent + omComponent + fuelComponent,
      heatRateBtuPerKwh: hr,
      effectiveCapexPerKw: effCapex,
      crf: factor,
    },
    missing: [],
  };
}

/**
 * Grid delivered cost, levelized over the same term.
 *
 * The levelization is what makes the no-decision case: each year's cost
 * escalates, and the levelized figure is the NPV of that escalating stream
 * divided by the NPV of the energy. A flat year-one number understates the
 * status quo by exactly the amount that matters.
 */
export function computeGrid(
  grid: GridInputs,
  finance: FinanceInputs,
  opts: { includeFourCp: boolean },
): { breakdown: GridBreakdown | null; missing: MissingInput[] } {
  const missing: MissingInput[] = [];
  const cf = v(finance.capacityFactor);
  const term = v(finance.termYears);
  const discount = v(finance.costOfCapitalPct);

  if (cf === null || cf <= 0) missing.push({ field: 'capacityFactor', label: 'Capacity factor' });
  if (term === null || term <= 0) missing.push({ field: 'termYears', label: 'Term' });
  if (discount === null) missing.push({ field: 'costOfCapitalPct', label: 'Cost of capital' });

  const energy = v(grid.energyCentsPerKwh);
  if (energy === null) missing.push({ field: 'energyCentsPerKwh', label: 'Energy charge' });

  if (missing.length > 0 || cf === null || term === null || discount === null || energy === null) {
    return { breakdown: null, missing };
  }

  // Both transmission forms are offered because utilities bill it either way.
  // They sum rather than override — a tariff can carry both.
  const demand = perKwYearToCents((v(grid.demandPerKwMonth) ?? 0) * 12, cf);
  const transmission =
    (v(grid.transmissionCentsPerKwh) ?? 0) +
    perKwYearToCents((v(grid.transmissionPerKwMonth) ?? 0) * 12, cf);
  const ancillary = v(grid.ancillaryCentsPerKwh) ?? 0;
  const fourCp = opts.includeFourCp ? perKwYearToCents(v(grid.fourCpPerKwYr) ?? 0, cf) : 0;

  const yearOne = energy + demand + transmission + ancillary + fourCp;

  const esc = (v(grid.escalationPct) ?? 0) / 100;
  const r = discount / 100;

  let pvCost = 0;
  let pvEnergy = 0;
  for (let t = 1; t <= Math.round(term); t++) {
    const df = Math.pow(1 + r, -t);
    pvCost += yearOne * Math.pow(1 + esc, t - 1) * df;
    pvEnergy += df;
  }

  return {
    breakdown: {
      energy,
      demand,
      transmission,
      ancillary,
      fourCp,
      yearOne,
      levelized: pvEnergy > 0 ? pvCost / pvEnergy : yearOne,
    },
    missing: [],
  };
}

/**
 * Incentive contributions, itemized.
 *
 * Returns one entry per enabled incentive rather than a total, because the
 * itemization IS the deliverable — a lumped adjustment is what collapses under
 * diligence.
 */
export function incentiveContributions(
  selections: IncentiveSelection[],
  ctx: { effectiveCapexPerKw: number | null; capacityFactor: number | null; crf: number | null },
): { key: string; label: string; cents: number | null; condition: string | null }[] {
  return selections
    .filter((s) => s.enabled)
    .map((s) => {
      const def = INCENTIVES.find((d) => d.key === s.key);
      const amount = v(s.amount);
      let cents: number | null = null;

      if (amount !== null && ctx.capacityFactor && ctx.capacityFactor > 0) {
        switch (def?.basis) {
          case 'capex-pct':
            // Reduces the financed capital, so it flows through CRF like capex.
            cents =
              ctx.effectiveCapexPerKw !== null && ctx.crf !== null
                ? -perKwYearToCents(
                    ctx.effectiveCapexPerKw * (amount / 100) * ctx.crf,
                    ctx.capacityFactor,
                  )
                : null;
            break;
          case 'per-mwh':
            cents = -amount / 10; // $/MWh → ¢/kWh
            break;
          case 'per-kwh':
            cents = -amount;
            break;
          case 'per-kw-yr':
            cents = -perKwYearToCents(amount, ctx.capacityFactor);
            break;
          case 'per-tonne':
            // Requires a CO2 capture rate this module does not yet collect.
            // Left null rather than guessed — see the note in incentives.ts.
            cents = null;
            break;
        }
      }

      return {
        key: s.key,
        label: def?.label ?? s.key,
        cents,
        condition: conditionFor(s, def?.condition ?? null),
      };
    });
}

/**
 * The rendered condition for an incentive.
 *
 * For RECs the fuel pathway is resolved into the text, so the condition that
 * travels into an export is the one that actually applies to this
 * configuration — not a generic footnote the reader has to interpret.
 */
export function conditionFor(sel: IncentiveSelection, base: string | null): string | null {
  if (sel.key !== 'rec') return base;
  return sel.fuelPathway === 'renewable-fuel'
    ? 'On renewable fuel: Class I REC eligible.'
    : 'On pipeline natural gas: qualifies under a state Alternative Portfolio Standard, not Class I. Class I eligibility requires an eligible renewable fuel.';
}

export function computeAll(
  tech: TechInputs,
  finance: FinanceInputs,
  grid: GridInputs,
  opts: { includeFourCp: boolean; gridOnly: boolean },
): EconomicsResult {
  const gridResult = computeGrid(grid, finance, opts);
  if (opts.gridOnly) {
    return { lcoe: null, grid: gridResult.breakdown, missing: gridResult.missing };
  }

  const lcoeResult = computeLcoe(tech, finance);
  return {
    lcoe: lcoeResult.breakdown,
    grid: gridResult.breakdown,
    // Grid is an optional comparison target when modelling a technology, so its
    // missing inputs do not block the LCOE result.
    missing: lcoeResult.missing,
  };
}
