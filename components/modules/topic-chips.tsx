'use client';

import Link from 'next/link';
import { ChevronDown, Hash, X } from 'lucide-react';
import type { Trend } from '@/lib/engine/trending';
import { entityHref } from '@/lib/engine/entities';
import { cn } from '@/lib/utils';

/**
 * TODAY'S TOPICS — the denser, scannable counterpart to Trending.
 *
 * Same ranked pool as the sidebar, wrapped into a block so a whole day reads at
 * once instead of ten rows at a time.
 *
 * Two behaviours per chip, and the split is deliberate:
 *
 *   · CLICK  → the entity page. Navigating somewhere useful matters more than
 *              filtering, so it gets the gesture nobody has to learn.
 *   · CHEVRON (or Alt-click) → filter the feed in place.
 *
 * The spec offered a modifier-click as the primary filter gesture. It is here
 * as a shortcut, but it is not the only way in: a modifier is invisible, it is
 * different on every platform, and it is unreachable on a touchscreen — so the
 * chevron carries the behaviour and Alt-click is the accelerator for anyone who
 * finds it.
 */
export default function TopicChips({
  trends,
  activeTopic,
  onFilter,
  className,
}: {
  trends: Trend[];
  activeTopic: string | null;
  onFilter: (topic: string | null) => void;
  className?: string;
}) {
  if (trends.length === 0) return null;

  return (
    <section className={className} aria-label="Today's topics">
      <div className="mb-2 flex items-center gap-2">
        <Hash size={13} className="text-accent" aria-hidden />
        <span className="eyebrow">Today&rsquo;s topics</span>
        {activeTopic ? (
          <button
            type="button"
            onClick={() => onFilter(null)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-2xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
          >
            <X size={11} aria-hidden />
            Clear filter
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {trends.map((t) => {
          const active = activeTopic === t.name;
          return (
            <span
              key={t.slug}
              className={cn(
                'group inline-flex items-stretch overflow-hidden rounded-full border transition-colors',
                active
                  ? 'border-accent-border bg-accent-bg'
                  : 'border-rule bg-bg-raised hover:border-accent-border',
              )}
            >
              <Link
                href={entityHref(t)}
                title={`${t.name} — ${t.type}, ${t.count} mention${t.count === 1 ? '' : 's'}`}
                onClick={(e) => {
                  // Alt-click filters instead of navigating. Meta/Ctrl are left
                  // alone so open-in-new-tab keeps working.
                  if (e.altKey) {
                    e.preventDefault();
                    onFilter(active ? null : t.name);
                  }
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 text-xs',
                  active ? 'text-accent-dim' : 'text-text-dim group-hover:text-text',
                )}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--prov-${t.tier})` }}
                  aria-hidden
                />
                {t.name}
                <span className="font-mono text-2xs text-text-faint">{t.count}</span>
              </Link>
              <button
                type="button"
                onClick={() => onFilter(active ? null : t.name)}
                aria-pressed={active}
                aria-label={
                  active ? `Clear filter on ${t.name}` : `Filter feed to ${t.name}`
                }
                title={active ? `Clear filter on ${t.name}` : `Filter feed to ${t.name}`}
                className={cn(
                  'inline-flex items-center border-l px-1 transition-colors',
                  active
                    ? 'border-accent-border text-accent-dim'
                    : 'border-rule text-text-faint hover:bg-bg-overlay hover:text-text',
                )}
              >
                <ChevronDown size={11} aria-hidden />
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}
