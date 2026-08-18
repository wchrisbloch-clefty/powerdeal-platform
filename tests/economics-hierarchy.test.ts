import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  COST_DRIVERS,
  CONSTRAINTS,
  isCostDriver,
  GROUP_COPY,
} from '@/lib/economics/model-inputs';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE SPLIT IS ASSERTED AGAINST THE MODEL, NOT AGAINST MY MEMORY.
 * ═══════════════════════════════════════════════════════════════
 *
 * The Economics panel rendered fourteen inputs in one stack at identical
 * weight — label, provenance chip, number box, slider, hint. Five of them are
 * never read by computeLcoe. A slider that visibly does nothing to the answer
 * is the strongest available claim that it should.
 *
 * Splitting them into two groups only helps if the membership is RIGHT, and a
 * hand-typed list is exactly the kind of enumeration that drifts silently: add
 * a lever to the model, forget to move it here, and the panel keeps rendering
 * with one field in the wrong half and no symptom anywhere.
 *
 * So the group is checked against computeLcoe's source text. N comes from the
 * function, not from this file.
 */

const LCOE = 'lib/economics/lcoe.ts';

/** computeLcoe's body, brace-matched. */
async function computeLcoeBody(): Promise<string> {
  const src = await readFile(LCOE, 'utf8');
  const start = src.indexOf('export function computeLcoe');
  expect(start, 'computeLcoe not found in lcoe.ts').toBeGreaterThan(-1);

  /*
    ⚠️ THE FIRST VERSION TOOK `indexOf('{', indexOf(')', start))` AND GOT THE
    RETURN TYPE. computeLcoe is declared

      export function computeLcoe(…): { breakdown: … | null; missing: … } {

    so the first brace after the first `)` opens the ANNOTATION, not the body.
    It returned 58 characters of type declaration. Two of the three membership
    assertions would have passed on it — "no constraint appears in this string"
    is trivially true of a string containing almost nothing — and only the
    length guard caught it. That guard is the reason this function is trusted.

    Params are paren-matched; then any brace group before the body is skipped
    as the return annotation.
  */
  let i = src.indexOf('(', start);
  let parens = 0;
  do {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') parens -= 1;
    i += 1;
  } while (i < src.length && parens > 0);

  // Skip the return-type annotation, brace groups and all, until the brace
  // that is followed by a newline — the body.
  while (i < src.length) {
    if (src[i] === '{') {
      let depth = 1;
      const open = i;
      i += 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
      // A body brace opens a new line; an inline return type does not.
      if (src[open + 1] === '\n') return src.slice(open + 1, i - 1);
      continue;
    }
    i += 1;
  }
  throw new Error('computeLcoe body not found');
}

describe('cost drivers vs constraints, derived from computeLcoe', () => {
  it('the extraction produced a real function body', async () => {
    // Rule 19: this check is subject to the defect it tests for. An empty or
    // truncated body would make every membership assertion below vacuous —
    // "no constraint appears in the model" is trivially true of "".
    const body = await computeLcoeBody();
    expect(body.length).toBeGreaterThan(500);
    expect(body).toContain('return {');
    expect(body).toContain('total:');
  });

  it('every declared cost driver actually appears in computeLcoe', async () => {
    const body = await computeLcoeBody();
    expect(COST_DRIVERS.length).toBeGreaterThan(0);
    for (const key of COST_DRIVERS) {
      expect(body, `${key} is declared a cost driver but computeLcoe never reads it`).toContain(
        key,
      );
    }
  });

  it('no declared constraint appears in computeLcoe', async () => {
    const body = await computeLcoeBody();
    expect(CONSTRAINTS.length).toBeGreaterThan(0);
    for (const key of CONSTRAINTS) {
      expect(body, `${key} is declared a constraint but computeLcoe reads it`).not.toContain(key);
    }
  });

  it('the two groups are disjoint and cover every input field', async () => {
    /*
      The completeness half. Membership being individually correct does not
      stop a field from belonging to NEITHER group and quietly vanishing from
      the panel — which is the failure mode that matters here, because a
      dropped input is a number the operator cannot enter at all.

      N is derived from the TYPE, so a field added to TechInputs or
      FinanceInputs joins this check by existing.
    */
    const types = await readFile('lib/economics/types.ts', 'utf8');
    const declared: string[] = [];
    for (const iface of ['TechInputs', 'FinanceInputs']) {
      const start = types.indexOf(`export interface ${iface} {`);
      expect(start, `${iface} not found`).toBeGreaterThan(-1);
      const block = types.slice(start, types.indexOf('\n}', start));
      for (const m of block.matchAll(/^\s{2}(\w+): Sourced;/gm)) declared.push(m[1]);
    }

    expect(declared.length).toBeGreaterThan(10);

    const grouped = new Set([...COST_DRIVERS, ...CONSTRAINTS]);
    expect(grouped.size, 'a key is in both groups').toBe(
      COST_DRIVERS.length + CONSTRAINTS.length,
    );
    for (const field of declared) {
      expect(grouped.has(field as never), `${field} belongs to neither group`).toBe(true);
    }
    expect(grouped.size).toBe(declared.length);
  });

  it('isCostDriver agrees with the arrays', () => {
    for (const k of COST_DRIVERS) expect(isCostDriver(k)).toBe(true);
    for (const k of CONSTRAINTS) expect(isCostDriver(k)).toBe(false);
    expect(isCostDriver('somethingElse')).toBe(false);
  });
});

describe('the panel renders the split it declares', () => {
  const PANEL = 'components/modules/economics-panel.tsx';

  it('the constraint fields moved out of the cost-driver sections', async () => {
    const src = await readFile(PANEL, 'utf8');

    // Each constraint field is rendered exactly once — moved, not duplicated,
    // and not dropped. A field that lost its control is worse than one in the
    // wrong group: the operator cannot enter the number at all.
    for (const key of CONSTRAINTS) {
      const uses = [...src.matchAll(new RegExp(`setTechField\\('${key}'\\)`, 'g'))];
      expect(uses, `${key} rendered ${uses.length} times, expected 1`).toHaveLength(1);
    }
    for (const key of COST_DRIVERS) {
      const uses = [
        ...src.matchAll(new RegExp(`set(?:Tech|Finance)Field\\('${key}'\\)`, 'g')),
      ];
      expect(uses, `${key} rendered ${uses.length} times, expected 1`).toHaveLength(1);
    }

    // And the constraints section exists, below the cost drivers.
    const constraintsAt = src.indexOf('GROUP_COPY.constraints.title');
    const financeAt = src.indexOf('GROUP_COPY.finance.title');
    expect(constraintsAt).toBeGreaterThan(-1);
    expect(constraintsAt).toBeGreaterThan(financeAt);
  });

  it('nothing is disabled or defaulted by the regrouping', async () => {
    /*
      ⚠️ NON-GATING IS NOT NEGOTIABLE AND A REGROUPING IS EXACTLY WHERE IT WOULD
      SLIP. Every field keeps its control and its empty state; none acquires a
      `disabled` prop it did not have, and no constraint field gains a fabricated
      default. `disabled={isGrid}` on Fuel price is the one pre-existing case and
      is about a different technology, not about this split.
    */
    const src = await readFile(PANEL, 'utf8');
    const constraintsAt = src.indexOf('GROUP_COPY.constraints.title');
    const section = src.slice(constraintsAt, src.indexOf('</section>', constraintsAt));
    expect(section).not.toContain('disabled');
    // No value is supplied for a constraint — they read straight off `inputs`.
    for (const key of CONSTRAINTS) {
      expect(section).toContain(`inputs.${key}`);
    }
  });

  it('the result rail leads below the desktop breakpoint', async () => {
    /*
      The rail is the SECOND grid child, so under lg it stacked beneath every
      input card — the answer last, at the two breakpoints where this surface
      is actually used. Asserted as an ordering pair rather than a single class,
      because `order-1` alone is inert without the sibling's `order-2`.
    */
    const src = await readFile(PANEL, 'utf8');
    expect(src).toContain('order-2 space-y-5 lg:order-none');
    expect(src).toContain('order-1 space-y-4 lg:order-none');
  });

  it('section headings are louder than the fields they govern', async () => {
    /*
      They were `<p className="eyebrow">` — 2xs uppercase mono, the same step as
      the hint lines INSIDE each field and a step below the field labels. An
      eyebrow is a label above a heading; used as the heading it inverts the
      hierarchy it exists to create.
    */
    const src = await readFile(PANEL, 'utf8');
    const heading = src.slice(src.indexOf('function SectionHeading'));
    expect(heading.slice(0, 900)).toMatch(/text-base/);
    // Field labels are text-sm; a non-subordinate section heading must exceed
    // that, and the subordinate one must not fall below it.
    const field = await readFile('components/modules/economics/sourced-field.tsx', 'utf8');
    expect(field).toContain('text-sm font-medium text-text');

    /*
      And no INPUT SECTION still uses eyebrow as its heading. Scoped to the
      sections rather than the file: `.eyebrow` is correct where it is actually
      an eyebrow — above the LCOE figure, above the scenario tray title, on the
      deal-context strip. The defect was using it AS the heading.
    */
    expect(src).not.toContain('eyebrow mb-1');
    expect(src).not.toContain('eyebrow">Technology inputs');
    expect(src).not.toContain('eyebrow">Financial assumptions');
  });

  it('the group copy says what the constraints group is for', () => {
    // The second sentence carries the honesty: these are real and they are not
    // in the equation. Both halves asserted so neither can be trimmed away.
    expect(GROUP_COPY.constraints.body).toContain('NOT in the cost equation');
    expect(GROUP_COPY.constraints.body).toContain('decide a deal');
  });
});
