'use client';

import { TrendingUp } from 'lucide-react';
import type { Trend } from '@/lib/engine/trending';
import { cn } from '@/lib/utils';

/**
 * TRENDING NOW — ported from The Hub's trending sidebar.
 *
 * The two decisions carried over from theirs, both deliberate:
 *   · Every row shows the strongest tier that reported it. Ranking on volume
 *     alone lets a rumour repeated by five aggregators outrank one filing.
 *   · Rank numbers are mono and the accent never varies by position. Colouring
 *     by rank reads as importance the data does not support.
 *
 * Clicking a topic filters the feed rather than navigating away — PowerDeal
 * has no topic pages, and a chip that leads nowhere is worse than no chip.
 */
export default function TrendingPanel({
  trends,
  activeTopic,
  onSelect,
  className,
}: {
  trends: Trend[];
  activeTopic: string | null;
  onSelect: (topic: string | null) => void;
  className?: string;
}) {
  if (trends.length === 0) return null;

  return (
    <aside className={className} aria-label="Trending">
      <section className="rounded-card border border-rule bg-bg-raised p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={13} className="text-accent" aria-hidden />
            <span className="eyebrow">Trending now</span>
          </span>
          {activeTopic ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs text-text-dim underline underline-offset-2 hover:text-text"
            >
              Clear
            </button>
          ) : null}
        </div>

        <ol className="flex flex-col">
          {trends.map((t, i) => {
            const active = activeTopic === t.topic;
            return (
              <li key={t.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : t.topic)}
                  aria-pressed={active}
                  className={cn(
                    'group flex w-full items-baseline gap-2.5 border-b border-rule py-2 text-left last:border-0',
                    active && 'text-accent-dim',
                  )}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] text-text-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        active ? 'text-accent-dim' : 'text-text group-hover:text-accent-dim',
                      )}
                    >
                      {t.topic}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--prov-${t.tier})` }}
                        aria-hidden
                      />
                      <span className="text-text-dim">
                        {t.tier} · <span className="font-mono">{t.count}</span> mention
                        {t.count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
  );
}
