import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { riskFlags } from '@/lib/deals';
import { formatMw, formatUsd, cn } from '@/lib/utils';
import HealthRing from './health-ring';
import { StagePill } from './badge';

/**
 * Pipeline deal card — the mobile representation of a table row.
 * The table collapses to a stack of these below `md`.
 */
export default function DealCard({
  deal,
  className,
}: {
  deal: Deal;
  className?: string;
}) {
  const flags = riskFlags(deal);
  const topFlag = flags[0];

  return (
    <Link
      href={`/app/pipeline/${deal.id}`}
      className={cn(
        'block rounded-card border border-rule bg-bg-raised p-3.5',
        'transition-colors hover:border-accent-border hover:bg-bg-overlay',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <HealthRing score={deal.health_score} size={38} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xs uppercase tracking-label text-text-faint">
              {deal.deal_id}
            </span>
            <StagePill stage={deal.stage} />
          </div>

          <h3 className="mt-1 truncate font-display text-base text-text">
            {deal.company}
          </h3>

          <p className="mt-0.5 truncate text-xs text-text-dim">
            {deal.vertical}
            {deal.state ? ` · ${deal.state}` : ''}
            {deal.utility ? ` · ${deal.utility}` : ''}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
            {deal.size_mw ? <span>{formatMw(deal.size_mw)}</span> : null}
            {deal.size_usd_m ? <span>{formatUsd(deal.size_usd_m)}</span> : null}
            <span className="font-mono">MEDDPICC {deal.meddpicc_score}/8</span>

            <span
              className={cn(
                'inline-flex items-center gap-1',
                deal.multi_threaded ? 'text-text-dim' : 'text-warning',
              )}
              title={
                deal.multi_threaded
                  ? 'Multi-threaded'
                  : 'Single-threaded — health is capped at 6'
              }
            >
              <Users size={12} strokeWidth={2} />
              {deal.multi_threaded ? 'Multi' : 'Single'}
            </span>

            <span
              className={cn(
                'inline-flex items-center gap-1',
                deal.decision_mapped ? 'text-success' : 'text-warning',
              )}
              title={
                deal.decision_mapped ? 'Decision process mapped' : 'Decision process unmapped'
              }
            >
              {deal.decision_mapped ? (
                <CheckCircle2 size={12} strokeWidth={2} />
              ) : (
                <AlertTriangle size={12} strokeWidth={2} />
              )}
              Decision
            </span>
          </div>

          {deal.next_move ? (
            <p className="mt-2 line-clamp-2 text-xs text-text-dim">
              <span className="eyebrow mr-1.5">Next</span>
              {deal.next_move}
            </p>
          ) : null}

          {topFlag ? (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-xs',
                topFlag.severity === 'danger' ? 'text-danger' : 'text-warning',
              )}
            >
              <AlertTriangle size={12} strokeWidth={2} />
              {topFlag.label}
              {flags.length > 1 ? ` +${flags.length - 1} more` : ''}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
