'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Gauge } from 'lucide-react';
import type { Deal, MarketWatchEntry } from '@/lib/types';
import { relativeTime, cn } from '@/lib/utils';
import { entitiesIn } from '@/lib/engine/entities';
import ProvenanceChip from '@/components/ui/provenance-chip';
import { EntityChip } from '@/components/ui/entity-link';
import Badge from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';

/**
 * MARKET WATCH — the curated subset that matters to a deal.
 *
 * The distinction from Feed is the whole point and is kept sharp deliberately:
 * Feed is the raw stream, everything the sources returned, graded and mapped.
 * Market Watch is only what the sweep judged notable enough to persist — which
 * it does exclusively for items that hit a pipeline account — ranked by impact
 * and carrying the re-engagement angle.
 *
 * So every row here has an account and a reason. If this ever starts looking
 * like a filtered Feed, the impact ranking has stopped doing its job and the
 * fix belongs in the sweep, not in this component.
 */
export default function MarketWatchPanel({
  entries,
  deals,
}: {
  entries: MarketWatchEntry[];
  deals: Deal[];
}) {
  const [category, setCategory] = useState('all');
  const [dealId, setDealId] = useState('all');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (category === 'all' || e.category === category) &&
          (dealId === 'all' || (e.deal_ids ?? []).includes(dealId)),
      ),
    [entries, category, dealId],
  );

  // Only accounts that actually appear — a filter listing deals with nothing
  // behind them is a menu of dead ends.
  const dealsWithEntries = useMemo(() => {
    const ids = new Set(entries.flatMap((e) => e.deal_ids ?? []));
    return deals.filter((d) => ids.has(d.id));
  }, [entries, deals]);

  if (entries.length === 0) {
    return (
      <EmptyState
          kind="unchecked"
        title="Nothing persisted yet"
        body="Market Watch fills as the sweep runs — it records only items that hit a pipeline account, so it stays a call list rather than a second feed. The sweep runs on a daily cron, or hit Sweep on the Feed tab."
      />
    );
  }

  return (
    <div className="space-y-rhythm-page">
      <p className="text-sm text-text-dim">
        Only what hit an account, ranked by impact. The raw stream is on{' '}
        <Link href="/app/intelligence" className="text-accent-dim underline underline-offset-2">
          Feed
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="scrollbar-thin -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
            All categories
          </FilterChip>
          {categories.map(([id, count]) => (
            <FilterChip key={id} active={category === id} onClick={() => setCategory(id)}>
              {id}
              <span className="ml-1 font-mono text-2xs opacity-60">{count}</span>
            </FilterChip>
          ))}
        </div>

        {dealsWithEntries.length > 0 && (
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            aria-label="Filter by account"
            className="h-tap xl:h-8 shrink-0 rounded-md border border-rule bg-bg-raised px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
          >
            <option value="all">All accounts</option>
            {dealsWithEntries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deal_id} · {d.company}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState kind="missing" title="Nothing matches this filter" body="Widen the category or account filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <MarketWatchRow key={entry.id} entry={entry} deals={deals} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MarketWatchRow({ entry, deals }: { entry: MarketWatchEntry; deals: Deal[] }) {
  const hits = (entry.deal_ids ?? [])
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  const entities = entitiesIn(
    { title: entry.headline, synthesis: entry.summary ?? null },
    deals,
    4,
  );

  return (
    <li className="rounded-card border border-rule bg-bg-raised p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceChip tier={entry.source_tier} />
        <Badge tone="neutral">{entry.category}</Badge>
        {entry.source_name ? (
          <span className="truncate text-xs text-text-dim">{entry.source_name}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <ImpactMeter rank={entry.impact_rank} />
          <span className="whitespace-nowrap text-xs text-text-faint">
            {relativeTime(entry.swept_at)}
          </span>
        </span>
      </div>

      <h3 className="mt-2 font-display text-base text-text">
        {entry.url ? (
          <a href={entry.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {entry.headline}
            <ExternalLink size={11} className="ml-1 inline align-baseline opacity-50" />
          </a>
        ) : (
          entry.headline
        )}
      </h3>

      {entry.summary ? (
        <p className="mt-1.5 text-sm text-text-dim">{entry.summary}</p>
      ) : null}

      {hits.length > 0 && (
        <p className="mt-2.5 text-sm text-text-dim">
          <span className="eyebrow mr-1.5">Hits</span>
          {hits.map((d, i) => (
            <span key={d.id}>
              {i > 0 ? ', ' : ''}
              <Link
                href={`/app/pipeline/${d.id}`}
                className="text-text underline decoration-rule underline-offset-2 hover:decoration-accent"
              >
                {d.company}
              </Link>
            </span>
          ))}
        </p>
      )}

      {/* The re-engagement angle is the reason this row was kept. */}
      {entry.outreach_hook ? (
        <p className="mt-2 text-sm italic text-accent-dim">→ {entry.outreach_hook}</p>
      ) : null}

      {entities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entities.map((e) => (
            <EntityChip key={e.name} entity={e} />
          ))}
        </div>
      )}
    </li>
  );
}

/** Impact 1–10, as a compact bar. The number is what you quote; the bar scans. */
function ImpactMeter({ rank }: { rank: number }) {
  const clamped = Math.max(1, Math.min(10, rank));
  return (
    <span className="inline-flex items-center gap-1" title={`Impact ${clamped} of 10`}>
      <Gauge size={11} className="text-text-faint" aria-hidden />
      <span className="flex h-1 w-10 overflow-hidden rounded-full bg-bg-overlay">
        <span
          className={cn('h-full rounded-full', clamped >= 8 ? 'bg-accent-mark' : 'bg-text-faint')}
          style={{ width: `${clamped * 10}%` }}
        />
      </span>
      <span className="font-mono text-2xs text-text-faint">{clamped}</span>
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-tap min-w-tap items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors xl:min-h-0 xl:min-w-0',
        active
          ? 'border-accent-border bg-accent-bg text-accent-dim'
          : 'border-rule bg-bg-raised text-text-dim hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
