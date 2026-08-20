import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateVisual } from '@/lib/learn/visual/validate';
import { MAX_SERIES, REQUESTABLE_KINDS } from '@/lib/learn/visual/schema';
import { visualInstruction } from '@/lib/learn/visual/prompt';

/**
 * ═══════════════════════════════════════════════════════════════
 * A MODEL EMITS #4472C4 CHEERFULLY WHILE A GREP PASSES CLEAN.
 * ═══════════════════════════════════════════════════════════════
 *
 * The offending string never exists in source — it arrives at runtime, in a
 * response — so source scanning is the wrong layer for this one.
 *
 * Three enforcement points, and this file covers the two that are testable in
 * a unit suite. The third reads the rendered DOM in scripts/render-check.mjs,
 * because a check is subject to the defects it tests for and something has to
 * read the artifact.
 */

const basis = { source: 'Lazard v18.0', kind: 'sourced' as const };
const datum = (over = {}) => ({ label: 'Capex', value: 1300, unit: '$/kW', series: 0, basis, ...over });
const provenance = { bases: [basis], unfilled: [] };

const magnitude = (over = {}) => ({
  kind: 'magnitude',
  title: 'LCOE by technology',
  takeaway: 'The spread is wider than the averages suggest.',
  measure: '¢/kWh',
  data: [datum()],
  provenance,
  ...over,
});

describe('a colour cannot reach the renderer', () => {
  it('there is no schema field that accepts one', async () => {
    /*
      The structural half. `series` is an INDEX; the renderer owns the mapping.
      Asserted against the schema source so a future field called `color`,
      `fill` or `stroke` fails here rather than at a customer.
    */
    const src = await readFile('lib/learn/visual/schema.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const field of ['color', 'colour', 'fill', 'stroke', 'background', 'hex']) {
      expect(
        new RegExp(`\\b${field}\\??:`, 'i').test(code),
        `the schema declares a "${field}" field; colour is the renderer's decision`,
      ).toBe(false);
    }
    expect(code).toContain('series: SeriesIndex');
  });

  it('a hex in any string field is rejected with a specific reason', () => {
    for (const field of ['title', 'takeaway'] as const) {
      const { problems } = validateVisual(magnitude({ [field]: `Capex #4472C4 breakdown` }));
      expect(problems.join(' ')).toContain('#4472C4');
      expect(problems.join(' ')).toContain('Colour is chosen by the renderer');
    }
    // And in the places a model would actually try to sneak one.
    const inLabel = validateVisual(magnitude({ data: [datum({ label: 'Capex (rgb(68,114,196))' })] }));
    expect(inLabel.problems.join(' ')).toContain('rgb(');
  });

  it('the notations a model actually emits are all caught', () => {
    for (const notation of ['#fff', '#4472C4', '#4472c4ff', 'rgb(1,2,3)', 'rgba(1,2,3,.5)', 'hsl(1 2% 3%)', 'oklch(0.5 0.1 200)']) {
      const { problems } = validateVisual(magnitude({ takeaway: `see ${notation} here` }));
      expect(problems.join(' '), notation).toContain('colour literal');
    }
  });

  it('a token reference in prose is NOT a finding', () => {
    // `var(--chart-1)` is a reference to our own vocabulary, and the renderer
    // never interpolates a string into a style. Flagging it would train the
    // reader to ignore this check.
    const { problems } = validateVisual(magnitude({ takeaway: 'drawn with var(--chart-1)' }));
    expect(problems.join(' ')).not.toContain('colour literal');
  });

  it('the instruction never shows a colour', () => {
    // A model shown an example containing a hex will produce hexes; examples
    // are the strongest instruction there is.
    const text = visualInstruction();
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(text).not.toMatch(/\brgba?\s*\(/i);
    // And it is built from the same constants the validator enforces.
    for (const k of REQUESTABLE_KINDS) expect(text).toContain(k);
    expect(text).toContain(String(MAX_SERIES - 1));
  });
});

describe('a shape the schema cannot express is a stated gap', () => {
  it('an unsupported kind names what was wanted and why it is unavailable', () => {
    const { visual, problems } = validateVisual({
      kind: 'sankey',
      title: 'Energy flow',
      takeaway: 'Where the losses are.',
      provenance,
    });
    expect(visual.kind).toBe('unrenderable');
    if (visual.kind !== 'unrenderable') throw new Error('unreachable');
    // Specific: which shape, and why not.
    expect(visual.wanted).toBe('sankey');
    expect(visual.reason).toContain('sankey');
    expect(visual.reason).toContain(REQUESTABLE_KINDS[0]);
    expect(problems.join(' ')).toContain('unsupported kind');
  });

  it('validation NEVER returns nothing', () => {
    /*
      ⚠️ THE REQUIREMENT. A silently dropped visual looks exactly like a model
      choosing not to make one, and a reader cannot tell those apart — which is
      the defect class this whole build has been closing.
    */
    for (const junk of [null, undefined, 42, 'a string', [], {}, { kind: 'magnitude' }]) {
      const { visual } = validateVisual(junk);
      expect(visual, `${JSON.stringify(junk)} produced no visual`).toBeTruthy();
      expect(typeof visual.kind).toBe('string');
    }
  });

  it('a shape that validates partially is not quietly half-drawn', () => {
    // Every datum failing means there is nothing to draw, and saying "chart"
    // over an empty axis is worse than saying it could not be drawn.
    const { visual } = validateVisual(magnitude({ data: [{ label: '', value: 'x' }] }));
    expect(visual.kind).toBe('unrenderable');
  });

  it('the renderer draws the unrenderable case rather than skipping it', async () => {
    const src = await readFile('components/learn/visual.tsx', 'utf8');
    expect(src).toContain("visual.kind === 'unrenderable' ? <Unrenderable");
    // Using the gap vocabulary, so it reads as a known state and not a bug.
    expect(src).toContain('kind="blocked"');
  });
});

describe('provenance is required, not attached afterwards', () => {
  it('a missing provenance is a problem, and the visual says so', () => {
    const { problems } = validateVisual({ ...magnitude(), provenance: undefined });
    expect(problems.join(' ')).toContain('provenance is missing');
  });

  it('every number carries a basis, and an unattributed one is rejected', () => {
    const { problems } = validateVisual(magnitude({ data: [datum({ basis: undefined })] }));
    expect(problems.join(' ')).toContain('no basis');
  });

  it('an empty basis source is not a basis', () => {
    const { problems } = validateVisual(magnitude({ data: [datum({ basis: { source: '  ', kind: 'sourced' } })] }));
    expect(problems.join(' ')).toContain('basis.source is empty');
  });

  it('illustrative is a distinct kind and is marked in the figure', async () => {
    const { visual, problems } = validateVisual(
      magnitude({ data: [datum({ basis: { source: 'worked example', kind: 'illustrative' } })] }),
    );
    expect(problems).toEqual([]);
    expect(visual.kind).toBe('magnitude');

    // Marked beside the number, not only in the footer — a reader who
    // screenshots one row does not get the footer.
    const src = await readFile('components/learn/visual.tsx', 'utf8');
    expect(src).toContain("basis.kind !== 'illustrative'");
    expect(src).toContain('BasisMark');
    const value = src.slice(src.indexOf('function Value('));
    expect(value.slice(0, 400)).toContain('<BasisMark');
  });

  it('the parts total is computed, never taken from the model', async () => {
    const src = await readFile('components/learn/visual.tsx', 'utf8');
    const parts = src.slice(src.indexOf('function Parts('));
    expect(parts.slice(0, 600)).toContain('v.data.reduce(');
    // And the schema offers nowhere to state one.
    const schema = await readFile('lib/learn/visual/schema.ts', 'utf8');
    expect(schema).not.toMatch(/\btotal\??:/);
  });
});

describe('the series index is bounded by the palette', () => {
  it('an index past the palette is rejected rather than wrapped', () => {
    const { problems } = validateVisual(magnitude({ data: [datum({ series: MAX_SERIES })] }));
    expect(problems.join(' ')).toContain('palette holds');
    // Wrapping would give two categories one colour.
    expect(problems.join(' ')).toContain('lying about how many things it shows');
  });

  it('every valid index is accepted', () => {
    for (let i = 0; i < MAX_SERIES; i += 1) {
      const { problems } = validateVisual(magnitude({ data: [datum({ series: i })] }));
      expect(problems, `series ${i} rejected`).toEqual([]);
    }
  });

  it('the renderer maps index to a token and nothing else', async () => {
    const src = await readFile('components/learn/visual.tsx', 'utf8');
    const fn = src.slice(src.indexOf('function seriesToken('), src.indexOf('export default'));
    expect(fn).toContain('CHART_SERIES_TOKENS');
    expect(fn).toContain('`var(${token})`');
    // No literal anywhere in the renderer.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/\brgba?\s*\(/i);
  });
});

describe('lib/learn stays structurally deal-free', () => {
  it('nothing under lib/learn imports a deal', async () => {
    // The guardrail from the original Learn build, still holding.
    async function walk(dir: string): Promise<string[]> {
      const out: string[] = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(full)));
        else if (e.name.endsWith('.ts')) out.push(full);
      }
      return out;
    }
    const files = await walk('lib/learn');
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${f} imports deal data`).not.toMatch(/from '@\/lib\/(data|deals)'/);
    }
  });

  it('no numeric score column arrives with the visual schema', async () => {
    // No scores, no mastery, no readiness index — and a schema is exactly
    // where one would arrive wearing a different name.
    const src = await readFile('lib/learn/visual/schema.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of ['score', 'mastery', 'proficiency', 'readiness', 'confidence', 'rating']) {
      expect(code.toLowerCase(), `schema declares "${banned}"`).not.toContain(`${banned}:`);
    }
  });
});
