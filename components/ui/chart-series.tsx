import { cn } from '@/lib/utils';
import {
  CHART_SERIES_TOKENS,
  HATCHES,
  MAX_ENCODABLE_SERIES,
  encodeSeries,
  hatchPatternId,
  unencodableMessage,
  type Hatch,
  type ChartSeriesToken,
} from '@/lib/design/chart-palette';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE SHARED CHART PRIMITIVE.
 * ═══════════════════════════════════════════════════════════════
 *
 * There was no chart library to reuse. Economics had two bespoke components —
 * a three-div stacked bar and a tornado — each choosing its own colours at the
 * point of use. `bg-accent` meant "capex" in one and "the biggest lever" in the
 * other, and green meant VERIFIED in the provenance chips beside them. One
 * colour, three meanings, on one screen.
 *
 * So this is the thing everything draws through. Series `n` is the same colour
 * in every chart on every surface, because the index decides the colour and
 * nothing else does.
 *
 * ══ WHY CAPEX-AS-SERIES-ONE DOES NOT RESOLVE THE TORNADO ══
 *
 * Making capex series one fixes the stacked bar: green means series one there,
 * consistently, and the collision with "capex" disappears because they become
 * the same statement.
 *
 * It does NOT generalise to the tornado, and it took looking at the chart to
 * see why. The tornado has no series. Every bar measures the SAME quantity —
 * how far LCOE moves when one lever is swept — for a different lever, sorted
 * by magnitude. There is one series and eight rows of it.
 *
 * So `bg-accent` on the top bar never meant "series one". It meant "rank one",
 * and giving it `--chart-1` would have swapped one collision for another,
 * quieter one: a chart saying "series" in a place where it means "rank".
 *
 * The tornado therefore draws every bar in series one — which is what it is —
 * and moves the emphasis off hue entirely. Rank is already encoded by length
 * and by sort order; the leader is marked by the weight of its LABEL. Colour
 * means series. Weight means emphasis. Neither borrows the other's job.
 */

/**
 * The hatch patterns, as SVG defs.
 *
 * ⚠️ RENDER THIS ONCE PER CHART THAT USES FIVE OR MORE SERIES. Patterns are
 * referenced by id, so a chart drawing a hatched series without these defs
 * present renders that series with NO FILL — invisible rather than wrong,
 * which is the worse of the two.
 */
export function HatchDefs() {
  return (
    <defs>
      {CHART_SERIES_TOKENS.flatMap((token) =>
        HATCHES.filter((h) => h !== 'none').map((hatch) => (
          <pattern
            key={hatchPatternId(token, hatch)}
            id={hatchPatternId(token, hatch)}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
          >
            <rect width={6} height={6} fill={`var(${token})`} opacity={0.35} />
            {hatch === 'diagonal' ? (
              <path d="M0,6 L6,0" stroke={`var(${token})`} strokeWidth={2} />
            ) : null}
            {hatch === 'grid' ? (
              <path d="M0,3 H6 M3,0 V6" stroke={`var(${token})`} strokeWidth={1.5} />
            ) : null}
            {hatch === 'dots' ? <circle cx={3} cy={3} r={1.6} fill={`var(${token})`} /> : null}
          </pattern>
        )),
      )}
    </defs>
  );
}

/**
 * A legend swatch for series `index`.
 *
 * Renders the hatch as a tiny inline SVG rather than a CSS background, so the
 * swatch and the mark it stands for are drawn by the same code — a legend that
 * approximates its chart is a legend that can disagree with it.
 */
export function SeriesSwatch({ index, className }: { index: number; className?: string }) {
  const enc = encodeSeries(index);
  if (!enc) return null;

  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {enc.hatch === 'none' ? null : <HatchDefs />}
      <rect
        x={0.5}
        y={0.5}
        width={9}
        height={9}
        rx={2}
        fill={enc.fill}
        stroke={enc.stroke}
        strokeWidth={1}
      />
    </svg>
  );
}

/** The fill and stroke for series `index`, as inline style properties. */
export function seriesStyle(index: number): { background: string; borderColor: string } | null {
  const enc = encodeSeries(index);
  if (!enc) return null;
  // CSS `background` takes the token directly; a hatched series needs SVG, so
  // callers past index 3 must draw marks as SVG rather than divs.
  return { background: enc.fill, borderColor: enc.stroke };
}

/**
 * What a surface renders instead of a chart it cannot draw honestly.
 *
 * ⚠️ THIS IS A COMPONENT, NOT A CONSOLE WARNING, because the reader is the one
 * who needs to know. A chart quietly showing sixteen of twenty-three series
 * looks exactly like a chart showing twenty-three.
 */
export function TooManySeries({ count }: { count: number }) {
  return (
    <p className="rounded-card border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-text-dim">
      {unencodableMessage(count)}
    </p>
  );
}

export { MAX_ENCODABLE_SERIES, encodeSeries };
export type { Hatch, ChartSeriesToken };
