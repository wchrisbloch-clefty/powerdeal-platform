'use client';

import { cn } from '@/lib/utils';
import { seriesStyle } from '@/components/ui/chart-series';
import type { SensitivityRow } from '@/lib/economics/sensitivity';

/**
 * Tornado view (spec 1.8).
 *
 * Ranked by absolute LCOE swing, largest first. The expected result is that
 * fuel price, capacity factor and cost of capital dominate and capex does not —
 * which is counterintuitive to most buyers and is the reason this view exists.
 * If capex ranks first here, that is a finding about this configuration, not a
 * bug.
 */
export default function SensitivityView({
  rows,
  baseline,
}: {
  rows: SensitivityRow[];
  baseline: number | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-dim">
        Sensitivity needs a complete configuration. Fill the inputs marked{' '}
        <span className="font-mono text-2xs uppercase tracking-label">needs input</span> and
        the ranking appears here.
      </p>
    );
  }

  const widest = rows[0].swing;

  return (
    <div>
      <p className="mb-4 text-sm text-text-dim">
        Each lever swept ±25% with everything else held constant, ranked by how far LCOE
        moves.
        {baseline !== null ? (
          <>
            {' '}
            Baseline{' '}
            <span className="font-mono text-text tabular-nums">{baseline.toFixed(2)}¢/kWh</span>.
          </>
        ) : null}
      </p>

      <ul className="space-y-3">
        {rows.map((row) => {
          const share = widest > 0 ? (row.swing / widest) * 100 : 0;
          const lo = Math.min(row.lcoeAtLow, row.lcoeAtHigh);
          const hi = Math.max(row.lcoeAtLow, row.lcoeAtHigh);

          return (
            <li key={row.field}>
              <div className="flex items-baseline justify-between gap-3">
                {/* ⚠️ RANK IS CARRIED BY WEIGHT, NOT BY HUE.
                    The top bar used to be `bg-accent` against `bg-text-dim`
                    for the rest, which read as "series one" in a chart that
                    has no series: every bar measures the SAME quantity, LCOE
                    swing, for a different lever. Colouring the leader
                    differently said "different series" and meant "rank one".
                    Length and sort order already encode rank; the label
                    carries the emphasis. */}
                <span
                  className={cn(
                    'text-sm',
                    row === rows[0] ? 'font-medium text-text' : 'text-text-dim',
                  )}
                >
                  {row.label}
                </span>
                <span className="font-mono text-xs text-text-dim tabular-nums">
                  {lo.toFixed(2)} – {hi.toFixed(2)}¢
                  <span className="ml-2 text-text">±{(row.swing / 2).toFixed(2)}</span>
                </span>
              </div>

              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-sm bg-bg-overlay">
                <div
                  className="h-full rounded-sm border transition-[width] duration-base"
                  // One measure, one series — so one colour, for every row.
                  style={{ width: `${share}%`, ...seriesStyle(0)! }}
                />
              </div>

              <p className="mt-0.5 font-mono text-2xs text-text-faint tabular-nums">
                {formatSweep(row.low)} → {formatSweep(row.high)} {row.unit}
                {row.inverse ? ' · higher is cheaper' : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatSweep(n: number): string {
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  return n.toFixed(3);
}
