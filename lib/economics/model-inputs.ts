import type { FinanceInputs, TechInputs } from './types';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH INPUTS MOVE THE NUMBER, AND WHICH ONLY LOOK LIKE THEY DO.
 * ═══════════════════════════════════════════════════════════════
 *
 * The model panel renders fourteen fields in one stack. Each gets a label, a
 * provenance chip, a number box, a slider and up to three lines of subordinate
 * text, at identical weight. Five of them do not enter the LCOE at all.
 *
 *   assetLifeYears     deliberately not wired to the financing term
 *   serviceIntervalHrs a maintenance constraint
 *   tempDeratePct      a siting constraint
 *   minUnitMw          a sizing constraint
 *   leadTimeMonths     a schedule constraint
 *
 * `TechInputs` has said so in a comment since it was written — "Constraint
 * notes, not cost inputs — they never enter the LCOE." The type knew. The
 * surface did not, and a slider that visibly does nothing to the answer is the
 * strongest possible claim that it should.
 *
 * ⚠️ NOTHING IS REMOVED OR DISABLED. These are real fields a rep needs to
 * record — a 26-week lead time kills a deal that a good LCOE cannot save. They
 * are moved into their own section and named for what they are. Same controls,
 * same tokens, same reachability, at three breakpoints. Non-gating stands.
 *
 * ══ THE MEMBERSHIP IS ASSERTED AGAINST lcoe.ts, NOT TYPED FROM MEMORY ══
 *
 * tests/economics-hierarchy.test.ts reads computeLcoe's source and checks that
 * every key in COST_DRIVERS appears in it and no key in CONSTRAINTS does. A
 * hand-maintained list would drift the first time a lever is added to the
 * model, and it would drift SILENTLY — the panel would keep rendering, with
 * one field in the wrong half. That is the same failure as a hardcoded
 * enumeration reporting on the wrong N.
 */

export type TechKeyName = keyof TechInputs;
export type FinanceKeyName = keyof FinanceInputs;

/** Read by computeLcoe. Changing one changes the answer. */
export const COST_DRIVERS: readonly (TechKeyName | FinanceKeyName)[] = [
  'efficiencyPct',
  'capexPerKw',
  'redundancyPct',
  'omPerKwYr',
  'variableOmPerMwh',
  'fuelPricePerMmbtu',
  'capacityFactor',
  'costOfCapitalPct',
  'termYears',
];

/**
 * Recorded, never read by computeLcoe. Real constraints on the deal; not terms
 * in the cost equation.
 */
export const CONSTRAINTS: readonly TechKeyName[] = [
  'assetLifeYears',
  'serviceIntervalHrs',
  'tempDeratePct',
  'minUnitMw',
  'leadTimeMonths',
];

export function isCostDriver(key: string): boolean {
  return (COST_DRIVERS as readonly string[]).includes(key);
}

/**
 * The heading each group carries. Written here rather than at the call site
 * because the two sentences only make sense as a pair — the second one is
 * doing the work of explaining why the first exists.
 */
export const GROUP_COPY = {
  tech: {
    title: 'Cost drivers — plant',
    body: 'Capital and operating terms. Change one and the number above changes.',
  },
  finance: {
    title: 'Cost drivers — financing',
    body: 'Fuel, utilisation and the cost of money. The other half of the same equation.',
  },
  constraints: {
    title: 'Constraints',
    body:
      'Recorded against the deal and deliberately NOT in the cost equation — a lead ' +
      'time or a minimum unit size can decide a deal the number cannot. They sat in ' +
      'the stack above at the same weight as capex, which read as a claim that ' +
      'moving them moves the answer.',
  },
} as const;
