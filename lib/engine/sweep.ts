import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deal, FeedItem, SourceTier } from '@/lib/types';
import { getActiveVertical, resolveSources } from '@/lib/active-vertical';
import { fetchSources, withinHours, sortByRecency, type RawItem } from './rss';
import { fetchClassViTrackers } from './class-vi-trackers';
import { classifyTier, isBreaking, mapToAccounts, verticalTagsFor } from './tiering';
import { fetchContent } from './fetch-content';
import { summarizeItem, CACHE_TTL_HOURS } from './summarize';
import { canRun } from './model-routing';
// The hook lives with the live feed so a reader sees the same sentence before
// and after a sweep persists the item.
import { buildHook } from './live-feed';
import type { SourcePrefs } from '@/lib/types';

/**
 * The sweep: fetch → grade → summarize → map to accounts → store.
 *
 * Cache discipline (GLOBAL RULE 9): an item already in feed_items inside the
 * 24h window is skipped entirely — no fetch, no summarize, no tokens. A
 * re-run costs approximately nothing.
 */

export interface SweepResult {
  new_items: number;
  skipped_cached: number;
  accounts_hit: string[];
  peers_surfaced: string[];
  sources_fetched: number;
  sources_failed: number;
  errors: string[];
}

export interface SweepOptions {
  /** How far back to consider items. */
  windowHours?: number;
  /** Cap on items processed per run — bounds cost on the first sweep. */
  maxItems?: number;
  sourcePrefs?: Partial<SourcePrefs> | null;
}

export async function runSweep(
  supabase: SupabaseClient,
  userId: string,
  deals: Deal[],
  options: SweepOptions = {},
): Promise<SweepResult> {
  const { windowHours = 72, maxItems = 60 } = options;

  const vertical = getActiveVertical();
  const sources = resolveSources(vertical, options.sourcePrefs).filter(
    (s) => s.role === 'core',
  );

  const result: SweepResult = {
    new_items: 0,
    skipped_cached: 0,
    accounts_hit: [],
    peers_surfaced: [],
    sources_fetched: sources.length,
    sources_failed: 0,
    errors: [],
  };

  // ── 1. Fetch ──
  /**
   * Class VI trackers are scraped, not RSS — neither EPA nor the primacy
   * states publish a feed (see lib/engine/class-vi-trackers.ts). They ride
   * alongside the feeds rather than in the source list because they have no
   * URL to configure and cannot be muted per-user through source_prefs.
   *
   * Exempt from the recency window on purpose: these are refreshed every few
   * months, so a 72-hour filter would discard them on almost every sweep.
   * Dedupe by URL hash already guarantees each revision surfaces once.
   */
  const [feedItems, trackerItems] = await Promise.all([
    fetchSources(sources),
    fetchClassViTrackers(),
  ]);
  result.sources_fetched += trackerItems.length;

  const raw = [
    ...trackerItems,
    ...sortByRecency(withinHours(feedItems, windowHours)),
  ];
  if (raw.length === 0) {
    result.errors.push('No items returned — every source failed or the window is empty.');
    return result;
  }

  // ── 2. Cache check: one query for the whole batch ──
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
  const keys = raw.map((i) => i.key);

  const { data: cached } = await supabase
    .from('feed_items')
    .select('url_hash')
    .eq('user_id', userId)
    .in('url_hash', keys)
    .gte('cached_at', cutoff);

  const cachedKeys = new Set((cached ?? []).map((r) => r.url_hash as string));
  const fresh = raw.filter((i) => !cachedKeys.has(i.key)).slice(0, maxItems);
  result.skipped_cached = raw.length - fresh.length;

  if (fresh.length === 0) return result;

  // ── 3. Process ──
  const accountsHit = new Set<string>();
  const rows: Partial<FeedItem>[] = [];
  const aiAvailable = canRun('summarize');

  // Sequential rather than parallel: publishers rate-limit, and the free Groq
  // tier does too. A sweep is a background action — throughput is not the
  // constraint, getting throttled halfway through is.
  for (const item of fresh) {
    try {
      rows.push(await processItem(item, deals, accountsHit, aiAvailable, userId, supabase));
    } catch (err) {
      result.errors.push(`${item.sourceName}: ${(err as Error).message}`);
    }
  }

  // ── 4. Store ──
  if (rows.length > 0) {
    const { error } = await supabase
      .from('feed_items')
      .upsert(rows, { onConflict: 'user_id,url_hash' });

    if (error) {
      result.errors.push(`Store failed: ${error.message}`);
      return result;
    }
    result.new_items = rows.length;
  }

  result.accounts_hit = [...accountsHit];

  // ── 5. Market watch entries for items that hit accounts ──
  const hits = rows.filter((r) => (r.deal_ids?.length ?? 0) > 0);
  if (hits.length > 0) {
    const watchRows = hits.map((r) => ({
      category: mapCategoryToWatch(r.category ?? ''),
      source_name: r.source_name,
      source_tier: r.tier as SourceTier,
      headline: r.title!,
      summary: r.synthesis,
      url: r.url,
      deal_ids: r.deal_ids,
      outreach_hook: r.action,
      peers_to_add: [],
      impact_rank: impactRank(r),
      user_id: userId,
    }));

    const { error } = await supabase.from('market_watch_log').insert(watchRows);
    if (error) result.errors.push(`Market watch write failed: ${error.message}`);
  }

  return result;
}

async function processItem(
  item: RawItem,
  deals: Deal[],
  accountsHit: Set<string>,
  aiAvailable: boolean,
  userId: string,
  supabase: SupabaseClient,
): Promise<Partial<FeedItem>> {
  // Grade before spending anything on it.
  const { tier, confidence } = classifyTier(item);

  // Only fetch the full article when the feed snippet is too thin to summarize.
  const content = await fetchContent(item.url, item.content || item.summary);

  let synthesis: string | null = null;
  if (aiAvailable) {
    const summary = await summarizeItem(
      {
        title: item.title,
        content: content.text,
        url: item.url,
        source: item.sourceName,
      },
      'summary',
      supabase,
    );
    // The prompt returns this sentinel for off-topic items rather than
    // manufacturing relevance.
    synthesis = summary.text.trim() === 'NOT RELEVANT' ? null : summary.text;
  } else {
    synthesis = item.summary.slice(0, 400) || null;
  }

  const matches = mapToAccounts(
    { title: item.title, summary: item.summary, content: content.text, category: item.category },
    deals,
  );
  matches.forEach((m) => accountsHit.add(m.company));

  return {
    title: item.title,
    synthesis,
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
    action: buildHook(matches, item.sourceName),
    // The hook is a heuristic suggestion, never a verified claim.
    action_tier: 'inferred',
    breaking: isBreaking(item),
    cached_at: new Date().toISOString(),
    user_id: userId,
  };
}

function mapCategoryToWatch(category: string): string {
  switch (category) {
    case 'power-markets': return 'rate-move';
    case 'policy': return 'policy';
    case 'ccus': return 'ccus';
    case 'og':
    case 'industrial':
    case 'data-center':
    case 'defense': return 'customer-announcement';
    default: return 'peer-signal';
  }
}

/** 1-10 impact. Provenance and account-hit count carry the most weight. */
function impactRank(row: Partial<FeedItem>): number {
  let score = 4;
  if (row.tier === 'verified') score += 3;
  else if (row.tier === 'reported') score += 1;
  if (row.breaking) score += 2;
  score += Math.min(2, row.deal_ids?.length ?? 0);
  return Math.max(1, Math.min(10, score));
}


/**
 * The recorded failure, written so the next reader can act on it.
 *
 * Leads with the count for scanning, then the actual messages, because "1 of 1
 * sweeps reported errors" is a fact about arithmetic and "Reuters Energy: 404"
 * is a fact about the world.
 */
const MAX_REPORTED = 5;

export function sweepError(
  failing: number,
  total: number,
  messages: string[],
): string | null {
  if (failing === 0) return null;
  const head = `${failing} of ${total} user sweeps reported errors`;
  if (messages.length === 0) {
    // Distinguishable from the ordinary case on purpose: a sweep that reported
    // a failure with no message is itself a defect worth seeing.
    return `${head} — and reported no message, which is its own bug.`;
  }
  // Deduplicated HERE, not at the call site. The same broken source across
  // three users is one fact, and a transform applied by the caller is a
  // transform no test can reach — the mutation that deleted it from the route
  // passed the whole suite.
  const unique = [...new Set(messages)];
  const shown = unique.slice(0, MAX_REPORTED);
  const rest = unique.length - shown.length;
  return `${head}: ${shown.join(' · ')}${rest > 0 ? ` · (+${rest} more)` : ''}`;
}
