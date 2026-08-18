/**
 * ═══════════════════════════════════════════════════════════════
 * THE CHART PALETTE. Ordered, capped, and per-theme.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ NO HEX VALUES IN THIS FILE, DELIBERATELY. The colours live in
 * styles/tokens.css and nowhere else, and tests/design-tokens.test.ts PARSES
 * THAT FILE to measure them. A copy of the palette here would be a second
 * source of truth that drifts silently — the same reason brand.test.ts reads
 * the generated OOXML instead of the theme constants it was built from.
 *
 * ══ WHY IT STOPS AT FOUR ══
 *
 * These charts print, and they get photocopied inside customer organisations,
 * where hue is gone and perceptual lightness is the whole signal. Searching the
 * space with Bloom green pinned as series one:
 *
 *     series   worst grayscale ΔL*   worst CVD ΔE
 *       4            17.5                30.9
 *       5             9.1                16.3
 *       6             7.5                19.3
 *       7             5.9                11.0
 *
 * Four to five is not a gradient, it is a cliff. A fifth hue separates for a
 * reader with typical colour vision on a good monitor and merges into one grey
 * on paper — a chart that looks like it carries five categories and carries
 * four. That is the fabricated-number rule with a fill on it.
 *
 * ══ SO WHAT HAPPENS AT FIVE ══
 *
 * The ENCODING CHANGES rather than the palette growing. Series five onward
 * reuse the four hues with a hatch pattern over them, which is a channel that
 * survives both grayscale and every colour-vision deficiency because it is not
 * colour at all. Direct labelling carries the rest.
 *
 * And it still ends: past `MAX_ENCODABLE_SERIES` this module refuses instead of
 * wrapping around to a combination already in use. A repeated encoding is a
 * chart that says two different things are the same thing.
 */

/** Ordered. Series one is ALWAYS Bloom green — the brand leads every chart. */
export const CHART_SERIES_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
] as const;

export type ChartSeriesToken = (typeof CHART_SERIES_TOKENS)[number];

/**
 * The non-colour channel, in the order it is spent.
 *
 * `none` first, so a four-series chart carries no hatching at all — texture on
 * a chart that does not need it is decoration, and the brief rules it out.
 */
export const HATCHES = ['none', 'diagonal', 'grid', 'dots'] as const;
export type Hatch = (typeof HATCHES)[number];

export const MAX_ENCODABLE_SERIES = CHART_SERIES_TOKENS.length * HATCHES.length;

export interface SeriesEncoding {
  /** CSS custom property name. Consumers write `var(${token})`, never a hex. */
  token: ChartSeriesToken;
  hatch: Hatch;
  /** SVG `fill` value: the colour, or a `url(#…)` pattern reference. */
  fill: string;
  /** Every mark carries a hairline. See the note on the stroke token below. */
  stroke: string;
}

/** The id of the <pattern> a hatched series points at. Stable and derivable. */
export function hatchPatternId(token: ChartSeriesToken, hatch: Hatch): string {
  return `pd-hatch-${hatch}-${token.replace('--chart-', '')}`;
}

/**
 * What series `index` looks like. Deterministic — series three is the same
 * colour in every chart on every surface, which is the whole reason the order
 * is fixed rather than assigned per chart.
 *
 * ⚠️ RETURNS NULL PAST THE CAP rather than wrapping. The caller must say so on
 * the surface. A silently reused encoding is worse than a missing one: the
 * reader has no way to know two series are being drawn identically.
 */
export function encodeSeries(index: number): SeriesEncoding | null {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ENCODABLE_SERIES) return null;

  const token = CHART_SERIES_TOKENS[index % CHART_SERIES_TOKENS.length];
  const hatch = HATCHES[Math.floor(index / CHART_SERIES_TOKENS.length)];

  return {
    token,
    hatch,
    fill: hatch === 'none' ? `var(${token})` : `url(#${hatchPatternId(token, hatch)})`,
    /**
     * ⚠️ THE HAIRLINE IS NOT DECORATION, it is what makes a pale fill legal.
     * Series four in the light theme is 1.69:1 against paper — as a bare fill
     * it has no defined edge, which is the 3:1 non-text threshold the nav
     * marker already failed once. The stroke supplies the edge, so the fill is
     * free to be pale enough to hold its place on the lightness ladder.
     */
    stroke: 'var(--chart-stroke)',
  };
}

/** What the surface says when a chart asks for more series than can be drawn. */
export function unencodableMessage(count: number): string {
  return `${count} series requested; ${MAX_ENCODABLE_SERIES} can be drawn distinctly. The rest are not shown rather than drawn with a repeated encoding — split the chart or aggregate the tail.`;
}

// ── The thresholds the palette is held to ──────────────────────
/**
 * ⚠️ WHERE THESE TWO NUMBERS COME FROM, BECAUSE "BELOW CURRENT" IS NOT A
 * REASON.
 *
 * A floor set just under today's measurement tests compliance with an
 * arbitrary line. Worse, if that line sits BELOW the perceptual limit, the
 * palette can degrade all the way to unusable while the build stays green —
 * the check would be measuring nothing and reporting a pass.
 *
 * So each is anchored to a failure model, and the anchor is stated plainly
 * enough to be argued with. Neither is a citation; both are engineering
 * estimates, and saying so is the point.
 *
 * ── MIN_CVD_DELTA_E = 20 ──
 * The CIE76 just-noticeable difference is ≈2.3 for two large patches sitting
 * edge to edge under controlled light. That is the wrong task. Reading a chart
 * means holding a colour from a legend in memory and matching it to a mark
 * somewhere else on the page, across a gap, at small size — identification
 * from memory, not discrimination side by side, and it needs roughly an order
 * of magnitude more separation. 20 is ≈9x the JND and sits at the low end of
 * the range usually quoted for reliable categorical identification.
 *
 * ── MIN_GRAYSCALE_DELTA_L = 12 ──
 * Anchored to REPRODUCTION, not to the eye. L* is scaled so 100 spans black to
 * white; a photocopier or laser printer halftones to roughly ten reliably
 * distinguishable grey levels, so one reproducible step is ≈10 L*. 12 is one
 * step plus a margin for the tone compression a second-generation copy adds.
 *
 * Both floors are ABOVE their perceptual/reproduction limit rather than below
 * it, which is the property that matters: a palette that satisfies them is
 * usable, not merely compliant. And both sit under the current measurements
 * (light 17.5 / 30.9, dark 14.0 / 27.8) so a deliberate hue change has room to
 * move without a careless one passing.
 *
 * ⚠️ A QUANTIZATION MODEL WAS WRITTEN HERE AND DELETED. The idea was to bucket
 * each series into the grey levels a copier resolves and assert no collision —
 * testing the failure rather than the line. It does not work: bucket
 * boundaries have an arbitrary phase relative to the values, so two colours
 * 9.1 apart can straddle one and land in different buckets. It passed the
 * five-hue palette that ΔL* correctly rejects.
 *
 * Made phase-independent, the statement becomes "the gap must be at least one
 * bucket wide" — which is exactly the floor below. The model collapsed into
 * the thing it was meant to justify, so it was removed rather than kept as
 * reassurance, on the same grounds as the border-color class group.
 */
export const MIN_GRAYSCALE_DELTA_L = 12;
export const MIN_CVD_DELTA_E = 20;

/**
 * How many grey levels a photocopy can be relied on to hold apart.
 *
 * Deliberately pessimistic. A good laser printer does better; a second- or
 * third-generation copy passed around inside a customer's procurement team
 * does worse, and that is the artifact this palette has to survive.
 */
export const PRINT_GREY_LEVELS = 10;

/** Series marks must have a defined edge against the ground behind them. */
export const MIN_STROKE_CONTRAST = 3;
