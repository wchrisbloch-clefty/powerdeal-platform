'use client';

import { cn } from '@/lib/utils';
import { seriesStyle } from '@/components/ui/chart-series';
import { SeriesSwatch } from '@/components/ui/chart-series';
import type { LcoeBreakdown } from '@/lib/economics/types';

/**
 * The three-segment stacked bar: capex · O&M · fuel.
 *
 * ⚠️ MIGRATED ONTO THE SHARED PALETTE, WHICH RESOLVED A REAL COLLISION.
 *
 * These were `bg-accent`, `bg-text-dim` and `bg-warning` — chosen here, at the
 * point of use. So Bloom green meant "capex" in this chart, "the biggest
 * lever" in the tornado beside it, and VERIFIED in the provenance chips above
 * both. One colour, three meanings, on one screen. `bg-warning` was worse: an
 * amber that means "something needs attention" everywhere else in the product,
 * used here to mean "fuel".
 *
 * Now the INDEX decides. Capex is series one, so green means series one — the
 * same statement every chart makes, and the collision disappears because the
 * two claims become the same claim rather than two claims sharing a colour.
 *
 * Order is still fixed to the components, which was the right instinct: the
 * same three things must read the same across the bar, the delta view and any
 * export. What changed is where the colour comes from.
 */
export const SEGMENTS = [
  { key: 'capex' as const, label: 'Capex', index: 0 },
  { key: 'om' as const, label: 'O&M', index: 1 },
  { key: 'fuel' as const, label: 'Fuel', index: 2 },
];

export default function StackedBar({
  breakdown,
  /** When set, the bar is scaled against this instead of its own total, so two
   *  bars compared side by side are visually comparable. */
  scaleMax,
  compact,
}: {
  breakdown: LcoeBreakdown;
  scaleMax?: number;
  compact?: boolean;
}) {
  const max = scaleMax && scaleMax > 0 ? scaleMax : breakdown.total;
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);

  return (
    <div>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-sm bg-bg-overlay',
          compact ? 'h-2.5' : 'h-8',
        )}
        role="img"
        aria-label={`LCOE ${breakdown.total.toFixed(2)} cents per kilowatt hour: capex ${breakdown.capex.toFixed(2)}, O and M ${breakdown.om.toFixed(2)}, fuel ${breakdown.fuel.toFixed(2)}`}
      >
        {SEGMENTS.map((seg) => (
          <div
            key={seg.key}
            className="transition-[width] duration-base"
            style={{
              width: `${pct(breakdown[seg.key])}%`,
              ...seriesStyle(seg.index)!,
              // The hairline that gives a pale fill a defined edge. Inset so
              // adjacent segments show one rule between them, not two.
              boxShadow: 'inset -1px 0 0 var(--chart-stroke)',
            }}
          />
        ))}
      </div>

      {!compact ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {SEGMENTS.map((seg) => (
            <li key={seg.key} className="flex items-center gap-1.5">
              {/* Drawn by the same code that draws the mark, so the legend
                  cannot drift from the chart it labels. */}
              <SeriesSwatch index={seg.index} />
              <span className="text-xs text-text-dim">{seg.label}</span>
              <span className="font-mono text-xs text-text tabular-nums">
                {breakdown[seg.key].toFixed(2)}¢
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
