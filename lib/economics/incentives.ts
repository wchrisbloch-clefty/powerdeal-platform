import type { IncentiveDef, IncentiveSelection, TechKey } from './types';
import { needsInput } from './types';

/**
 * INCENTIVES — separate line items, never one lumped adjustment.
 *
 * Eligibility varies by jurisdiction, technology and placed-in-service date. A
 * single rolled-up "incentives" figure is exactly what collapses the first time
 * someone in the buyer's finance org asks which of these the project actually
 * qualifies for.
 *
 * No default AMOUNTS are seeded here. Statutory rates change, carry
 * step-downs and bonus adders, and are conditional in ways a stored constant
 * cannot express. The definitions below describe the SHAPE of each line item —
 * its unit, how it converts to ¢/kWh, and the condition it is valid under. The
 * figure itself is the user's, entered against their own deal facts.
 */
export const INCENTIVES: IncentiveDef[] = [
  {
    key: 'itc-48e',
    label: 'ITC / 48E',
    unit: '% of capex',
    basis: 'capex-pct',
    condition:
      'Conditional on technology eligibility and placed-in-service date. Confirm the applicable rate and any bonus adders against current guidance for this project.',
    appliesTo: 'all',
  },
  {
    key: 'rec',
    label: 'RECs',
    unit: '$/MWh',
    // The condition is resolved per-selection by conditionFor() in lcoe.ts,
    // because it depends on the fuel pathway chosen below.
    condition: null,
    basis: 'per-mwh',
    appliesTo: ['sofc', 'sc-gas-turbine', 'cc-gas-turbine', 'recip-engine', 'custom'],
  },
  {
    key: '45q',
    label: '45Q (CCUS)',
    unit: '$/tonne',
    basis: 'per-tonne',
    condition:
      'Requires captured and sequestered CO2. Converting $/tonne to ¢/kWh needs a capture rate and sequestration pathway this module does not yet collect — the line item is itemized but its contribution is left blank rather than estimated.',
    appliesTo: 'all',
  },
  {
    key: 'chp',
    label: 'CHP credit',
    unit: '$/MWh',
    basis: 'per-mwh',
    condition:
      'Requires a qualifying thermal host and useful thermal output. Varies by program.',
    appliesTo: ['sofc', 'sc-gas-turbine', 'cc-gas-turbine', 'recip-engine', 'custom'],
  },
  {
    key: 'state',
    label: 'State incentive',
    unit: '$/MWh',
    basis: 'per-mwh',
    condition: 'Varies by state. Confirm against the program rules for this deal.',
    appliesTo: 'all',
  },
  {
    key: 'local-property-tax',
    label: 'Local / property tax',
    unit: '$/kW-yr',
    basis: 'per-kw-yr',
    condition: 'Varies by jurisdiction. Typically an abatement, entered as an annual benefit.',
    appliesTo: 'all',
  },
];

/**
 * The REC fuel-pathway rule, enforced structurally.
 *
 * A REC line item cannot exist without a pathway: the type requires it, this
 * factory sets it, and conditionFor() renders it inline on every surface
 * including exports. There is no code path that produces a bare $/MWh REC
 * figure, because that figure means different things on different fuels and the
 * difference is the whole point.
 */
export function defaultSelections(tech: TechKey): IncentiveSelection[] {
  return INCENTIVES.filter(
    (def) => def.appliesTo === 'all' || def.appliesTo.includes(tech),
  ).map((def) => ({
    key: def.key,
    enabled: false,
    amount: needsInput(def.unit),
    ...(def.key === 'rec' ? { fuelPathway: 'pipeline-natural-gas' as const } : {}),
  }));
}

export function incentiveDef(key: string): IncentiveDef | undefined {
  return INCENTIVES.find((d) => d.key === key);
}
