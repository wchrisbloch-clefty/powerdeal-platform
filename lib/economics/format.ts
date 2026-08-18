import type { EconomicsResult, IncentiveSelection, Scenario } from './types';
import { conditionFor, incentiveContributions } from './lcoe';
import { incentiveDef } from './incentives';
import { presetFor } from './presets';

/**
 * Text rendering of a scenario.
 *
 * Lives in lib/ rather than the component because Part 2's business case
 * generator needs the same rendering, and two copies of "how we describe a
 * number" is how a figure ends up stated two different ways in two documents
 * that go to the same reader.
 */

const c = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(digits);

/**
 * Copy-summary text (spec 1.9).
 *
 * Conditions are rendered inline with their line items, not collected into a
 * footnote. The REC fuel-pathway condition in particular must travel with the
 * number wherever the number goes — that is the rule, and a summary is a
 * "wherever".
 */
export function summaryText(scenario: Scenario): string {
  const lines: string[] = [];
  const preset = presetFor(scenario.tech);

  lines.push(`${scenario.name} — ${preset.label}`);
  lines.push('');

  const { lcoe, grid } = scenario.result;

  if (lcoe) {
    lines.push(`LCOE  ${c(lcoe.total)}¢/kWh`);
    lines.push(`  Capex  ${c(lcoe.capex)}¢`);
    lines.push(`  O&M    ${c(lcoe.om)}¢`);
    lines.push(`  Fuel   ${c(lcoe.fuel)}¢`);
    lines.push('');
    lines.push('Derived');
    lines.push(`  Heat rate        ${c(lcoe.heatRateBtuPerKwh, 0)} Btu/kWh`);
    lines.push(`  Effective capex  $${c(lcoe.effectiveCapexPerKw, 0)}/kW (after redundancy)`);
    lines.push(`  CRF              ${c(lcoe.crf, 4)}`);
    lines.push('');
  }

  if (grid) {
    lines.push(`Grid supply — levelized ${c(grid.levelized)}¢/kWh`);
    lines.push(`  Year one       ${c(grid.yearOne)}¢`);
    lines.push(`  Energy         ${c(grid.energy)}¢`);
    lines.push(`  Demand         ${c(grid.demand)}¢`);
    lines.push(`  Transmission   ${c(grid.transmission)}¢`);
    lines.push(`  Ancillary      ${c(grid.ancillary)}¢`);
    if (grid.fourCp > 0) lines.push(`  4CP            ${c(grid.fourCp)}¢`);
    lines.push('');
  }

  const contributions = incentiveContributions(scenario.incentives, {
    effectiveCapexPerKw: lcoe?.effectiveCapexPerKw ?? null,
    capacityFactor: scenario.finance.capacityFactor.value,
    crf: lcoe?.crf ?? null,
  });

  if (contributions.length > 0) {
    lines.push('Incentives (itemized — never lumped)');
    for (const item of contributions) {
      lines.push(
        `  ${item.label}  ${item.cents === null ? 'contribution not computed' : `${c(item.cents)}¢/kWh`}`,
      );
      if (item.condition) lines.push(`      ${item.condition}`);
    }
    lines.push('');
  }

  const missing = scenario.result.missing;
  if (missing.length > 0) {
    lines.push(`INCOMPLETE — needs input: ${missing.map((m) => m.label).join(', ')}`);
    lines.push('');
  }

  lines.push(`Generated ${scenario.createdAt.slice(0, 10)} · PowerDeal economics`);
  return lines.join('\n');
}

/** Re-importable JSON (spec 1.9). */
export function exportJson(scenario: Scenario): string {
  return JSON.stringify({ powerdealEconomicsScenario: 1, scenario }, null, 2);
}

export function parseScenarioJson(text: string): Scenario | null {
  try {
    const parsed = JSON.parse(text);
    const s = parsed?.scenario ?? parsed;
    if (!s || typeof s !== 'object' || !s.id || !s.inputs || !s.finance) return null;
    return s as Scenario;
  } catch {
    return null;
  }
}

/** Per-component delta between the current configuration and a pinned one. */
export interface Delta {
  label: string;
  current: number | null;
  pinned: number | null;
  diff: number | null;
}

export function deltaRows(current: EconomicsResult, pinned: EconomicsResult): Delta[] {
  const pairs: [string, number | null, number | null][] = [
    ['Total', current.lcoe?.total ?? null, pinned.lcoe?.total ?? null],
    ['Capex', current.lcoe?.capex ?? null, pinned.lcoe?.capex ?? null],
    ['O&M', current.lcoe?.om ?? null, pinned.lcoe?.om ?? null],
    ['Fuel', current.lcoe?.fuel ?? null, pinned.lcoe?.fuel ?? null],
  ];

  return pairs.map(([label, cur, pin]) => ({
    label,
    current: cur,
    pinned: pin,
    diff: cur !== null && pin !== null ? cur - pin : null,
  }));
}

/** Conditions that must appear on any export carrying these selections. */
export function activeConditions(selections: IncentiveSelection[]): string[] {
  return selections
    .filter((s) => s.enabled)
    .map((s) => {
      const text = conditionFor(s, incentiveDef(s.key)?.condition ?? null);
      return text ? `${incentiveDef(s.key)?.label ?? s.key}: ${text}` : null;
    })
    .filter((t): t is string => Boolean(t));
}

/**
 * Lowercase a label's leading word only when doing so cannot destroy meaning.
 *
 * ⚠️ EXISTS BECAUSE `Needs ${labels.join(', ').toLowerCase()}` RENDERED
 * "Needs efficiency, capex $/kw, o&m $/kw-yr". kW is a kilowatt; kw is
 * nothing. O&M lowercased stops being an abbreviation. The lowercasing bought
 * a comma's worth of grammar after "Needs" and cost the units their meaning,
 * on the one line whose job is telling the reader which figure to go and find.
 *
 * ⚠️ AND IT LIVES HERE RATHER THAN IN THE PANEL BECAUSE A MUTATION SURVIVED.
 * The first version was a local helper in economics-panel.tsx, and the test
 * re-declared its own identical copy to check the boundary cases. Replacing
 * the panel's version with a plain `label.toLowerCase()` left every assertion
 * passing — the test was exercising a duplicate of the code, not the code.
 * A check that has its own copy of the thing it checks is checking nothing.
 */
export function soften(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}
