import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CASE_BEARING, MANGLED_FORMS, mangledTokens } from '@/lib/design/casing';

/**
 * ═══════════════════════════════════════════════════════════════
 * NO USER-FACING STRING GETS ITS CASE FLATTENED.
 * ═══════════════════════════════════════════════════════════════
 *
 * The source half. `scripts/render-check.mjs` does the rendered half, and that
 * is the one that would have caught the original — a source scan can only see
 * the transform, not the sentence it produced.
 *
 * Both exist because they fail differently: this one catches a
 * `.toLowerCase()` written today, before anybody renders anything, and costs
 * nothing to run. The render pass catches the same defect arriving through CSS
 * `text-transform`, which no source scan can see at all.
 */

const ROOTS = ['app', 'components', 'lib'];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...(await walk(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments so a line DESCRIBING the defect is not read as the defect. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the vocabulary itself', () => {
  it('has tokens, and the mangled forms differ from the correct ones', () => {
    expect(CASE_BEARING.length).toBeGreaterThan(10);
    expect(MANGLED_FORMS.length).toBeGreaterThan(10);
    // A token that is already all-lowercase would make its own check vacuous.
    for (const t of CASE_BEARING) {
      expect(t, `${t} has no upper-case character to lose`).toMatch(/[A-Z]/);
    }
  });

  it('mangledTokens finds the real thing and not its neighbours', () => {
    // The sentence that shipped.
    expect(mangledTokens('Needs efficiency, capex $/kw, o&m $/kw-yr.')).toContain('$/kw');
    expect(mangledTokens('Needs efficiency, capex $/kw, o&m $/kw-yr.')).toContain('o&m');
    // The corrected sentence.
    expect(mangledTokens('Needs efficiency, capex $/kW, O&M $/kW-yr.')).toEqual([]);

    /*
      ⚠️ THE BOUNDARY CASES, AND THEY ARE THE WHOLE RISK. `m.includes('iat')`
      matched "associated" and sent a reader to look at a clock. A bare
      `includes('mw')` would match any word containing those two letters, and a
      check that cries wolf on ordinary prose is a check somebody turns off.
    */
    expect(mangledTokens('the somwhere typo')).toEqual([]);
    // ⚠️ THIS ASSERTION WAS WRONG FIRST TIME AND THE CHECK WAS RIGHT. It read
    // `mangledTokens('mwh is not mw')` and expected no 'mw' — but that string
    // ends in a standalone lowercase `mw`, which IS a mangled token. The test
    // was asserting the matcher should miss a real finding.
    expect(mangledTokens('mwh appears here')).not.toContain('mw');
    expect(mangledTokens('mwh is not mw')).toContain('mw');
    expect(mangledTokens('116 MW total')).toEqual([]);
    expect(mangledTokens('116 mw total')).toContain('mw');
    // Correctly-cased tokens never register, whatever surrounds them.
    expect(mangledTokens('MEDDPICC 0/8 · 116 MW · $/kW-yr · O&M')).toEqual([]);

    /*
      ⚠️ URLS AND IDENTIFIERS. The rendered pass found exactly six things on
      its first run and all six were these — `epa.gov/uic` in a provenance note
      and `ccus-sweep` in a deploy instruction. Both are correct as written, so
      a check that reports them has found nothing and cost the reader six
      lines. Asserted here rather than only in the .mjs so both halves of this
      check agree about it.
    */
    expect(mangledTokens('Verify against epa.gov/uic before citing')).toEqual([]);
    expect(mangledTokens('Deploy the ccus-sweep edge function')).toEqual([]);
    expect(mangledTokens('see ercot-north pricing')).toEqual([]);
    // But a unit keeps its hyphen and is still a unit.
    expect(mangledTokens('capex $/kw-yr')).toContain('$/kw-yr');
    // And a bare lower-case abbreviation with no identifier around it is real.
    expect(mangledTokens('the ccus tracker')).toContain('ccus');
  });

  it('words that are legitimately lowercase are excluded', () => {
    // "rec" is an English fragment; flagging it would fire on ordinary prose.
    expect(MANGLED_FORMS).not.toContain('rec');
    expect(MANGLED_FORMS).not.toContain('iso');
    // And the ones that are not English stay in.
    expect(MANGLED_FORMS).toContain('meddpicc');
    expect(MANGLED_FORMS).toContain('lcoe');
  });
});

describe('no case transform is applied to a rendered string', () => {
  it('the scan reads the app, and knows how many files that is', async () => {
    const files = (await Promise.all(ROOTS.map(walk))).flat();
    expect(files.length).toBeGreaterThan(80);
  });

  it('no .toLowerCase() lands inside user-facing copy', async () => {
    /*
      ⚠️ SCOPED TO COPY, NOT TO EVERY CALL. `.toLowerCase()` is correct and
      common for comparison — search needles, `.eq()` filters, slug building,
      the entity matcher. Flagging those would produce thirty findings that are
      all fine, and the check would be off within a day.

      The signal is a transform inside a template literal THAT CONTAINS PROSE.
      That is where the Economics defect lived: `Needs ${…toLowerCase()}.`

      ⚠️ "INSIDE A TEMPLATE LITERAL" ALONE WAS NOT ENOUGH, and the first run
      proved it: three of four hits were id and slug construction —
      `custom-${name.toLowerCase()…}`, `tariff-${label.toLowerCase()…}` — where
      lowercasing is the entire point.

      ⚠️ AND COUNTING WORDS WAS NOT ENOUGH EITHER. The second version required
      three or more words outside the interpolation, which let through
      `key.eq.${q},name.ilike.${q}` — a PostgREST filter with four "words" and
      no prose in it — and would have EXCLUDED the actual defect, whose literal
      is `Needs ${…}.` and has exactly one.

      The discriminator that separates all five: prose has letters AND a space
      outside the interpolations. A filter string has letters and no space. A
      slug has neither. A padded comparison needle (` ${x} `) has a space and no
      letters. Simpler than counting, and it is the property that actually
      distinguishes a sentence from an identifier.
    */
    const files = (await Promise.all(ROOTS.map(walk))).flat();
    const hits: string[] = [];

    for (const file of files) {
      const src = code(await readFile(file, 'utf8'));
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!/toLowerCase\(\)/.test(line)) continue;
        if (!/\$\{[^}]*toLowerCase\(\)/.test(line)) continue;
        const literal = /`([^`]*)`/.exec(line)?.[1] ?? '';
        // Slots removed entirely, not replaced by a space — replacing them
        // MANUFACTURES the whitespace this test looks for.
        const outside = literal.replace(/\$\{[^}]*\}/g, '');
        const isProse = /[A-Za-z]/.test(outside) && /\s/.test(outside);
        if (isProse) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    }

    expect(hits, `case transform in rendered copy:\n  ${hits.join('\n  ')}`).toHaveLength(0);
  });

  it('the scan can still fail', () => {
    // Rule 4: an expected count of zero is nothing but the passing case, so the
    // matcher is exercised against the line that actually shipped.
    const shipped = "          ? `Needs ${missing.map((m) => m.label).join(', ').toLowerCase()}.`";
    expect(/\$\{[^}]*toLowerCase\(\)/.test(shipped)).toBe(true);
    // And against a comparison, which must NOT fire.
    const comparison = "    const q = query.trim().toLowerCase();";
    expect(/\$\{[^}]*toLowerCase\(\)/.test(comparison)).toBe(false);

    // The prose discriminator, against all five shapes it has to separate.
    const isProse = (tpl: string) => {
      const lit = /`([^`]*)`/.exec(tpl)?.[1] ?? '';
      const outside = lit.replace(/\$\{[^}]*\}/g, '');
      return /[A-Za-z]/.test(outside) && /\s/.test(outside);
    };
    expect(isProse('`Needs ${x}.`'), 'the defect that shipped').toBe(true);
    expect(isProse('`Hit Generate to build the ${x} for ${y}.`')).toBe(true);
    expect(isProse('`custom-${name.toLowerCase()}`'), 'a slug').toBe(false);
    expect(isProse('`key.eq.${q},name.ilike.${q}`'), 'a PostgREST filter').toBe(false);
    expect(isProse('` ${input.toLowerCase().trim()} `'), 'a padded needle').toBe(false);
  });
});
