'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Zap, Rows3, LayoutGrid, Share2 } from 'lucide-react';
import type { FeedItem, Deal } from '@/lib/types';
import type { CoverageGap } from '@/lib/engine/discover';
import type { PeerCandidate } from '@/lib/engine/peer-radar';
import type { Trend } from '@/lib/engine/trending';
import type { ItemState, FeedStateMap } from '@/lib/feed-state';
import { getActiveVertical } from '@/lib/active-vertical';
import { cn } from '@/lib/utils';
import FeedItemCard from './feed-item';
import CoverageGapBlock from './coverage-gap';
import TrendingPanel from './trending-panel';
import Ticker, { type TickerData } from './ticker';
import Button from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';

type View = 'grid' | 'list';

export default function IntelFeed({
  items,
  deals,
  ticker,
  isSeed,
  gaps,
  peers,
  trends,
  initialStates,
}: {
  items: FeedItem[];
  deals: Deal[];
  ticker: TickerData;
  isSeed: boolean;
  gaps: CoverageGap[];
  peers: PeerCandidate[];
  trends: Trend[];
  initialStates: FeedStateMap;
}) {
  const router = useRouter();
  const vertical = getActiveVertical();
  const [category, setCategory] = useState('all');
  const [topic, setTopic] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');
  const [sweeping, setSweeping] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

  // Mirrored client-side so a triage click is instant rather than waiting on a
  // server round trip and a re-render of the whole feed.
  const [states, setStates] = useState<Record<string, ItemState | undefined>>(() => {
    const seed: Record<string, ItemState | undefined> = {};
    for (const [id, rec] of Object.entries(initialStates)) seed[id] = rec.state;
    return seed;
  });

  function onStateChange(id: string, next: ItemState | null) {
    setStates((prev) => ({ ...prev, [id]: next ?? undefined }));
  }

  const filtered = useMemo(() => {
    let out = category === 'all' ? items : items.filter((i) => i.category === category);
    if (topic) {
      const needle = topic.toLowerCase();
      out = out.filter((i) =>
        `${i.title} ${i.synthesis ?? ''}`.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [items, category, topic]);

  const breaking = filtered.filter((i) => i.breaking);

  async function sweep() {
    setSweeping(true);
    setSweepMsg(null);
    try {
      const res = await fetch('/api/feed/sweep', { method: 'POST' });
      const body = (await res.json()) as {
        new_items?: number;
        accounts_hit?: string[];
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
          {sweepMsg ? <span className="text-xs text-text-dim">{sweepMsg}</span> : null}
          {/* Capture is the Web Share Target landing — reachable directly so it
              is not only usable from a phone's share sheet. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/intelligence/capture')}>
            <Share2 size={14} />
            Capture
          </Button>
          <Button variant="primary" size="sm" onClick={sweep} disabled={sweeping}>
            <RefreshCw size={14} className={cn(sweeping && 'animate-spin')} />
            {sweeping ? 'Sweeping…' : 'Run sweep'}
          </Button>
        </div>
      </header>

      <Ticker data={ticker} />

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

      {/* ── Filters + view toggle ── */}
      <div className="flex items-center gap-3">
        <div className="scrollbar-thin -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip active={category === 'all'} onClick={() => setCategory('all')}>
            All
          </Chip>
          {vertical.categories.map((c) => {
            const count = items.filter((i) => i.category === c.id).length;
            return (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
                {count > 0 ? (
                  <span className="ml-1 font-mono text-[10px] opacity-60">{count}</span>
                ) : null}
              </Chip>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-rule p-0.5">
          <ViewButton icon={LayoutGrid} label="Grid" active={view === 'grid'} onClick={() => setView('grid')} />
          <ViewButton icon={Rows3} label="List" active={view === 'list'} onClick={() => setView('list')} />
        </div>
      </div>

      {topic ? (
        <p className="text-xs text-text-dim">
          Filtered to <span className="text-text">{topic}</span>{' '}
          <button
            type="button"
            onClick={() => setTopic(null)}
            className="text-accent-dim underline underline-offset-2"
          >
            clear
          </button>
        </p>
      ) : null}

      {isSeed && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          No sweep has run yet. Hit <span className="text-text">Run sweep</span> to pull the{' '}
          {vertical.sources.length} configured sources, grade them, and map them to your accounts.
        </p>
      )}

      {/* Feed left, discovery + trending right. The sidebar drops below the
          feed on narrow screens rather than squeezing both. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-4">
          <CoverageGapBlock gaps={gaps} peers={peers} />

          {filtered.length === 0 ? (
            <EmptyState
              title="Nothing in this category yet"
              body="Run a sweep, or widen the filter. Discovery sources are off by default — turn them on in Settings to catch stories your core sources missed."
            />
          ) : (
            <div className={cn('grid gap-3', view === 'grid' && 'xl:grid-cols-2')}>
              {filtered.map((item) => (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  deals={deals}
                  state={states[item.id]}
                  onStateChange={onStateChange}
                />
              ))}
            </div>
          )}
        </div>

        <TrendingPanel
          trends={trends}
          activeTopic={topic}
          onSelect={setTopic}
          className="min-w-0"
        />
      </div>
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

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Rows3;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      title={`${label} view`}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
        active ? 'bg-bg-overlay text-text' : 'text-text-dim hover:text-text',
      )}
    >
      <Icon size={14} />
    </button>
  );
}
