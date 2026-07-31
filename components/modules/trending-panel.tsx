import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import type { Trend } from '@/lib/engine/trending';
import { entityHref } from '@/lib/engine/entities';
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
 * Every row is a LINK to that entity's page, not a filter. This used to filter
 * the feed in place, because PowerDeal had nowhere to send a click. It does
 * now, and the difference matters: filtering answers "which of my items mention
 * SDG&E", while the entity page answers "what is happening with SDG&E, which of
 * my deals it touches, and who else is circling it". In-place filtering still
 * exists — it moved to the chevron on the Today's Topics chips, where it is one
 * gesture among two rather than the only thing a click can do.
 */
export default function TrendingPanel({
  trends,
  className,
}: {
  trends: Trend[];
  className?: string;
}) {
  if (trends.length === 0) return null;

  return (
    <aside className={className} aria-label="Trending">
      <section className="rounded-card border border-rule bg-bg-raised p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} className="text-accent" aria-hidden />
          <span className="eyebrow">Trending now</span>
        </div>

        <ol className="flex flex-col">
          {trends.map((t, i) => (
            <li key={t.slug}>
              <Link
                href={entityHref(t)}
                className="group flex w-full items-baseline gap-2.5 border-b border-rule py-2 text-left last:border-0"
              >
                <span className="w-4 shrink-0 text-right font-mono text-2xs text-text-faint">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text group-hover:text-accent-dim">
                    {t.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-2xs">
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
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

/**
 * The horizontal variant, for pages where trending is a footer rail rather than
 * a sidebar — the entity page's "related entities".
 */
export function TrendingRow({
  trends,
  label = 'Related',
  className,
}: {
  trends: Trend[];
  label?: string;
  className?: string;
}) {
  if (trends.length === 0) return null;

  return (
    <div className={cn('', className)}>
      <div className="mb-2 flex items-center gap-1.5">
        <TrendingUp size={13} className="text-accent" aria-hidden />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {trends.map((t) => (
          <Link
            key={t.slug}
            href={entityHref(t)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 py-1 text-xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: `var(--prov-${t.tier})` }}
              aria-hidden
            />
            {t.name}
            <span className="font-mono text-text-faint">{t.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
