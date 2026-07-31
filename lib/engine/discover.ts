import type { VerticalConfig, SourceConfig } from '@/lib/verticals/types';
import { fetchSources, withinHours, type RawItem } from './rss';

/**
 * Coverage gap detection — The Hub's discover pattern.
 *
 * Answers one question: "did something big happen that none of my sources
 * covered?" Discovery items NEVER enter the main feed. They surface in a
 * separate "Trending — not in your feeds" rail, always tagged INFERRED.
 */

export interface Cluster {
  /** Representative headline for the cluster. */
  headline: string;
  /** Distinct outlets covering it — the strength signal. */
  outletCount: number;
  outlets: string[];
  items: RawItem[];
  url: string;
  publishedAt: string | null;
}

/** Words that carry no signal when comparing headlines. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it',
  'its', 'this', 'that', 'these', 'those', 'has', 'have', 'had', 'will',
  'would', 'could', 'should', 'may', 'says', 'said', 'new', 'after', 'over',
  'amid', 'into', 'more', 'than', 'up', 'down', 'out',
]);

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Jaccard overlap — cheap, and good enough for headline clustering. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

const SIMILARITY_THRESHOLD = 0.34;

/** Group items that are covering the same story. */
export function clusterItems(items: RawItem[]): Cluster[] {
  const clusters: { tokens: Set<string>; items: RawItem[] }[] = [];

  for (const item of items) {
    const tokens = tokenize(item.title);
    if (tokens.size === 0) continue;

    const hit = clusters.find((c) => similarity(c.tokens, tokens) >= SIMILARITY_THRESHOLD);
    if (hit) {
      hit.items.push(item);
      // Widen the cluster's token set so it can absorb related phrasings.
      for (const t of tokens) hit.tokens.add(t);
    } else {
      clusters.push({ tokens, items: [item] });
    }
  }

  return clusters.map((c) => {
    const outlets = [...new Set(c.items.map((i) => i.sourceName))];
    // The earliest item in a cluster is usually the cleanest headline.
    const primary =
      [...c.items].sort((a, b) => {
        const at = a.publishedAt ? Date.parse(a.publishedAt) : Infinity;
        const bt = b.publishedAt ? Date.parse(b.publishedAt) : Infinity;
        return at - bt;
      })[0] ?? c.items[0];

    return {
      headline: primary.title,
      outletCount: outlets.length,
      outlets,
      items: c.items,
      url: primary.url,
      publishedAt: primary.publishedAt,
    };
  });
}

export interface CoverageGap extends Cluster {
  /** Why this is a gap — shown verbatim in the UI. */
  reason: string;
}

/**
 * Find stories the discovery net picked up that the reader's core sources
 * missed entirely.
 *
 * A gap requires corroboration from at least `minOutlets` distinct discovery
 * outlets — a single blog post is noise, three outlets on the same story is a
 * hole in the reader's coverage.
 */
/**
 * Only the headline and date of a core item matter for gap detection, so this
 * accepts the narrow shape. Lets the Intelligence page pass stored FeedItems
 * without inventing the rest of a RawItem.
 */
export interface CoreHeadline {
  title: string;
  publishedAt: string | null;
}

export function findCoverageGaps(
  coreItems: CoreHeadline[],
  discoveryItems: RawItem[],
  minOutlets = 2,
): CoverageGap[] {
  const coreTokenSets = coreItems.map((i) => tokenize(i.title));

  const gaps = clusterItems(discoveryItems)
    .filter((cluster) => cluster.outletCount >= minOutlets)
    .filter((cluster) => {
      const clusterTokens = tokenize(cluster.headline);
      // Covered by a core source? Then it isn't a gap.
      return !coreTokenSets.some(
        (core) => similarity(core, clusterTokens) >= SIMILARITY_THRESHOLD,
      );
    })
    .map(
      (cluster): CoverageGap => ({
        ...cluster,
        reason: `${cluster.outletCount} outlets covering this — none of them in your sources.`,
      }),
    );

  return gaps.sort((a, b) => b.outletCount - a.outletCount);
}

/**
 * Run the discovery net for a vertical and return the gaps.
 *
 * `enabledDiscoveryIds` lets a reader opt specific nets in; when empty we run
 * the full discovery list, since the results never touch the main feed.
 */
export async function runDiscovery(
  vertical: VerticalConfig,
  coreItems: CoreHeadline[],
  enabledDiscoveryIds: string[] = [],
  windowHours = 48,
): Promise<CoverageGap[]> {
  const nets: SourceConfig[] =
    enabledDiscoveryIds.length > 0
      ? vertical.discovery.filter((s) => enabledDiscoveryIds.includes(s.id))
      : vertical.discovery;

  if (nets.length === 0) return [];

  const discovered = withinHours(await fetchSources(nets, 3), windowHours);
  const cutoff = Date.now() - windowHours * 3600_000;
  const recentCore = coreItems.filter(
    (i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff,
  );
  return findCoverageGaps(recentCore, discovered);
}
