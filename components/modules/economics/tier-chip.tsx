'use client';

import { cn } from '@/lib/utils';
import type { Sourced } from '@/lib/economics/types';

/**
 * Provenance chip for a single input.
 *
 * Three states, and the third is the one that matters:
 *
 *   verified / reported / inferred — we sourced it, and the chip says how well
 *   YOURS                         — the user typed it
 *   NEEDS INPUT                   — nothing there yet
 *
 * A user-entered value is deliberately NOT given a tier. Tagging it would be
 * claiming authority the number has not earned; "yours" is the honest label and
 * it costs nothing to say.
 */
export default function TierChip({ sourced }: { sourced: Sourced }) {
  if (sourced.value === null) {
    return (
      <span className="rounded-sm border border-dashed border-rule px-1.5 py-0.5 font-mono text-2xs uppercase tracking-label text-text-faint">
        needs input
      </span>
    );
  }

  if (!sourced.tier) {
    return (
      <span
        className="rounded-sm border border-rule px-1.5 py-0.5 font-mono text-2xs uppercase tracking-label text-text-faint"
        title="Your value — entered here, not sourced by PowerDeal."
      >
        yours
      </span>
    );
  }

  const detail = [sourced.source, sourced.retrievedAt?.slice(0, 10)]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      className={cn(
        'rounded-sm px-1.5 py-0.5 font-mono text-2xs uppercase tracking-label',
        sourced.tier === 'verified' && 'bg-accent-bg text-accent-dim',
        sourced.tier === 'reported' && 'bg-bg-overlay text-warning',
        sourced.tier === 'inferred' && 'bg-bg-overlay text-text-faint',
      )}
      title={detail || undefined}
    >
      {sourced.tier}
    </span>
  );
}
