'use client';

import { cn } from '@/lib/utils';
import type { LcoeBreakdown } from '@/lib/economics/types';

/**
 * The three-segment stacked bar: capex · O&M · fuel.
 *
 * Colours are fixed to the components rather than to a palette rotation,
 * because the same three colours have to mean the same three things across the
 * bar, the delta view and any export. A legend that changes meaning between
 * surfaces is worse than no legend.
 */
export const SEGMENTS = [
  { key: 'capex' as const, label: 'Capex', className: 'bg-accent' },
  { key: 'om' as const, label: 'O&M', className: 'bg-text-dim' },
  { key: 'fuel' as const, label: 'Fuel', className: 'bg-warning' },
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
            className={cn(seg.className, 'transition-[width] duration-base')}
            style={{ width: `${pct(breakdown[seg.key])}%` }}
          />
        ))}
      </div>

      {!compact ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {SEGMENTS.map((seg) => (
            <li key={seg.key} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', seg.className)} aria-hidden />
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
