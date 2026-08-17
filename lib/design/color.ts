/**
 * ═══════════════════════════════════════════════════════════════
 * COLOUR MATH. So a palette is MEASURED rather than asserted.
 * ═══════════════════════════════════════════════════════════════
 *
 * Every colour claim in this build has been wrong at least once, and each time
 * it was wrong in the same way: someone looked at it and it seemed fine.
 *
 *   · white on Bloom green — 2.5:1, on every primary button in the product
 *   · the nav active marker in brand green — 2.90:1, under the 3:1 a non-text
 *     indicator needs
 *   · #9A9DAA carrying timestamps and counts — 2.7:1
 *   · a provenance grade unreadable against its own tinted chip
 *
 * ⚠️ AND, WHILE BUILDING THE CHART PALETTE, TWICE MORE — both times by eye:
 *
 *   · the obvious six-hue set scored deutan ΔE 5.4 between green and clay.
 *     Green next to red, the exact failure that was named in the brief and
 *     then proposed in the brief's own first answer.
 *   · FIVE hand-tuned dark palettes were each measurably worse than the
 *     search: 3.4, 4.1, 5.5, 5.7 and 9.2 grayscale ΔL* against the search's
 *     14.0. Taste lost every round, by a factor of two to four.
 *
 * So the palette is not chosen and then justified. It is searched, scored, and
 * held by tests/design-tokens.test.ts at the numbers below. Nothing here is a
 * matter of preference, which is the point.
 *
 * PURE. No DOM, no fetch. Runs in a test, in the Edge runtime and in Node.
 */

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

export function toHex(rgb: Rgb): string {
  const part = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** sRGB transfer function, both directions. */
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. Takes hex, because that is what tokens hold. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ── CIELAB ─────────────────────────────────────────────────────
// D65. L* is the perceptual lightness axis, and it is what survives a
// photocopier: a black-and-white reproduction of a chart IS its L* channel.

const WHITE_POINT = [0.95047, 1.0, 1.08883] as const;

export function rgbToLab(rgb: Rgb): Lab {
  const [r, g, b] = rgb.map(toLinear);
  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x / WHITE_POINT[0]), f(y / WHITE_POINT[1]), f(z / WHITE_POINT[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual lightness, 0 (black) to 100 (white). The grayscale channel. */
export function lightness(hex: string): number {
  return rgbToLab(parseHex(hex))[0];
}

/** CIE76 ΔE. Coarse next to CIEDE2000, and it does not need to be finer — the
 *  question here is "can these two be told apart at all", not "do they match". */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ── Colour-vision deficiency ───────────────────────────────────
/**
 * Viénot, Brettel & Mollon (1999) dichromat simulation.
 *
 * Linear RGB → LMS, collapse the missing cone's response onto the plane the
 * remaining two span, back to sRGB. Not a perceptual model of what a dichromat
 * experiences — nobody has one — but the standard tool for the only question
 * being asked: do two colours converge when a cone class is missing.
 *
 * All three are checked, not just deuteranopia. Deutan is the common one and
 * tritan is rare, but a palette that fails tritan fails it for someone.
 */
export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';
export const DEFICIENCIES: Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];

type Matrix = readonly (readonly [number, number, number])[];

const RGB_TO_LMS: Matrix = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];
const LMS_TO_RGB: Matrix = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];
const COLLAPSE: Record<Deficiency, Matrix> = {
  protanopia: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deuteranopia: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritanopia: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
};

function apply(m: Matrix, v: Rgb): Rgb {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function simulate(hex: string, kind: Deficiency): string {
  const linear = parseHex(hex).map(toLinear) as unknown as Rgb;
  const out = apply(LMS_TO_RGB, apply(COLLAPSE[kind], apply(RGB_TO_LMS, linear)));
  return toHex(out.map(toGamma) as unknown as Rgb);
}

// ── The two questions a categorical palette has to answer ──────

/**
 * Smallest lightness gap between any two series.
 *
 * ⚠️ THIS IS THE PHOTOCOPY TEST, and it is the one that decided the palette
 * size. These charts print and get photocopied inside customer organisations,
 * where hue is gone entirely and L* is all that is left. A pair at ΔL* 9 is two
 * identical greys on paper no matter how different they look on a monitor.
 */
export function worstGrayscaleSeparation(palette: readonly string[]): {
  delta: number;
  pair: [string, string];
} {
  let worst = { delta: Infinity, pair: [palette[0], palette[1]] as [string, string] };
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const delta = Math.abs(lightness(palette[i]) - lightness(palette[j]));
      if (delta < worst.delta) worst = { delta, pair: [palette[i], palette[j]] };
    }
  }
  return worst;
}

/** Smallest ΔE between any two series under any of the three deficiencies. */
export function worstCvdSeparation(palette: readonly string[]): {
  delta: number;
  pair: [string, string];
  deficiency: Deficiency;
} {
  let worst = {
    delta: Infinity,
    pair: [palette[0], palette[1]] as [string, string],
    deficiency: 'deuteranopia' as Deficiency,
  };
  for (const deficiency of DEFICIENCIES) {
    const seen = palette.map((c) => rgbToLab(parseHex(simulate(c, deficiency))));
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const delta = deltaE(seen[i], seen[j]);
        if (delta < worst.delta) {
          worst = { delta, pair: [palette[i], palette[j]], deficiency };
        }
      }
    }
  }
  return worst;
}
