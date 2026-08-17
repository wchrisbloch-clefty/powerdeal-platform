import type { SourceTier } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Graded provenance chip — The Hub's trust spine, rendered.
 *
 * The grade is the most important thing on a feed card. A reader must be able
 * to tell at a glance whether a claim came from a regulator, a trade
 * publication, or a model's inference, because the three warrant completely
 * different actions.
 */

const TIER_STYLES: Record<SourceTier, { label: string; className: string }> = {
  verified: {
    label: 'Verified',
    className:
      'text-[color:var(--prov-verified)] bg-[color:var(--prov-verified-bg)] border-accent-border',
  },
  reported: {
    label: 'Reported',
    className:
      'text-[color:var(--prov-reported)] bg-[color:var(--prov-reported-bg)] border-transparent',
  },
  inferred: {
    label: 'Inferred',
    className:
      'text-[color:var(--prov-inferred)] bg-[color:var(--prov-inferred-bg)] border-transparent',
  },
};

const TIER_HINTS: Record<SourceTier, string> = {
  verified: 'Primary source — government, regulator, filing, or transcript.',
  reported: 'Credible trade press reporting on a primary source.',
  inferred: 'Discovery net, social, or model inference. Corroborate before acting.',
};

export default function ProvenanceChip({
  tier,
  className,
}: {
  tier: SourceTier;
  className?: string;
}) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.inferred;
  return (
    <span
      title={TIER_HINTS[tier]}
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5',
        'font-mono text-2xs uppercase tracking-label',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

/**
 * Confidence rule — a hairline whose fill length encodes the 0..1 score.
 * Deliberately quiet: it should register peripherally while scanning, not
 * compete with the headline.
 */
export function ConfidenceRule({
  confidence,
  className,
}: {
  confidence: number;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div
      className={cn('confidence-track w-full', className)}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Confidence ${pct}%`}
      title={`Confidence ${pct}%`}
    >
      <div className="confidence-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
