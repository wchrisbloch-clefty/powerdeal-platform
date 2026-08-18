import { describe, expect, it, beforeAll } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  contrastRatio,
  lightness,
  simulate,
  worstCvdSeparation,
  worstGrayscaleSeparation,
  DEFICIENCIES,
} from '@/lib/design/color';
import {
  CHART_SERIES_TOKENS,
  HATCHES,
  MAX_ENCODABLE_SERIES,
  MIN_CVD_DELTA_E,
  MIN_GRAYSCALE_DELTA_L,
  MIN_STROKE_CONTRAST,
  encodeSeries,
  hatchPatternId,
  unencodableMessage,
  PRINT_GREY_LEVELS,
} from '@/lib/design/chart-palette';
import { leadMetric, LEAD_HINTS } from '@/lib/deals';
import type { PortfolioSnapshot } from '@/lib/deals';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE DESIGN SYSTEM, MEASURED FROM WHAT SHIPS.
 * ═══════════════════════════════════════════════════════════════
 *
 * Every colour and type defect this build has found was invisible in review
 * because the source looked correct. So none of these read a constant and
 * compare it to itself:
 *
 *   · the palette is parsed OUT OF styles/tokens.css and scored, so a hex
 *     edited there is measured rather than trusted
 *   · the font weights are parsed out of app/layout.tsx and checked against
 *     the weights components actually ask for
 *   · the type steps are read out of tailwind.config.ts
 *   · the cn() declaration is checked against the config it has to cover
 *
 * Same discipline as brand.test.ts, which parses the generated OOXML rather
 * than the theme constants it was built from.
 */

const ROOT = process.cwd();
const read = (p: string) => readFile(join(ROOT, p), 'utf8');

let tokens = '';
let config = '';
let utils = '';
let layout = '';

beforeAll(async () => {
  [tokens, config, utils, layout] = await Promise.all([
    read('styles/tokens.css'),
    read('tailwind.config.ts'),
    read('lib/utils.ts'),
    read('app/layout.tsx'),
  ]);
});

/** The `:root` block (light) and the first `[data-theme='dark']` block. */
function themeBlock(theme: 'light' | 'dark'): string {
  if (theme === 'light') return /:root \{([\s\S]*?)\n\}/.exec(tokens)![1];
  return /\[data-theme='dark'\] \{([\s\S]*?)\n\}/.exec(tokens)![1];
}

function tokenValue(theme: 'light' | 'dark', name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(themeBlock(theme));
  if (!m) throw new Error(`${name} is not declared in the ${theme} theme`);
  return m[1].trim();
}

const GROUND = { light: '#ffffff', dark: '#0f1117' } as const;

function palette(theme: 'light' | 'dark'): string[] {
  return CHART_SERIES_TOKENS.map((t) => tokenValue(theme, t));
}

// ═══════════════════════════════════════════════════════════════
describe('the chart palette is measured, in both themes', () => {
  it.each(['light', 'dark'] as const)('declares all four series in %s', (theme) => {
    const p = palette(theme);
    expect(p).toHaveLength(4);
    for (const c of p) expect(c, `${c} is not a hex colour`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(['light', 'dark'] as const)(
    'survives a photocopier in %s — worst grayscale ΔL* clears the floor',
    (theme) => {
      /**
       * ⚠️ THIS IS THE ASSERTION THAT SIZED THE PALETTE. These charts print and
       * get photocopied inside customer organisations, and a photocopy is the
       * L* channel with hue discarded. Five hues scored 9.1 here, which is two
       * identical greys on paper.
       */
      const { delta, pair } = worstGrayscaleSeparation(palette(theme));
      expect(delta, `${pair[0]} and ${pair[1]} are the same grey on paper`).toBeGreaterThanOrEqual(
        MIN_GRAYSCALE_DELTA_L,
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'separates under all three colour-vision deficiencies in %s',
    (theme) => {
      const { delta, pair, deficiency } = worstCvdSeparation(palette(theme));
      expect(
        delta,
        `${pair[0]} and ${pair[1]} converge under ${deficiency}`,
      ).toBeGreaterThanOrEqual(MIN_CVD_DELTA_E);
    },
  );

  it('the floors sit ABOVE their perceptual limits, not merely below current', () => {
    /**
     * The user's question, asserted rather than answered in prose: a floor set
     * below the perceptual limit lets the palette degrade to unusable while
     * the build stays green.
     *
     * CVD: the CIE76 JND is ≈2.3 for adjacent patches. Chart reading is
     * identification from memory across a page, which needs roughly an order
     * of magnitude more — so the floor must be well clear of the JND, not
     * near it.
     *
     * Grayscale: one reproducible print step is ≈100/PRINT_GREY_LEVELS.
     *
     * ⚠️ A quantization model was written to check this against the failure
     * rather than the line, and DELETED — bucket boundaries have arbitrary
     * phase, so it passed the five-hue palette that ΔL* correctly rejects.
     * Made phase-independent it becomes "a gap of at least one bucket", which
     * is this floor. See the note in chart-palette.ts.
     */
    const CIE76_JND = 2.3;
    expect(MIN_CVD_DELTA_E).toBeGreaterThan(CIE76_JND * 5);
    expect(MIN_GRAYSCALE_DELTA_L).toBeGreaterThan(100 / PRINT_GREY_LEVELS);
  });

  it('specifically: no two series collapse under deuteranopia', () => {
    // Named on its own because this is the failure that was DESCRIBED in the
    // brief and then walked into by the brief's own first answer — green
    // beside clay, ΔE 5.4. The general assertion above would catch it; this
    // one says why it is there.
    for (const theme of ['light', 'dark'] as const) {
      const seen = palette(theme).map((c) => simulate(c, 'deuteranopia'));
      expect(new Set(seen).size, `${theme}: two series simulate to the same colour`).toBe(4);
    }
  });

  it('leads with Bloom green in both themes', () => {
    // Light is the brand value exactly; dark is the lifted form already used
    // for --color-accent, so the chart and the accent never disagree.
    expect(tokenValue('light', '--chart-1')).toBe('#3cad3a');
    expect(tokenValue('dark', '--chart-1')).toBe(tokenValue('dark', '--color-accent'));
  });

  it('is a DIFFERENT ladder per theme, not the same hexes reused', () => {
    // The light palette's deep petrol is 1.64:1 on ink — invisible, not dim.
    // A single fixed list is broken in whichever theme the author did not
    // have open.
    expect(palette('light')).not.toEqual(palette('dark'));
    for (const c of palette('dark')) {
      expect(
        contrastRatio(c, GROUND.dark),
        `${c} is ${contrastRatio(c, GROUND.dark).toFixed(2)}:1 on the dark ground`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every mark a hairline, because one fill is too pale to have an edge', () => {
    // --chart-4 light is 1.69:1 against paper. As a bare fill it has no
    // boundary — the same 3:1 non-text threshold the nav marker failed. The
    // stroke is what makes that fill legal, so the stroke has to clear it.
    for (const theme of ['light', 'dark'] as const) {
      const stroke = tokenValue(theme, '--chart-stroke');
      expect(
        contrastRatio(stroke, GROUND[theme]),
        `${theme} chart stroke is only ${contrastRatio(stroke, GROUND[theme]).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_STROKE_CONTRAST);
    }
  });

  it('has NO fifth hue — the encoding changes instead of the palette growing', () => {
    expect(tokens).not.toMatch(/--chart-5\s*:/);
    expect(CHART_SERIES_TOKENS).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('series encoding is deterministic and refuses rather than repeats', () => {
  it('assigns the same colour to the same index every time', () => {
    expect(encodeSeries(2)!.token).toBe('--chart-3');
    expect(encodeSeries(2)!.token).toBe(encodeSeries(2)!.token);
  });

  it('spends colour before texture — a four-series chart has no hatching', () => {
    for (let i = 0; i < 4; i++) {
      expect(encodeSeries(i)!.hatch).toBe('none');
      expect(encodeSeries(i)!.fill).toBe(`var(${CHART_SERIES_TOKENS[i]})`);
    }
  });

  it('the fifth series is a hatch over the first hue, not a fifth hue', () => {
    const fifth = encodeSeries(4)!;
    expect(fifth.token).toBe('--chart-1');
    expect(fifth.hatch).toBe('diagonal');
    expect(fifth.fill).toBe(`url(#${hatchPatternId('--chart-1', 'diagonal')})`);
  });

  it('never repeats a colour+hatch pair inside the cap', () => {
    const seen = new Set<string>();
    for (let i = 0; i < MAX_ENCODABLE_SERIES; i++) {
      const e = encodeSeries(i)!;
      const key = `${e.token}/${e.hatch}`;
      expect(seen.has(key), `series ${i} repeats ${key}`).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(CHART_SERIES_TOKENS.length * HATCHES.length);
  });

  it('REFUSES past the cap rather than wrapping around', () => {
    // A silently reused encoding draws two different things identically, and
    // the reader has no way to know. Null forces the surface to say so.
    expect(encodeSeries(MAX_ENCODABLE_SERIES)).toBeNull();
    expect(encodeSeries(-1)).toBeNull();
    expect(encodeSeries(1.5)).toBeNull();
  });

  it('and the refusal says what to do about it', () => {
    const msg = unencodableMessage(23);
    expect(msg).toContain('23');
    expect(msg).toContain(String(MAX_ENCODABLE_SERIES));
    expect(msg).toMatch(/not shown/i);
  });

  it('every mark carries the stroke token, never a literal', () => {
    for (let i = 0; i < MAX_ENCODABLE_SERIES; i++) {
      expect(encodeSeries(i)!.stroke).toBe('var(--chart-stroke)');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('the colour maths can actually fail', () => {
  /**
   * ⚠️ RULE 10. A validator that has only ever seen a passing palette is not a
   * validator. These feed it the sets it is supposed to reject, including the
   * exact one this build proposed and had to throw away.
   */
  it('rejects the six-hue set that was proposed first', () => {
    const naive = ['#3CAD3A', '#1F3A5F', '#E0A020', '#7A5EA8', '#C0563C', '#6E8A96'];
    const cvd = worstCvdSeparation(naive);
    expect(cvd.delta).toBeLessThan(MIN_CVD_DELTA_E);
    expect(cvd.deficiency).toBe('deuteranopia');
    expect(worstGrayscaleSeparation(naive).delta).toBeLessThan(MIN_GRAYSCALE_DELTA_L);
  });

  it('rejects a five-hue palette at the cliff', () => {
    expect(
      worstGrayscaleSeparation(['#3CAD3A', '#610a5c', '#bf2168', '#604e07', '#bb635c']).delta,
    ).toBeLessThan(MIN_GRAYSCALE_DELTA_L);
  });

  it('rejects hand-tuning that looked right — all five attempts', () => {
    // Recorded because taste lost every round, by two to four times. The
    // numbers are the argument for searching rather than choosing.
    const handTuned = [
      ['#4CC249', '#4E8CA8', '#A981D6', '#E1D9EF'],
      ['#4CC249', '#5590C4', '#B08AD8', '#E6DCF2'],
      ['#4CC249', '#4F93B4', '#AE86CC', '#E4DCEF'],
      ['#4CC249', '#3F8FB8', '#A47FD2', '#DED4EE'],
      ['#4CC249', '#2E72AB', '#9A7AA6', '#DCC8E8'],
    ];
    for (const p of handTuned) {
      expect(
        worstGrayscaleSeparation(p).delta,
        `${p.join(' ')} would have passed`,
      ).toBeLessThan(MIN_GRAYSCALE_DELTA_L);
    }
  });

  it('measures the contrast failures this codebase has actually shipped', () => {
    // White on Bloom green — every primary button, both themes.
    expect(contrastRatio('#ffffff', '#3cad3a')).toBeLessThan(3);
    // The nav marker in brand green on paper.
    expect(contrastRatio('#3cad3a', '#ffffff')).toBeCloseTo(2.9, 1);
    // And the replacement that fixed it.
    expect(contrastRatio('#2a8028', '#ffffff')).toBeGreaterThan(4.5);
  });

  it('simulation actually changes a colour — an identity function would pass everything', () => {
    for (const d of DEFICIENCIES) {
      expect(simulate('#3cad3a', d), `${d} is a no-op`).not.toBe('#3cad3a');
    }
    // And a grey has (almost) nothing to lose, so it should barely move.
    expect(lightness(simulate('#808080', 'deuteranopia'))).toBeCloseTo(lightness('#808080'), 0);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('the type scale is a scale, not a list of sizes', () => {
  function steps(): Record<string, string> {
    const block = /fontSize: \{([\s\S]*?)\n      \},/.exec(config)![1];
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*(\[[\s\S]*?\]),$/gm)) {
      out[m[1]] = m[2];
    }
    return out;
  }

  it('every step binds a line-height AND a letter-spacing to its size', () => {
    // The difference between a type scale and a list of font sizes. Without
    // this, every author picks their own leading at the point of use, which is
    // how `leading-relaxed` ended up in fifteen files with no token behind it.
    const all = steps();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(11);
    for (const [name, value] of Object.entries(all)) {
      expect(value, `${name} has no lineHeight`).toContain('lineHeight');
      expect(value, `${name} has no letterSpacing`).toContain('letterSpacing');
      expect(value, `${name} hardcodes a value`).not.toMatch(/:\s*'[\d.]/);
    }
  });

  it('declares a separate reading scale — a dashboard and prose are different jobs', () => {
    const all = steps();
    expect(all).toHaveProperty('read');
    expect(all).toHaveProperty('read-lead');
    // And it is genuinely larger than UI body, or it is not a second scale.
    const px = (t: string) => parseFloat(/--text-[a-z-]+:\s*([\d.]+)rem/.exec(
      new RegExp(`--text-${t}:\\s*[\\d.]+rem`).exec(tokens)![0],
    )![1]);
    expect(px('read')).toBeGreaterThan(px('base'));
  });

  it('leading PEAKS at body and tightens in both directions', () => {
    /**
     * ⚠️ I GOT THIS SHAPE WRONG TWICE, and the tokens were right both times.
     *
     * First attempt asserted a monotonic descent from `2xs` — failed, because
     * 11px carries timestamps and chip labels, which are single lines where
     * leading is space BELOW the text rather than between lines. Second
     * attempt started at `xs` — failed on `sm` (1.5) against `base` (1.55).
     *
     * The real curve peaks at body, which is the only step where someone reads
     * continuously. Below it, type is dense or single-line and tightens. Above
     * it, the eye closes the gaps optically at 28px and 48px and the leading
     * has to come down to compensate.
     *
     * Written as the curve it actually is rather than loosened until it
     * passed. A comparison relaxed to match reality asserts nothing about the
     * next change.
     */
    const lead = (t: string) =>
      parseFloat(new RegExp(`--leading-${t}:\\s*([\\d.]+);`).exec(tokens)![1]);

    const upToBody = ['2xs', 'xs', 'sm', 'base'];
    for (let i = 1; i < upToBody.length; i++) {
      expect(
        lead(upToBody[i]),
        `${upToBody[i]} is tighter than ${upToBody[i - 1]}, below the peak`,
      ).toBeGreaterThanOrEqual(lead(upToBody[i - 1]));
    }

    const fromBody = ['base', 'lg', 'xl', '2xl', '3xl', 'display'];
    for (let i = 1; i < fromBody.length; i++) {
      expect(
        lead(fromBody[i]),
        `${fromBody[i]} is not tighter than ${fromBody[i - 1]}`,
      ).toBeLessThan(lead(fromBody[i - 1]));
    }

    // And prose, on the other scale, is looser than any of them.
    expect(lead('read')).toBeGreaterThan(lead('base'));
  });

  it('tracking tightens as size ascends, and opens below body', () => {
    const track = (t: string) =>
      parseFloat(new RegExp(`--tracking-${t}:\\s*(-?[\\d.]+)em;`).exec(tokens)?.[1] ?? '0');
    expect(track('2xs')).toBeGreaterThan(0);
    expect(track('display')).toBeLessThan(track('2xl'));
    expect(track('2xl')).toBeLessThan(track('lg'));
  });

  it('caps the reading measure between 65 and 75 characters', () => {
    const m = /--measure:\s*(\d+)ch;/.exec(tokens)!;
    const ch = Number(m[1]);
    expect(ch).toBeGreaterThanOrEqual(65);
    expect(ch).toBeLessThanOrEqual(75);
    // And `ch`, not px — the measure has to track the face, or it stops being
    // 68 characters the moment the size changes.
    expect(tokens).not.toMatch(/--measure:\s*\d+px/);
  });

  it('.prose applies the measure, the reading size AND the reading face', async () => {
    const css = await read('app/globals.css');
    const prose = /\.prose \{([\s\S]*?)\n  \}/.exec(css)![1];
    expect(prose).toContain('var(--measure)');
    expect(prose).toContain('var(--text-read)');
    expect(prose).toContain('var(--font-display)');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('exactly one metric leads, and it is the one worth acting on', () => {
  const snap = (over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot => ({
    activeCount: 21, totalCount: 21, totalMw: 116, totalUsdM: 0,
    atRisk: 0, stalled: 0, singleThreaded: 0, avgHealth: 6,
    byBand: { high: 0, mid: 21, low: 0 }, byStage: {}, byVertical: {},
    ...over,
  });

  it('ranks by what to do about it, not by magnitude', () => {
    // 116 MW is a bigger number than 21 at-risk and never leads. A total that
    // has not moved since Tuesday is not the thing to open the page with.
    expect(leadMetric(snap({ atRisk: 3, singleThreaded: 21 }))).toBe('atRisk');
    expect(leadMetric(snap({ stalled: 2, singleThreaded: 21 }))).toBe('stalled');
    expect(leadMetric(snap({ singleThreaded: 21 }))).toBe('singleThreaded');
  });

  it('still fills the lead slot on a clean book', () => {
    // The lead is a POSITION in a layout. Leaving it empty when the last risk
    // clears would reflow the grid the moment the pipeline got healthy.
    expect(leadMetric(snap())).toBe('activeCount');
  });

  it('every lead metric has a line explaining itself', () => {
    // The lead tile is wider than the others, and the hint is what pays for
    // the width — the first version spanned two columns behind a two-character
    // number and read as a layout bug while every assertion passed.
    for (const m of ['atRisk', 'stalled', 'singleThreaded', 'activeCount'] as const) {
      expect(LEAD_HINTS[m].length, `${m} has no hint`).toBeGreaterThan(30);
      expect(LEAD_HINTS[m]).toMatch(/\.$/);
    }
    expect(Object.keys(LEAD_HINTS).sort()).toEqual(
      ['activeCount', 'atRisk', 'singleThreaded', 'stalled'],
    );
  });

  it('promotes at most one tile on the page', async () => {
    // Six tiles each deciding their own prominence is six tiles at maximum
    // prominence. The page passes `lead={lead === '...'}` against one value,
    // so only one can be true — asserted here because a second `lead` added by
    // hand would compile fine.
    const page = await read('app/app/page.tsx');
    const leads = [...page.matchAll(/lead=\{([^}]+)\}/g)].map((m) => m[1].trim());
    expect(leads.length).toBeGreaterThan(1);
    for (const l of leads) expect(l).toMatch(/^lead === '/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('cn() covers every custom name, or a class vanishes silently', () => {
  /**
   * ⚠️ THE 1.98:1 DEFECT CLASS. tailwind-merge cannot tell a custom `text-read`
   * (a size) from a custom `text-chart-1` (a colour): both are `text-*` and
   * neither is in its default theme, so it treats them as one group and drops
   * whichever came first. No error, no warning.
   *
   * This derives what needs declaring from the CONFIG rather than listing it,
   * so adding a token to tailwind.config.ts without declaring it in cn() fails
   * here instead of shipping.
   */
  const TAILWIND_DEFAULT_SIZES = new Set([
    'xs', 'sm', 'base', 'lg', 'xl',
    '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  ]);

  function declaredIn(group: string): Set<string> {
    const block = new RegExp(`'${group}': \\[([\\s\\S]*?)\\],\\n`).exec(utils)![1];
    return new Set([...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
  }

  it('every NON-default font-size name is declared', () => {
    const names = [
      ...(/fontSize: \{([\s\S]*?)\n      \},/.exec(config)![1]).matchAll(
        /^\s*'?([a-z0-9-]+)'?:\s*\[/gm,
      ),
    ].map((m) => m[1]);
    const custom = names.filter((n) => !TAILWIND_DEFAULT_SIZES.has(n));
    expect(custom.length).toBeGreaterThan(0);

    const declared = declaredIn('font-size');
    for (const name of custom) {
      expect(declared, `text-${name} is not declared in cn()`).toContain(name);
    }
  });

  it('every chart colour is declared', () => {
    const declared = declaredIn('text-color');
    for (const t of CHART_SERIES_TOKENS) {
      expect(declared, `${t} is not declared in cn()`).toContain(t.replace('--', ''));
    }
    expect(declared).toContain('chart-stroke');
  });

  it('the declaration is not larger than the config — no dead entries', () => {
    // A group listing names that do not exist reads as protection and is not
    // any. The same reason the border-color group was written, probed and
    // deleted.
    const colours = new Set(
      [...(/colors: \{([\s\S]*?)\n      \},/.exec(config)![1]).matchAll(
        /^\s*'?([a-z0-9-]+)'?:\s*'var/gm,
      )].map((m) => m[1]),
    );
    for (const name of declaredIn('text-color')) {
      expect(colours, `cn() declares ${name}, which no longer exists`).toContain(name);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('no component asks for a font weight that was never loaded', () => {
  /**
   * ⚠️ THE FAUX-BOLD FIND. The Dashboard metric tiles asked for `font-bold` —
   * 700 — against a Newsreader loaded at 400/500/600. No 700 face existed, so
   * the browser matched 600 and synthesised the rest: smeared stems on the
   * largest type in the product. The comment above them claimed "36px/700" the
   * whole time.
   *
   * Nothing about that was visible in review. It is visible here.
   */
  const WEIGHT = {
    'font-thin': 100, 'font-extralight': 200, 'font-light': 300,
    'font-normal': 400, 'font-medium': 500, 'font-semibold': 600,
    'font-bold': 700, 'font-extrabold': 800, 'font-black': 900,
  } as const;

  function loadedWeights(fn: string): number[] {
    const block = new RegExp(`${fn}\\(\\{([\\s\\S]*?)\\}\\);`).exec(layout)![1];
    return [...block.matchAll(/'(\d{3})'/g)].map((m) => Number(m[1]));
  }

  async function everyComponent(): Promise<{ path: string; src: string }[]> {
    const out: { path: string; src: string }[] = [];
    async function walk(dir: string) {
      for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) await walk(p);
        else if (e.name.endsWith('.tsx')) out.push({ path: p, src: await read(p) });
      }
    }
    await walk('app');
    await walk('components');
    return out;
  }

  it('loads 700 for the display face, because a component asks for it', () => {
    expect(loadedWeights('Newsreader')).toContain(700);
  });

  it('every font-display + weight pairing resolves to a loaded face', async () => {
    const available = new Set(loadedWeights('Newsreader'));
    const offenders: string[] = [];

    for (const { path, src } of await everyComponent()) {
      // Class lists that name the display face and a weight together.
      for (const m of src.matchAll(/'[^']*font-display[^']*'|"[^"]*font-display[^"]*"/g)) {
        for (const [util, weight] of Object.entries(WEIGHT)) {
          if (m[0].includes(util) && !available.has(weight)) {
            offenders.push(`${path}: ${util} (${weight}) — loaded: ${[...available].join(', ')}`);
          }
        }
      }
    }
    expect(offenders, 'a weight would be synthesised by the browser').toEqual([]);
  });

  it('the base stylesheet does not set a display weight that is missing either', async () => {
    // globals.css sets h1–h4 in the display face at a fixed weight, which no
    // className scan would ever see.
    const css = await read('app/globals.css');
    const available = new Set(loadedWeights('Newsreader'));
    for (const m of css.matchAll(/font-family: var\(--font-display\);[\s\S]{0,200}?font-weight: (\d{3});/g)) {
      expect(available, `globals.css sets weight ${m[1]}, which is not loaded`).toContain(
        Number(m[1]),
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('nothing typographic or chromatic is hardcoded outside tokens.css', () => {
  async function sources(): Promise<{ path: string; src: string }[]> {
    const out: { path: string; src: string }[] = [];
    async function walk(dir: string) {
      for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) await walk(p);
        else if (/\.(tsx|css)$/.test(e.name)) out.push({ path: p, src: await read(p) });
      }
    }
    await walk('app');
    await walk('components');
    return out;
  }

  it('no raw hex or rgb() in any component or page', async () => {
    const offenders: string[] = [];
    for (const { path, src } of await sources()) {
      if (path.endsWith('tokens.css')) continue;
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '');
      for (const m of code.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\([\d\s.,%]+\)/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }
    // map-view.tsx carried the last one — the brand green as a link colour
    // inside a Leaflet popup string, at 2.90:1, invisible to Tailwind because
    // it never passed through a className.
    expect(offenders).toEqual([]);
  });

  it('no leading-* or tracking-* utility outside the token set', async () => {
    // The type steps carry leading and tracking now, so reaching for either at
    // the point of use means reaching past the scale — and Tailwind's own
    // defaults are not tokens. `tracking-label` is the one exception: uppercase
    // micro-labels are a real, separate case.
    const offenders: string[] = [];
    for (const { path, src } of await sources()) {
      // ⚠️ `(?<!-)` EXCLUDES THE TOKEN DECLARATIONS THEMSELVES. Without it this
      // matched `var(--leading-base)` inside globals.css and reported the
      // definition as a violation of itself — a scan that cannot tell the
      // vocabulary from a use of it flags the dictionary.
      for (const m of src.matchAll(/(?<![-\w])(leading|tracking)-([a-z0-9-]+)\b/g)) {
        if (m[0] === 'tracking-label') continue;
        offenders.push(`${path}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no NON-TEXT INDICATOR reaches for raw brand green', async () => {
    /**
     * ⚠️ THE SAME 2.90:1, FOUR TIMES, ON FOUR SURFACES.
     *
     * Brand green on paper is 2.90:1, under the 3:1 that any non-text
     * indicator needs. It was found and fixed on the nav underline; the audit
     * that followed found it again on:
     *
     *   · `:focus-visible` — the keyboard focus ring for EVERY focusable
     *     element in the product, which is the largest surface of the four
     *   · ten `focus:border-accent` / `focus:ring-accent` inputs
     *   · the confidence meter fill and the market-watch meter
     *
     * `--color-accent-mark` is the token that clears the threshold. This stops
     * the raw one coming back to a focus ring, an outline or a meter.
     *
     * ⚠️ SCOPED TO INDICATORS, NOT TO GREEN. `text-accent` on an aria-hidden
     * icon beside its own label is decoration and stays legal; `bg-accent` on
     * a chart mark is legal by the palette's own rule. A blanket ban would be
     * easier to write and would be a different, wrong rule.
     */
    const offenders: string[] = [];

    const css = await read('app/globals.css');
    for (const m of css.matchAll(/(outline|background)[^;]*var\(--color-accent\)/g)) {
      offenders.push(`app/globals.css: ${m[0]}`);
    }

    for (const { path, src } of await sources()) {
      // Focus indicators and meter fills, in class strings.
      for (const m of src.matchAll(
        /(?:focus|focus-visible|hover):(?:border|ring|outline)-accent(?![-\w])/g,
      )) {
        offenders.push(`${path}: ${m[0]}`);
      }
      /**
       * ⚠️ AND THE UNPREFIXED FORM, which is how the last one hid. The
       * Economics tab strip carried `border-b-2 border-accent` on the selected
       * tab — the nav-marker pattern exactly, at the nav marker's 2.90:1, and
       * a `focus:`-only scan walked straight past it because it is an ACTIVE
       * state rather than a focus state.
       */
      for (const m of src.matchAll(/(?<![-\w:])border-accent(?![-\w])/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }

    expect(offenders, 'raw --color-accent used as a non-text indicator').toEqual([]);
  });

  it('nothing puts white text on the brand green', async () => {
    /**
     * ⚠️ 2.5:1, AND IT WAS STILL LIVE.
     *
     * `--color-accent-fg` exists because white on Bloom green measures 2.5:1
     * light and 2.0:1 dark, and ink measures 6.5:1 and 8.2:1. That token was
     * introduced when the primary button was found rendering at 1.98:1 — and
     * the capture page's submit button was still `bg-accent … text-white`,
     * hand-rolled rather than using the shared Button, so no fix ever reached
     * it.
     *
     * The measurement, not the memory:
     */
    expect(contrastRatio('#ffffff', '#3cad3a')).toBeLessThan(3);
    expect(contrastRatio('#0f1117', '#3cad3a')).toBeGreaterThan(4.5);

    const offenders: string[] = [];
    for (const { path, src } of await sources()) {
      for (const m of src.matchAll(/class[Name]*="[^"]*"/g)) {
        if (/\bbg-accent(?![-\w])/.test(m[0]) && /\btext-white\b/.test(m[0])) {
          offenders.push(`${path}: ${m[0].slice(0, 90)}`);
        }
      }
    }
    expect(offenders, 'white text on Bloom green').toEqual([]);
  });

  it('and the mark token actually clears 3:1 in BOTH themes', () => {
    // The rename is only worth anything if the value behind it passes. Nav
    // asserts this too; repeated here because this is the file that now
    // forbids the raw token, and a ban pointing at a replacement that also
    // fails would be theatre.
    for (const theme of ['light', 'dark'] as const) {
      const mark = tokenValue(theme, '--color-accent-mark');
      const ratio = contrastRatio(mark, GROUND[theme]);
      expect(ratio, `${theme}: accent-mark is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
    // And it must NOT simply be the accent under a new name — that was the
    // whole defect.
    expect(tokenValue('light', '--color-accent-mark')).not.toBe(tokenValue('light', '--color-accent'));
  });

  it('the dead --sp-* aliases are gone, not merely unused', async () => {
    // Nine tokens naming Tailwind's own 4px grid under new names, read by
    // nothing. Same class as the border-color group that was probed, found to
    // change nothing, and removed.
    expect(tokens).not.toMatch(/--sp-\d+:/);
  });

  it('rhythm tokens exist and actually change with the viewport', () => {
    expect(tokens).toMatch(/--rhythm-page:/);
    // A responsive token that never changes is a constant with extra steps.
    const overrides = [...tokens.matchAll(/--rhythm-page:\s*([\d.]+)rem;/g)].map((m) =>
      Number(m[1]),
    );
    expect(overrides.length).toBeGreaterThanOrEqual(3);
    expect(new Set(overrides).size).toBe(overrides.length);
  });
});
