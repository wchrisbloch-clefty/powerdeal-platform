import 'server-only';
import type { Deal, FeedItem } from '@/lib/types';
import { getActiveVertical, resolveSources } from '@/lib/active-vertical';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { fetchSources, sortByRecency, withinHours, type RawItem } from './rss';
import { classifyTier, isBreaking, mapToAccounts, verticalTagsFor } from './tiering';
import { summarizeItem } from './summarize';
import { canRun } from './model-routing';
import { SEED_FEED_ITEMS } from '@/lib/seed-data';

/**
 * LIVE FEED — the Intelligence surface fetches on load, like The Hub's.
 *
 * The old contract was "empty until you press Run sweep", which made the
 * product's first screen an instruction rather than intelligence. This fetches
 * the configured sources on every load and always renders something.
 *
 * Cost is controlled by splitting the per-item work by what it actually costs:
 *
 *   · Tier grading      — inline, every item. Pure string work.
 *   · Account mapping   — inline, every item. Pure string work.
 *   · AI summary        — eager for the top 10 by recency only.
 *   · Outreach hook     — eager top 10, and only when the item maps to a deal.
 *
 * Everything below the top 10 gets its summary and hook from /api/action when
 * the reader opens it. A story nobody opens never costs a token.
 *
 * Deliberately NOT done here: fetching each article's full body. The sweep does
 * that because it runs in the background with a 300s budget; doing it on a page
 * load would add one network round trip per item to time-to-first-render. Feed
 * snippets are shorter but they are already in hand.
 */

/** How many items get an AI summary up front. */
export const EAGER_SUMMARY_COUNT = 10;

/** Roughly ten minutes, so rapid navigation doesn't refetch every source. */
const CACHE_TTL_MS = 10 * 60_000;

/** How far back a live load looks. Wider than the sweep — this is the shop window. */
const WINDOW_HOURS = 96;

const MAX_ITEMS = 40;

export interface LiveFeed {
  items: FeedItem[];
  /** False when every source failed and this is seed content. */
  live: boolean;
  isSeed: boolean;
  fetchedAt: string;
  sourcesFetched: number;
  sourcesFailed: number;
  /** Items above this index have no AI summary yet. */
  eagerCount: number;
}

/**
 * Process-local cache.
 *
 * Honest about what this is: one warm serverless instance, not a shared cache.
 * A different instance refetches. That is fine — the expensive half (AI
 * summaries) is backed by the Supabase summary cache and survives across
 * instances, so a cold instance costs network time, not tokens.
 */
let cached: { at: number; value: LiveFeed } | null = null;
/** Collapses concurrent loads onto one fetch rather than N. */
let inFlight: Promise<LiveFeed> | null = null;

export function invalidateLiveFeed(): void {
  cached = null;
}

export async function getLiveFeed(deals: Deal[], force = false): Promise<LiveFeed> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (!force && inFlight) return inFlight;

  inFlight = buildLiveFeed(deals)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

async function buildLiveFeed(deals: Deal[]): Promise<LiveFeed> {
  const vertical = getActiveVertical();
  const sources = resolveSources(vertical).filter((s) => s.role === 'core');

  let raw: RawItem[] = [];
  try {
    raw = await fetchSources(sources);
  } catch (err) {
    // fetchSources already swallows per-source failures; this only catches a
    // total collapse. Either way the seed fallback below handles it.
    console.warn('[live-feed] fetch failed entirely:', (err as Error).message);
  }

  const windowed = sortByRecency(withinHours(raw, WINDOW_HOURS)).slice(0, MAX_ITEMS);

  // Every feed unreachable — offline, blocked, or DNS gone. Never show an empty
  // page: fall back to seed, tagged SEED so it is never mistaken for live.
  if (windowed.length === 0) {
    return {
      items: SEED_FEED_ITEMS.map((i) => ({ ...i, arrival: 'seed' })),
      live: false,
      isSeed: true,
      fetchedAt: new Date().toISOString(),
      sourcesFetched: sources.length,
      sourcesFailed: sources.length,
      eagerCount: 0,
    };
  }

  const sourcesSeen = new Set(raw.map((i) => i.sourceId));

  // ── Inline work: grading and account mapping, on every item ──
  const graded = windowed.map((item) => toFeedItem(item, deals));

  // ── Eager work: the top 10 by recency ──
  const supabase = getAdminClient();
  const eager = Math.min(EAGER_SUMMARY_COUNT, graded.length);
  const canSummarize = canRun('summarize');

  await inPool(graded.slice(0, eager), 4, async (entry, index) => {
    // The hook is deterministic, but it stays inside the eager window so an
    // item's card is assembled in one place — the tail gets both its summary
    // and its hook together from /api/action when it is opened.
    if (entry.matches.length > 0) {
      entry.item.action = buildHook(entry.matches, windowed[index].sourceName);
    }

    if (!canSummarize) return;
    try {
      const summary = await summarizeItem(
        {
          title: entry.item.title,
          content: windowed[index].content || windowed[index].summary || entry.item.title,
          url: entry.item.url ?? undefined,
          source: entry.item.source_name ?? undefined,
        },
        'summary',
        supabase,
      );
      // The prompt returns this sentinel rather than manufacturing relevance.
      if (summary.text.trim() !== 'NOT RELEVANT') entry.item.synthesis = summary.text;
    } catch {
      // Keep the snippet already in place. A summariser outage must not cost
      // us the item.
    }
  });

  return {
    items: graded.map((g) => g.item),
    live: true,
    isSeed: false,
    fetchedAt: new Date().toISOString(),
    sourcesFetched: sourcesSeen.size,
    sourcesFailed: Math.max(0, sources.length - sourcesSeen.size),
    eagerCount: eager,
  };
}

/**
 * A live item's id is the hash of its canonical URL, not a database uuid.
 *
 * That is what makes triage state survive a refetch: the same article gets the
 * same id on every load, so "not for me" sticks without the item ever having
 * been persisted.
 */
interface GradedItem {
  item: FeedItem;
  matches: ReturnType<typeof mapToAccounts>;
}

function toFeedItem(item: RawItem, deals: Deal[]): GradedItem {
  const { tier, confidence } = classifyTier(item);
  const matches = mapToAccounts(
    {
      title: item.title,
      summary: item.summary,
      content: item.content,
      category: item.category,
    },
    deals,
  );

  const feedItem: FeedItem = {
    id: item.key,
    title: item.title,
    // The feed snippet holds the line until an AI summary replaces it — eagerly
    // for the top 10, lazily via /api/action for everything below.
    synthesis: item.summary.slice(0, 400) || null,
    tier,
    confidence,
    arrival: item.platform === 'reddit' ? 'reddit' : 'rss',
    platform: item.platform,
    source_id: item.sourceId,
    source_name: item.sourceName,
    url: item.url,
    url_hash: item.key,
    image_url: item.imageUrl,
    byline: item.byline,
    published_at: item.publishedAt,
    category: item.category,
    vertical_tags: verticalTagsFor(item),
    deal_ids: matches.map((m) => m.dealId),
    action: null,
    action_tier: 'inferred',
    breaking: isBreaking(item),
    cached_at: new Date().toISOString(),
    user_id: POWERDEAL_USER_ID,
  };

  return { item: feedItem, matches };
}

/**
 * Outreach hook.
 *
 * Deliberately names the mapping basis rather than writing a pitch line. A
 * generated "call them about cost certainty" that isn't grounded in the item is
 * worse than saying plainly why the item surfaced. Shared with the sweep so the
 * hook a reader sees live is the one that gets persisted.
 */
export function buildHook(matches: ReturnType<typeof mapToAccounts>, sourceName: string): string | null {
  const top = matches[0];
  if (!top) return null;

  const others = matches.length > 1 ? ` (+${matches.length - 1} more)` : '';

  switch (top.basis) {
    case 'company':
      return `${top.company} named directly${others} — read it before your next touch.`;
    case 'utility':
      return `Hits ${top.company}'s utility territory${others}. Territory-level news is a live re-engagement reason.`;
    case 'state+vertical':
      return `Same state and vertical as ${top.company}${others}. Weak match — confirm relevance before using it.`;
    default:
      return `Relevant to ${top.company}${others}. Source: ${sourceName}.`;
  }
}

/** Bounded-concurrency map. Publishers and the free AI tiers both rate-limit. */
async function inPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}
