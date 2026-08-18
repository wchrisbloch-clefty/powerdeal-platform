'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, Zap, Rows3, LayoutGrid, Share2, Database } from 'lucide-react';
import type { FeedItem, Deal } from '@/lib/types';
import type { CoverageGap } from '@/lib/engine/discover';
import type { PeerCandidate } from '@/lib/engine/peer-radar';
import type { Trend } from '@/lib/engine/trending';
import type { ItemState, FeedStateMap } from '@/lib/feed-state';
import { getActiveVertical } from '@/lib/active-vertical';
import {
  FEED_PLATFORMS,
  PLATFORM_LABELS,
  platformCounts,
  platformOf,
  type FeedPlatform,
} from '@/lib/platforms';
import { cn, relativeTime } from '@/lib/utils';
import FeedItemCard, { DismissedRow } from './feed-item';
import CoverageGapBlock from './coverage-gap';
import TrendingPanel from './trending-panel';
import TopicChips from './topic-chips';
import WeeklyRecapPanel from './weekly-recap';
import Ticker, { type TickerData } from './ticker';
import Button from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';

type View = 'grid' | 'list';

export default function IntelFeed({
  items,
  deals,
  ticker,
  isSeed,
  live,
  fetchedAt,
  eagerCount,
  gaps,
  peers,
  trends,
  initialStates,
  initialDismissed,
  feedHealth,
}: {
  items: FeedItem[];
  deals: Deal[];
  ticker: TickerData;
  /** True when every source was unreachable and this is seed content. */
  isSeed: boolean;
  live: boolean;
  fetchedAt: string;
  /** Items beyond this index summarize lazily, on open. */
  eagerCount: number;
  gaps: CoverageGap[];
  peers: PeerCandidate[];
  trends: Trend[];
  initialStates: FeedStateMap;
  /** Read back on every load — a dismissal nothing consults is theater. */
  initialDismissed: Record<string, { reason: string | null; at: string }>;
  /** Latest scheduled probe — null when one has never run. */
  feedHealth: { ok: number; checked: number; broken: number; checkedAt: string } | null;
}) {
  const router = useRouter();
  const vertical = getActiveVertical();
  const [category, setCategory] = useState('all');
  const [platform, setPlatform] = useState<FeedPlatform | 'all'>('all');
  const [topic, setTopic] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');
  const [refreshing, setRefreshing] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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

  /**
   * Dismissed keys, seeded from the server so a dismissal survives a reload.
   * `justDismissed` is the short-lived undo window — the card is replaced in
   * place by an Undo row rather than vanishing, so the reader can see what they
   * just lost and get it back.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => new Set(Object.keys(initialDismissed)),
  );
  const [justDismissed, setJustDismissed] = useState<Record<string, string>>({});

  function onDismissed(key: string, _reason: string | null) {
    setDismissed((prev) => new Set(prev).add(key));
    const title = items.find((i) => (i.url_hash ?? i.id) === key)?.title ?? 'Item';
    setJustDismissed((prev) => ({ ...prev, [key]: title }));
    // The undo affordance is deliberately brief — long enough to catch a
    // mis-swipe, short enough that the feed does not fill with tombstones.
    setTimeout(() => {
      setJustDismissed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 8000);
  }

  async function undoDismiss(key: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setJustDismissed((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await fetch('/api/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, undo: true }),
      });
    } catch {
      // The optimistic restore already happened; a failed write means it
      // reappears as dismissed on the next load, which is recoverable.
    }
  }

  /**
   * Category and platform are independent axes and combine freely — "CCUS on
   * YouTube" is a state a reader can reach. They are separate rows rather than
   * one merged chip strip because they answer different questions: what a story
   * is about, and where it came from.
   */
  const filtered = useMemo(() => {
    let out = category === 'all' ? items : items.filter((i) => i.category === category);
    // Dismissals are honoured here, not just recorded.
    out = out.filter((i) => {
      const key = i.url_hash ?? i.id;
      return !dismissed.has(key) || key in justDismissed;
    });
    if (platform !== 'all') out = out.filter((i) => platformOf(i) === platform);
    if (topic) {
      const needle = topic.toLowerCase();
      out = out.filter((i) =>
        `${i.title} ${i.synthesis ?? ''}`.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [items, category, platform, topic, dismissed, justDismissed]);

  const counts = useMemo(() => platformCounts(items), [items]);

  const breaking = filtered.filter((i) => i.breaking);

  /** Force a refetch of the live sources, bypassing the ~10 minute cache. */
  async function refresh() {
    setRefreshing(true);
    setNote(null);
    try {
      await fetch('/api/feed?refresh=1&limit=1');
      router.refresh();
    } catch {
      setNote('Could not refresh the sources.');
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * The sweep is background work now — the cron runs it and the page no longer
   * depends on it. It stays reachable because persistence is what makes trends
   * accumulate and gives the weekly recap material, and there are times you
   * want that to happen now rather than at the next cron tick.
   */
  async function sweep() {
    setSweeping(true);
    setNote(null);
    try {
      const res = await fetch('/api/feed/sweep', { method: 'POST' });
      const body = (await res.json()) as {
        new_items?: number;
        accounts_hit?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Sweep failed (${res.status})`);
      const hits = body.accounts_hit?.length ?? 0;
      setNote(
        `Persisted ${body.new_items ?? 0} items` +
          (hits > 0 ? `, ${hits} account${hits === 1 ? '' : 's'} hit.` : ', no account hits.'),
      );
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Sweep failed.');
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* ⚠️ THE PAGE TITLE WAS RENDERED TWICE. This panel carried its own
              "Market Watch / Intelligence" header, and so does the page it is
              mounted inside — two <h1>s on one surface, both saying the same
              word, one directly under the other. Neither author saw the
              other's, which is what a hand-copied pattern in six files buys
              you.
              The panel keeps its STATE line, because that is genuinely the
              panel's to report, and drops the title, which is the page's. */}
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-faint">
            <span>
              {live ? 'Live from' : 'Seed content —'} {vertical.sources.length} configured sources ·
              updated {relativeTime(fetchedAt)}
            </span>
            {/* Feed health from the weekly probe. A dead publisher just makes
                the stream quieter with no error, so the count belongs where
                the stream is actually read. */}
            {feedHealth ? (
              <Link
                href="/app/intelligence?tab=sources"
                className={cn(
                  'underline underline-offset-2',
                  feedHealth.broken > 0 ? 'text-danger' : 'hover:text-text-dim',
                )}
              >
                {feedHealth.broken > 0
                  ? `${feedHealth.broken} feed${feedHealth.broken === 1 ? '' : 's'} down — view`
                  : `${feedHealth.ok}/${feedHealth.checked} healthy`}
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {note ? <span className="text-xs text-text-dim">{note}</span> : null}
          {/* Capture is the Web Share Target landing — reachable directly so it
              is not only usable from a phone's share sheet. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/intelligence/capture')}>
            <Share2 size={14} />
            Capture
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={sweep}
            disabled={sweeping}
            title="Persist notable items so trends accumulate and the weekly recap has material. Runs on a cron too."
          >
            <Database size={14} className={cn(sweeping && 'animate-pulse')} />
            {sweeping ? 'Sweeping…' : 'Sweep'}
          </Button>
          <Button variant="primary" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
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

      {/*
        Seed is the honest failure mode, not a setup instruction. The old empty
        state told the reader to run a sweep before the page would show
        anything; the feed now fetches on load, so the only reason to see this
        is that every source was unreachable.
      */}
      {isSeed && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          Every configured source was unreachable, so this is seed content — not
          today&rsquo;s news. <span className="text-text">Refresh</span> to try
          again, or check Settings › Sources.
        </p>
      )}

      <TopicChips trends={trends} activeTopic={topic} onFilter={setTopic} />

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
                  <span className="ml-1 font-mono text-2xs opacity-60">{count}</span>
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

      {/* ── Platform row ── */}
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip active={platform === 'all'} onClick={() => setPlatform('all')}>
          All channels
        </Chip>
        {FEED_PLATFORMS.map((p) => {
          const count = counts[p];
          return (
            <Chip
              key={p}
              active={platform === p}
              onClick={() => setPlatform(p)}
              // A channel with nothing in it stays visible but unclickable —
              // hiding it would make the feed look like it has fewer channels
              // than it does, and "no LinkedIn captures yet" is information.
              disabled={count === 0}
            >
              {PLATFORM_LABELS[p]}
              <span className="ml-1 font-mono text-2xs opacity-60">{count}</span>
            </Chip>
          );
        })}
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

      {/* Feed left, discovery + trending right. The sidebar drops below the
          feed on narrow screens rather than squeezing both. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-4">
          <CoverageGapBlock gaps={gaps} peers={peers} />

          {filtered.length === 0 ? (
            <EmptyState
              kind="missing"
              title="Nothing matches this filter"
              body="Widen the category or clear the topic filter. Discovery sources are off by default — turn them on in Settings to catch stories your core sources missed."
            />
          ) : (
            <div className={cn('grid gap-3', view === 'grid' && 'xl:grid-cols-2')}>
              {filtered.map((item) => {
                const key = item.url_hash ?? item.id;
                if (key in justDismissed) {
                  return (
                    <DismissedRow
                      key={item.id}
                      title={justDismissed[key]}
                      onUndo={() => void undoDismiss(key)}
                    />
                  );
                }
                return (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  deals={deals}
                  state={states[item.id]}
                  onStateChange={onStateChange}
                  onDismissed={onDismissed}
                  // Position in the UNFILTERED list decides this: the top 10 by
                  // recency were summarized on the server, and filtering the
                  // view doesn't change which those were.
                  lazySummary={items.indexOf(item) >= eagerCount}
                />
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar order is "this week" above "right now" on purpose: the recap
            is the thing you read once and act on, trending is the thing you
            scan. Placement is provisional pending the IA restructure — the
            panel fetches its own data and can move as a unit. */}
        <div className="min-w-0 space-y-4">
          <WeeklyRecapPanel />
          <TrendingPanel trends={trends} />
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-tap min-w-tap items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors xl:min-h-0 xl:min-w-0',
        active
          ? 'border-accent-border bg-accent-bg text-accent-dim'
          : 'border-rule bg-bg-raised text-text-dim hover:text-text',
        disabled && 'cursor-not-allowed opacity-40 hover:text-text-dim',
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
        'inline-flex h-tap w-tap items-center justify-center rounded transition-colors xl:h-7 xl:w-7',
        active ? 'bg-bg-overlay text-text' : 'text-text-dim hover:text-text',
      )}
    >
      <Icon size={14} />
    </button>
  );
}
