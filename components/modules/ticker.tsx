'use client';

import { getActiveVertical } from '@/lib/active-vertical';
import { pct, cn } from '@/lib/utils';

/**
 * Context ticker.
 *
 * A value that isn't available shows "—" with a title explaining which key is
 * missing. Showing a plausible placeholder number here would be actively
 * dangerous — someone would quote it on a call.
 */

export interface TickerData {
  henryHub: number | null;
  usAvgRate: number | null;
  rateYoy: number | null;
  classViPermits: number | null;
  ercotRt: number | null;
  pjmRt: number | null;
  /** Why a value is null — shown on hover. */
  notes: Record<string, string>;
}

export default function Ticker({ data }: { data: TickerData }) {
  const vertical = getActiveVertical();
  if (!vertical.ticker.enabled) return null;

  const values: Record<string, { display: string; delta?: number | null }> = {
    'henry-hub': {
      display: data.henryHub !== null ? `$${data.henryHub.toFixed(2)}` : '—',
    },
    'ercot-spot': {
      display: data.ercotRt !== null ? `$${data.ercotRt.toFixed(0)}` : '—',
    },
    'pjm-spot': {
      display: data.pjmRt !== null ? `$${data.pjmRt.toFixed(0)}` : '—',
    },
    'nat-avg-rate': {
      display: data.usAvgRate !== null ? `$${data.usAvgRate.toFixed(3)}` : '—',
    },
    'rate-yoy': {
      display: data.rateYoy !== null ? pct(data.rateYoy) : '—',
      delta: data.rateYoy,
    },
    'class-vi': {
      display: data.classViPermits !== null ? String(data.classViPermits) : '—',
    },
  };

  return (
    <div className="scrollbar-thin flex gap-5 overflow-x-auto rounded-card border border-rule bg-bg-raised px-3.5 py-2.5">
      <span className="eyebrow shrink-0 self-center">{vertical.ticker.label}</span>

      {vertical.ticker.entries.map((entry) => {
        const v = values[entry.id];
        const missing = !v || v.display === '—';
        // A rate increase is an opportunity in this business, not a loss —
        // rising cost is what makes the grid-fighter case. No red/green.
        const deltaClass =
          entry.kind === 'delta' && v?.delta !== null && v?.delta !== undefined
            ? v.delta > 0
              ? 'text-accent-dim'
              : 'text-text-dim'
            : 'text-text';

        return (
          <div
            key={entry.id}
            className="shrink-0"
            title={missing ? data.notes[entry.id] ?? 'Data unavailable' : undefined}
          >
            <p className="eyebrow whitespace-nowrap">{entry.label}</p>
            <p
              className={cn(
                'font-mono text-sm tabular-nums',
                missing ? 'text-text-faint' : deltaClass,
              )}
            >
              {v?.display ?? '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
