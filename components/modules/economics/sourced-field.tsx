'use client';

import { useId } from 'react';
import TierChip from './tier-chip';
import { hasRange } from '@/lib/economics/types';
import type { Sourced } from '@/lib/economics/types';

/**
 * One input: slider, number box, provenance chip, and an optional derived
 * read-out beneath.
 *
 * The slider and the number box are both present on purpose. A slider is for
 * exploring the shape of the answer; a number box is for entering the figure
 * off a spec sheet. Slider-only would make this a toy, and a plant engineer
 * with a real capex number would have nowhere to put it.
 *
 * The `derived` slot carries the chain that makes the model legible — heat rate
 * under efficiency, effective $/kW under redundancy. Those are the lines that
 * turn a calculator into something a plant engineer will argue with, which is
 * the point.
 */
export default function SourcedField({
  label,
  sourced,
  min,
  max,
  step,
  onChange,
  derived,
  hint,
  warning,
  disabled,
}: {
  label: string;
  sourced: Sourced;
  min: number;
  max: number;
  step: number;
  onChange: (value: number | null) => void;
  derived?: React.ReactNode;
  hint?: string;
  /** Rendered with a rule bar — for conditions the reader must not skim past. */
  warning?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const empty = sourced.value === null;
  // An empty field still needs a slider position. Parking it at min and showing
  // the track dimmed reads as "unset" rather than "set to the lowest value".
  const sliderValue = empty ? min : sourced.value!;

  return (
    <div className="border-b border-rule-faint py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <TierChip sourced={sourced} />
          <div className="flex items-baseline gap-1">
            <input
              id={`${id}-num`}
              type="number"
              inputMode="decimal"
              aria-label={`${label} value`}
              value={empty ? '' : sourced.value!}
              placeholder="—"
              disabled={disabled}
              min={min}
              max={max}
              step={step}
              onChange={(e) =>
                onChange(e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-20 rounded-sm border border-rule bg-bg px-1.5 py-1 text-right font-mono text-sm text-text tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <span className="font-mono text-2xs text-text-faint">{sourced.unit}</span>
          </div>
        </div>
      </div>

      <input
        id={id}
        type="range"
        aria-label={`${label} slider`}
        value={sliderValue}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-tap-sm w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40 xl:h-6"
        style={empty ? { opacity: 0.4 } : undefined}
      />

      {/* The published band, when the source gives one. Shown because the value
          above is its MIDPOINT — presenting 1,300 without saying it came from
          1,150–1,450 makes a derived figure look like a measured one. */}
      {hasRange(sourced) && sourced.tier ? (
        <p className="mt-1 font-mono text-2xs text-text-faint tabular-nums">
          Published range {fmt(sourced.low!)}–{fmt(sourced.high!)} {sourced.unit} · showing
          midpoint
        </p>
      ) : null}

      {derived ? (
        <p className="mt-1 font-mono text-2xs text-text-dim tabular-nums">{derived}</p>
      ) : null}
      {hint ? <p className="mt-1 text-2xs text-text-faint">{hint}</p> : null}
      {warning ? (
        <p className="mt-1.5 border-l-2 border-warning pl-2 text-2xs text-text-dim">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 10) return n.toFixed(n % 1 === 0 ? 0 : 2);
  return n.toFixed(2);
}
