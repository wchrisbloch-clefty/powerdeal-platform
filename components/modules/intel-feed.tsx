'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Zap } from 'lucide-react';
import type { FeedItem, Deal } from '@/lib/types';
import { getActiveVertical } from '@/lib/active-vertical';
import { cn } from '@/lib/utils';
import FeedItemCard from './feed-item';
import Ticker, { type TickerData } from './ticker';
import Button from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';

export default function IntelFeed({
  items,
  deals,
  ticker,
  isSeed,
}: {
  items: FeedItem[];
  deals: Deal[];
  ticker: TickerData;
  isSeed: boolean;
}) {
  const router = useRouter();
  const vertical = getActiveVertical();
  const [category, setCategory] = useState('all');
  const [sweeping, setSweeping] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

  const filtered = useMemo(
    () => (category === 'all' ? items : items.filter((i) => i.category === category)),
    [items, category],
  );

  const breaking = filtered.filter((i) => i.breaking);

  async function sweep() {
    setSweeping(true);
    setSweepMsg(null);
    try {
      const res = await fetch('/api/feed/sweep', { method: 'POST' });
      const body = (await res.json()) as {
        new_items?: number;
        accounts_hit?: string[];
        peers_surfaced?: string[];
        error?: string;
      };

      if (!res.ok) throw new Error(body.error ?? `Sweep failed (${res.status})`);

      const hits = body.accounts_hit?.length ?? 0;
      setSweepMsg(
        `${body.new_items ?? 0} new items` +
          (hits > 0 ? `, ${hits} account${hits === 1 ? '' : 's'} hit` : ', no account hits'),
      );
      router.refresh();
    } catch (err) {
      setSweepMsg(err instanceof Error ? err.message : 'Sweep failed.');
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Market Watch</p>
          <h1 className="mt-1 font-display text-2xl text-text">Intelligence</h1>
        </div>
        <div className="flex items-center gap-2">
          {sweepMsg ? (
            <span className="text-xs text-text-dim">{sweepMsg}</span>
          ) : null}
          <Button variant="primary" size="sm" onClick={sweep} disabled={sweeping}>
            <RefreshCw size={14} className={cn(sweeping && 'animate-spin')} />
            {sweeping ? 'Sweeping…' : 'Run sweep'}
          </Button>
        </div>
      </header>

      <Ticker data={ticker} />

      {/* ── Breaking banner ── */}
      {breaking.length > 0 && (
        <div className="rounded-card border border-accent-border bg-accent-bg px-3.5 py-2.5">
          <p className="inline-flex items-center gap-2 text-sm text-text">
            <Zap size={14} className="text-accent" />
            <span className="font-medium">Breaking</span>
            <span className="text-text-dim">
              {breaking.length} item{breaking.length === 1 ? '' : 's'} in the last 6 hours
            </span>
          </p>
        </div>
      )}

      {/* ── Category chips ── */}
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </Chip>
        {vertical.categories.map((c) => {
          const count = items.filter((i) => i.category === c.id).length;
          return (
            <Chip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
              {count > 0 ? (
                <span className="ml-1 font-mono text-[10px] opacity-60">{count}</span>
              ) : null}
            </Chip>
          );
        })}
      </div>

      {isSeed && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          No sweep has run yet. Hit <span className="text-text">Run sweep</span> to pull
          the {vertical.sources.length} configured sources, grade them, and map them to
          your accounts.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this category yet"
          body="Run a sweep, or widen the filter. Discovery sources are off by default — turn them on in Settings to catch stories your core sources missed."
        />
      ) : (
        /* Two-column bento on desktop, single column on mobile. */
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => (
            <FeedItemCard key={item.id} item={item} deals={deals} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
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
        'whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-accent-border bg-accent-bg text-accent-dim'
          : 'border-rule bg-bg-raised text-text-dim hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
