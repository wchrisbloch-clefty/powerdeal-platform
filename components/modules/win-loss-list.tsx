'use client';

import { useMemo, useState } from 'react';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { OUTCOME_TYPES, type OutcomeType, type WinLossEntry } from '@/lib/types';

/**
 * WIN-LOSS READ SURFACE.
 *
 * Shipped in the same pass as the capture, not after it. Verbatims sitting in a
 * table nobody opens are worse than not capturing them at all — the cost is
 * paid at the hardest possible moment, right after a loss, and never returned.
 *
 * The quote is the headline of each row. Everything else is metadata about a
 * quote; presenting the outcome type first would make this a status list, which
 * is the version of this feature that does not compound.
 */
export default function WinLossList({
  entries,
  showCompany = false,
}: {
  entries: WinLossEntry[];
  /** On the deal page the company is redundant; in the log it is the anchor. */
  showCompany?: boolean;
}) {
  const [filter, setFilter] = useState<OutcomeType | 'all'>('all');

  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.outcome_type === filter)),
    [entries, filter],
  );

  const quoted = useMemo(
    () => entries.filter((e) => Boolean(e.buyer_verbatim?.trim())).length,
    [entries],
  );

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-dim">
        No outcomes logged yet. Closing a deal here records what the buyer actually said, which
        is the part that compounds.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', ...OUTCOME_TYPES] as const).map((o) => {
          const n = o === 'all' ? entries.length : entries.filter((e) => e.outcome_type === o).length;
          return (
            <button
              key={o}
              onClick={() => setFilter(o)}
              className={cn(
                'min-h-tap-sm rounded-sm border px-2.5 text-xs transition-colors duration-fast xl:min-h-0 xl:py-1',
                filter === o
                  ? 'border-accent bg-accent-bg text-accent-dim'
                  : 'border-rule text-text-dim hover:text-text',
              )}
            >
              {o === 'all' ? 'All' : o}
              <span className="ml-1 font-mono text-2xs text-text-faint tabular-nums">{n}</span>
            </button>
          );
        })}
        {/* How much of the log is actually usable as evidence, rather than
            just recorded. A count of rows would overstate it. */}
        <span className="ml-auto text-2xs text-text-faint">
          {quoted} of {entries.length} carry a quote
        </span>
      </div>

      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e.id} className="rounded-card border border-rule p-3">
            {e.buyer_verbatim?.trim() ? (
              <blockquote className="flex gap-2">
                <Quote size={13} className="mt-0.5 shrink-0 text-accent-dim" aria-hidden />
                <p className="text-sm leading-normal text-text">{e.buyer_verbatim}</p>
              </blockquote>
            ) : (
              <p className="text-sm text-text-dim">
                No verbatim captured — only the category is on record for this close.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule-faint pt-2">
              {showCompany ? (
                <span className="text-xs font-medium text-text">{e.company}</span>
              ) : null}
              <span
                className={cn(
                  'font-mono text-2xs uppercase tracking-label',
                  e.outcome_type === 'Won' ? 'text-accent-dim' : 'text-text-faint',
                )}
              >
                {e.outcome_type}
              </span>
              {e.competitor_won ? (
                <span className="text-xs text-text-dim">lost to {e.competitor_won}</span>
              ) : null}
              <span className="text-xs text-text-faint">{formatDate(e.closed_at)}</span>
            </div>

            {e.reason || e.lesson || e.revisit_trigger ? (
              <dl className="mt-2 space-y-1">
                {e.reason ? <Meta term="Why" detail={e.reason} /> : null}
                {e.lesson ? <Meta term="Lesson" detail={e.lesson} /> : null}
                {e.revisit_trigger ? <Meta term="Revisit if" detail={e.revisit_trigger} /> : null}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <dt className="shrink-0 text-text-faint">{term}</dt>
      <dd className="text-text-dim">{detail}</dd>
    </div>
  );
}
