import { validateVisual } from './validate';
import type { Visual } from './schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * ONE OF EVERY SHAPE, RENDERED WHERE A CHECK CAN READ IT.
 * ═══════════════════════════════════════════════════════════════
 *
 * Enforcement point (c) reads COMPUTED styles off the rendered DOM and asserts
 * every fill and stroke resolves to a token declared in tokens.css. It cannot
 * do that against a surface that renders no visuals — and the Learn tab
 * renders none until a model has been asked for one, which a headless check
 * will never do.
 *
 * ⚠️ THE ALTERNATIVE WAS A CHECK THAT PASSES BECAUSE IT FOUND NOTHING. This
 * repo has shipped that three times: nine surfaces while the gap system lived
 * on a tenth, ten while eight Intelligence tabs were on none of them, and a
 * clean run against an app throwing on every page. "Nothing to inspect" is the
 * loudest possible finding, and the way to stop hearing it is to guarantee
 * there is something.
 *
 * ══ THESE GO THROUGH THE VALIDATOR ══
 *
 * Not hand-built `Visual` objects. A fixture that skips validation is a fixture
 * that can drift from what a real response produces — and then (c) checks a
 * shape the pipeline never emits. Same reason the seed's TS and SQL halves are
 * asserted against each other rather than trusted.
 *
 * ⚠️ THE NUMBERS ARE `illustrative` AND SAY SO. They are shaped like real
 * figures so the layout is exercised honestly, and none of them is a claim
 * about the world. Marking them is the same discipline as the SAMPLE prefix on
 * seed accounts: the mark is in the data, not in a banner beside it.
 */

const illustrative = { source: 'shape fixture — not a measured figure', kind: 'illustrative' as const };

const RAW: unknown[] = [
  {
    kind: 'magnitude',
    title: 'Levelized cost by technology',
    takeaway: 'The spread between technologies is wider than any single average suggests.',
    measure: '¢/kWh',
    data: [
      { label: 'Grid delivered', value: 14.2, unit: '¢/kWh', series: 0, basis: illustrative },
      { label: 'Behind-the-meter', value: 9.8, unit: '¢/kWh', series: 1, basis: illustrative },
      { label: 'Gas peaking', value: 21.6, unit: '¢/kWh', series: 2, basis: illustrative },
    ],
    provenance: { bases: [illustrative], unfilled: ['a sourced capex figure for this technology'] },
  },
  {
    kind: 'parts',
    title: 'What the levelized cost is made of',
    takeaway: 'Capex dominates, which is why the redundancy multiplier matters more than fuel.',
    whole: '¢/kWh, total',
    data: [
      { label: 'Capex', value: 5.4, unit: '¢/kWh', series: 0, basis: illustrative },
      { label: 'O&M', value: 1.9, unit: '¢/kWh', series: 1, basis: illustrative },
      { label: 'Fuel', value: 2.5, unit: '¢/kWh', series: 2, basis: illustrative },
    ],
    provenance: { bases: [illustrative], unfilled: [] },
  },
  {
    kind: 'chain',
    title: 'Efficiency to fuel cost',
    takeaway: 'Every fuel-cost argument runs through heat rate. Change efficiency and the rest follows.',
    steps: [
      { label: 'Efficiency', value: 60, unit: '%', operation: 'The starting figure, from the spec sheet.', basis: illustrative },
      { label: 'Heat rate', value: 5687, unit: 'Btu/kWh', operation: '3,412 divided by efficiency.', basis: illustrative },
      { label: 'Fuel cost', value: 2.5, unit: '¢/kWh', operation: 'Heat rate times fuel price, converted.', basis: illustrative },
    ],
    provenance: { bases: [illustrative], unfilled: [] },
  },
  {
    kind: 'contrast',
    title: 'Grid supply against behind-the-meter',
    takeaway: 'The tradeoff is not cost against reliability — it is who carries the schedule risk.',
    leftLabel: 'Grid',
    rightLabel: 'Behind-the-meter',
    rows: [
      { dimension: 'Cost trajectory', left: 'Escalates on a published schedule', right: 'Fixed at contract', favours: 'right' },
      { dimension: 'Time to power', left: 'Interconnection queue', right: 'Site-limited', favours: 'right' },
      { dimension: 'Capital required', left: 'None', right: 'Structure-dependent', favours: 'left' },
      { dimension: 'Permitting', left: 'Utility carries it', right: 'Site carries it', favours: 'neither' },
    ],
    provenance: { bases: [illustrative], unfilled: [] },
  },
  {
    /*
      ⚠️ THE FIFTH FIXTURE IS A FAILURE, ON PURPOSE. The unrenderable path is
      the one most likely to rot, because nothing in ordinary use exercises it
      and a reader only meets it when something has already gone wrong. It
      renders on the same surface as the other four so the check sees it every
      run.
    */
    kind: 'sankey',
    title: 'Where the energy goes',
    takeaway: 'A flow diagram would show the losses at each conversion.',
    provenance: { bases: [], unfilled: [] },
  },
];

/** Validated at module load, so a fixture that stops validating fails loudly. */
export const VISUAL_FIXTURES: Visual[] = RAW.map((r) => validateVisual(r).visual);
