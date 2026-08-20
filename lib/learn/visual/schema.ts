import { CHART_SERIES_TOKENS } from '@/lib/design/chart-palette';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT A GENERATED VISUAL IS ALLOWED TO BE.
 * ═══════════════════════════════════════════════════════════════
 *
 * A model will emit `#4472C4` cheerfully while a grep over components/ passes
 * clean, because the offending string never exists in source — it arrives at
 * runtime, in a response. Source scanning is the wrong layer.
 *
 * So the model does not write a colour. It cannot: there is no field in this
 * schema that accepts one. A series carries an INDEX, the renderer maps that
 * index to `var(--chart-N)`, and the mapping is ours. The guarantee is
 * structural rather than behavioural — not "the model was told not to", but
 * "there is nowhere to put it".
 *
 * ══ FOUR SHAPES, DELIBERATELY ══
 *
 * Four that always render correctly beats twelve where three are unreliable.
 * These four cover what this domain actually needs to show:
 *
 *   magnitude  one number per label, compared        LCOE by technology
 *   parts      one bar, split into named components  capex / O&M / fuel
 *   chain      ordered steps, each feeding the next  efficiency → heat rate → ¢/kWh
 *   contrast   two columns, row-by-row               grid vs behind-the-meter
 *
 * ⚠️ A CONCEPT THIS CANNOT EXPRESS IS A GAP, NOT A SILENCE. `unrenderable` is
 * a first-class member of the union and the renderer draws it — naming the
 * shape that was wanted and why it is not available. A visual that is silently
 * dropped looks exactly like a model choosing not to make one, which is
 * indistinguishable from having nothing to say. The platform's thesis is that
 * a stated gap beats an invented value; a stated gap also beats an absence.
 *
 * ══ PROVENANCE IS REQUIRED, NOT ATTACHED AFTERWARDS ══
 *
 * Every visual carries `provenance`, and it is not optional in the type. A
 * chart with an invented axis is the Economics preset problem in a new medium:
 * a plausible-looking default renders identically to a sourced one and then
 * survives into a customer conversation because it looked fine.
 *
 * `basis` says where each number came from. `unfilled` names what was needed
 * and absent — which is the same distinction the gap system draws everywhere
 * else, arriving here as a list rather than as a silent zero.
 */

/** The four. Plus the fifth, which is the honest failure. */
export type VisualKind = 'magnitude' | 'parts' | 'chain' | 'contrast' | 'unrenderable';

/**
 * ⚠️ AN INDEX, NOT A COLOUR, AND THIS IS THE WHOLE ENFORCEMENT.
 *
 * Bounded by the palette's own length, so a fifth series is a validation error
 * rather than a silent wrap onto series one — two categories sharing a colour
 * is a chart that lies about how many things it is showing.
 */
export type SeriesIndex = 0 | 1 | 2 | 3;

export const MAX_SERIES = CHART_SERIES_TOKENS.length;

/** Where a number came from. Required per datum — no unattributed values. */
export interface Basis {
  /** One line. "Lazard v18.0, p.9" or "the deal record" or "worked example". */
  source: string;
  /**
   * ⚠️ `illustrative` IS NOT A SOFTER `sourced`. It marks a number chosen to
   * make a teaching point, which must never be quotable as a fact about the
   * world. The renderer marks these visibly; the two are not interchangeable
   * and a visual mixing them says so.
   */
  kind: 'sourced' | 'derived' | 'illustrative';
}

export interface Datum {
  label: string;
  value: number;
  /** Rendered verbatim. Never lower-cased — see lib/design/casing.ts. */
  unit: string;
  series: SeriesIndex;
  basis: Basis;
}

export interface Step {
  label: string;
  /** The value leaving this step, if there is one. Absent is legitimate. */
  value: number | null;
  unit: string | null;
  /** What this step does to what came in. One line. */
  operation: string;
  basis: Basis;
}

export interface ContrastRow {
  dimension: string;
  left: string;
  right: string;
  /** Which side this row favours, or neither. Never a score. */
  favours: 'left' | 'right' | 'neither';
}

export interface Provenance {
  /** Every distinct basis behind this visual, deduplicated by the caller. */
  bases: Basis[];
  /**
   * What the visual needed and did not have. Empty is a claim — that
   * everything required was present — so it is asserted rather than assumed.
   */
  unfilled: string[];
}

interface Base {
  title: string;
  /** One sentence saying what the reader should take from it. */
  takeaway: string;
  provenance: Provenance;
}

export interface MagnitudeVisual extends Base {
  kind: 'magnitude';
  data: Datum[];
  /** What the axis measures. Rendered as the axis label. */
  measure: string;
}

export interface PartsVisual extends Base {
  kind: 'parts';
  /** Components of one whole. The renderer computes the total; nobody states it. */
  data: Datum[];
  whole: string;
}

export interface ChainVisual extends Base {
  kind: 'chain';
  steps: Step[];
}

export interface ContrastVisual extends Base {
  kind: 'contrast';
  leftLabel: string;
  rightLabel: string;
  rows: ContrastRow[];
}

/**
 * The shape that could not be drawn, drawn.
 *
 * ⚠️ `wanted` IS FREE TEXT ON PURPOSE. It is the model's description of a
 * shape this schema does not have, which is the only useful record of what the
 * vocabulary is missing — and the input for widening it from use rather than
 * from theory.
 */
export interface UnrenderableVisual extends Base {
  kind: 'unrenderable';
  /** The shape that was wanted, in the model's words. */
  wanted: string;
  /** Why it cannot be drawn. Written by the validator, not the model. */
  reason: string;
}

export type Visual =
  | MagnitudeVisual
  | PartsVisual
  | ChainVisual
  | ContrastVisual
  | UnrenderableVisual;

/** The kinds a model may ask for. `unrenderable` is produced, never requested. */
export const REQUESTABLE_KINDS: VisualKind[] = ['magnitude', 'parts', 'chain', 'contrast'];
