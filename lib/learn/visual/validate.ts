import {
  MAX_SERIES,
  REQUESTABLE_KINDS,
  type Basis,
  type ContrastRow,
  type Datum,
  type Step,
  type Visual,
  type VisualKind,
} from './schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * PARSE-TIME REJECTION. THE MODEL'S OUTPUT IS UNTRUSTED INPUT.
 * ═══════════════════════════════════════════════════════════════
 *
 * Enforcement point (b). A colour cannot reach the renderer because no field
 * accepts one — but a TypeScript type is a compile-time claim about a runtime
 * value that arrived as JSON, and a claim is not a check. This is the check.
 *
 * ══ IT NEVER RETURNS NOTHING ══
 *
 * ⚠️ A REJECTED VISUAL BECOMES AN `unrenderable`, NOT A NULL. Dropping it
 * silently makes a schema violation look like a model deciding there was
 * nothing worth drawing, and those two are indistinguishable to a reader —
 * which is the defect class this whole build has been closing. The failure has
 * to be visible and specific: which shape was wanted, and why it is not
 * available.
 *
 * So `validateVisual` always returns a `Visual`. The question is only which
 * one.
 */

export interface ValidationOutcome {
  visual: Visual;
  /** Empty when the input validated as requested. */
  problems: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * ⚠️ THE COLOUR SCAN, AND IT IS BELT AND BRACES.
 *
 * No schema field accepts a colour, so in principle this can never fire. It
 * exists because "in principle" is what every silent failure in this codebase
 * had going for it — and because a model that wants to specify a colour will
 * put it somewhere it fits: a label reading "Capex (#4472C4)", a title, a
 * takeaway. Those are string fields and they render.
 *
 * Matches the notations a model actually emits. `var(--…)` is deliberately NOT
 * matched: a token reference in prose is a reference to our own vocabulary,
 * and the renderer never interpolates a string into a style anyway.
 */
const COLOUR_NOTATION =
  /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(|\bcolor-mix\s*\(/i;

function colourIn(label: string, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = COLOUR_NOTATION.exec(value);
  if (!m) return null;
  return `${label} contains a colour literal ("${m[0]}"). Colour is chosen by the renderer from the token palette; a generated visual never specifies one.`;
}

function readBasis(v: unknown, where: string, problems: string[]): Basis | null {
  if (!isRecord(v)) {
    problems.push(`${where}: no basis. Every number states where it came from.`);
    return null;
  }
  const source = str(v.source);
  const kind = v.kind;
  if (!source) {
    problems.push(`${where}: basis.source is empty. An unattributed number is the Economics preset problem in a new medium.`);
    return null;
  }
  if (kind !== 'sourced' && kind !== 'derived' && kind !== 'illustrative') {
    problems.push(`${where}: basis.kind is "${String(kind)}", not sourced | derived | illustrative.`);
    return null;
  }
  const bad = colourIn(`${where}.basis.source`, source);
  if (bad) problems.push(bad);
  return { source, kind };
}

function readDatum(v: unknown, where: string, problems: string[]): Datum | null {
  if (!isRecord(v)) {
    problems.push(`${where} is not an object.`);
    return null;
  }
  const label = str(v.label);
  const unit = str(v.unit);
  const value = v.value;
  const series = v.series;

  if (!label) problems.push(`${where}.label is empty.`);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${where}.value is not a finite number.`);
  }
  if (!unit) {
    problems.push(`${where}.unit is empty. A bare number on a chart is a number without a claim.`);
  }
  if (typeof series !== 'number' || !Number.isInteger(series) || series < 0 || series >= MAX_SERIES) {
    problems.push(
      `${where}.series is ${String(series)}; the palette holds ${MAX_SERIES}. ` +
        `Wrapping would give two categories one colour, which is a chart lying about how many things it shows.`,
    );
  }
  for (const [k, val] of [['label', label], ['unit', unit]] as const) {
    const bad = colourIn(`${where}.${k}`, val);
    if (bad) problems.push(bad);
  }
  const basis = readBasis(v.basis, where, problems);

  if (!label || !unit || !basis || typeof value !== 'number') return null;
  return { label, value, unit, series: series as Datum['series'], basis };
}

function readStep(v: unknown, where: string, problems: string[]): Step | null {
  if (!isRecord(v)) {
    problems.push(`${where} is not an object.`);
    return null;
  }
  const label = str(v.label);
  const operation = str(v.operation);
  const hasValue = v.value !== null && v.value !== undefined;

  if (!label) problems.push(`${where}.label is empty.`);
  if (!operation) {
    problems.push(`${where}.operation is empty. A step that does not say what it does is a box.`);
  }
  if (hasValue && (typeof v.value !== 'number' || !Number.isFinite(v.value))) {
    problems.push(`${where}.value is present and not a finite number.`);
  }
  // A step with a value needs a unit; a step without one legitimately has neither.
  const unit = str(v.unit);
  if (hasValue && !unit) problems.push(`${where} has a value and no unit.`);

  for (const [k, val] of [['label', label], ['operation', operation], ['unit', unit]] as const) {
    const bad = colourIn(`${where}.${k}`, val);
    if (bad) problems.push(bad);
  }
  const basis = readBasis(v.basis, where, problems);

  if (!label || !operation || !basis) return null;
  return {
    label,
    value: hasValue ? (v.value as number) : null,
    unit: unit ?? null,
    operation,
    basis,
  };
}

function readRow(v: unknown, where: string, problems: string[]): ContrastRow | null {
  if (!isRecord(v)) {
    problems.push(`${where} is not an object.`);
    return null;
  }
  const dimension = str(v.dimension);
  const left = str(v.left);
  const right = str(v.right);
  const favours = v.favours;

  if (!dimension) problems.push(`${where}.dimension is empty.`);
  if (!left) problems.push(`${where}.left is empty.`);
  if (!right) problems.push(`${where}.right is empty.`);
  if (favours !== 'left' && favours !== 'right' && favours !== 'neither') {
    problems.push(`${where}.favours is "${String(favours)}", not left | right | neither.`);
  }
  for (const [k, val] of [['dimension', dimension], ['left', left], ['right', right]] as const) {
    const bad = colourIn(`${where}.${k}`, val);
    if (bad) problems.push(bad);
  }

  if (!dimension || !left || !right || (favours !== 'left' && favours !== 'right' && favours !== 'neither')) {
    return null;
  }
  return { dimension, left, right, favours };
}

/**
 * Turn untrusted JSON into a Visual, or into an honest account of why not.
 */
export function validateVisual(input: unknown): ValidationOutcome {
  const problems: string[] = [];

  if (!isRecord(input)) {
    return {
      visual: unrenderable('an object', 'The response was not a JSON object.', { bases: [], unfilled: [] }),
      problems: ['not an object'],
    };
  }

  const title = str(input.title) ?? 'Untitled';
  const takeaway = str(input.takeaway) ?? '';
  const kind = input.kind as VisualKind;

  for (const [k, val] of [['title', title], ['takeaway', takeaway]] as const) {
    const bad = colourIn(k, val);
    if (bad) problems.push(bad);
  }
  if (!takeaway) {
    problems.push('takeaway is empty. A visual with no stated point is decoration.');
  }

  if (!REQUESTABLE_KINDS.includes(kind)) {
    /*
      ⚠️ THIS IS THE CASE THE REQUIREMENT IS ABOUT. The model asked for a shape
      the schema does not have. Naming it — rather than dropping the visual —
      is what separates "the renderer cannot draw this" from "there was nothing
      to draw", and it is the only record of what the vocabulary is missing.
    */
    const wanted = str(input.kind) ?? str(input.wanted) ?? 'an unnamed shape';
    return {
      visual: unrenderable(
        wanted,
        `The renderer draws ${REQUESTABLE_KINDS.join(', ')} and nothing else. ` +
          `"${wanted}" is not one of them, so this concept needs a form the renderer does not have.`,
        readProvenance(input.provenance, problems),
      ),
      problems: [...problems, `unsupported kind: ${wanted}`],
    };
  }

  const provenance = readProvenance(input.provenance, problems);
  const base = { title, takeaway, provenance };

  if (kind === 'magnitude' || kind === 'parts') {
    const raw = Array.isArray(input.data) ? input.data : [];
    const data = raw
      .map((d, i) => readDatum(d, `data[${i}]`, problems))
      .filter((d): d is Datum => d !== null);

    if (data.length === 0) {
      problems.push('no usable data points.');
      return {
        visual: unrenderable(kind, 'Every data point failed validation, so there is nothing to draw.', provenance),
        problems,
      };
    }
    if (kind === 'magnitude') {
      const measure = str(input.measure);
      if (!measure) problems.push('measure is empty — the axis has no stated meaning.');
      return { visual: { kind, ...base, data, measure: measure ?? 'value' }, problems };
    }
    const whole = str(input.whole);
    if (!whole) problems.push('whole is empty — the parts do not say what they are parts of.');
    return { visual: { kind, ...base, data, whole: whole ?? 'total' }, problems };
  }

  if (kind === 'chain') {
    const raw = Array.isArray(input.steps) ? input.steps : [];
    const steps = raw
      .map((s, i) => readStep(s, `steps[${i}]`, problems))
      .filter((s): s is Step => s !== null);
    if (steps.length < 2) {
      problems.push('a chain needs at least two steps.');
      return {
        visual: unrenderable('chain', 'Fewer than two usable steps survived validation; a chain of one is a label.', provenance),
        problems,
      };
    }
    return { visual: { kind, ...base, steps }, problems };
  }

  const leftLabel = str(input.leftLabel);
  const rightLabel = str(input.rightLabel);
  const raw = Array.isArray(input.rows) ? input.rows : [];
  const rows = raw
    .map((r, i) => readRow(r, `rows[${i}]`, problems))
    .filter((r): r is ContrastRow => r !== null);

  if (!leftLabel || !rightLabel || rows.length === 0) {
    problems.push('a contrast needs both column labels and at least one row.');
    return {
      visual: unrenderable('contrast', 'Both column labels and at least one usable row are required.', provenance),
      problems,
    };
  }
  return { visual: { kind: 'contrast', ...base, leftLabel, rightLabel, rows }, problems };
}

function readProvenance(v: unknown, problems: string[]) {
  if (!isRecord(v)) {
    problems.push('provenance is missing. A visual that cannot say where its numbers came from does not render as if it could.');
    return { bases: [], unfilled: [] };
  }
  const bases = Array.isArray(v.bases)
    ? v.bases.map((b, i) => readBasis(b, `provenance.bases[${i}]`, problems)).filter((b): b is Basis => b !== null)
    : [];
  const unfilled = Array.isArray(v.unfilled)
    ? v.unfilled.map((u) => str(u)).filter((u): u is string => u !== null)
    : [];
  return { bases, unfilled };
}

function unrenderable(wanted: string, reason: string, provenance: { bases: Basis[]; unfilled: string[] }): Visual {
  return {
    kind: 'unrenderable',
    title: 'This needs a shape the renderer does not have',
    takeaway: reason,
    wanted,
    reason,
    provenance,
  };
}
