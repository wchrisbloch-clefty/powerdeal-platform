import type { FeedItem } from '@/lib/types';

/**
 * CHANNELS — the second axis of the unified feed.
 *
 * Category says what a story is about; platform says where it came from. They
 * are independent questions and the feed filters on both, so "CCUS on YouTube"
 * is a state a reader can actually reach.
 *
 * Deliberately derived rather than stored: a source's configured platform is
 * "rss" for everything with a feed URL, which would collapse Substack posts,
 * a regulator's filing feed and a newsletter into one undifferentiated channel.
 * The host is what actually distinguishes them, so it wins where it is known.
 *
 * This is pure and client-safe — the filter chips run in the browser.
 */

export const FEED_PLATFORMS = [
  'rss',
  'youtube',
  'reddit',
  'x',
  'linkedin',
  'substack',
  'captured',
] as const;

export type FeedPlatform = (typeof FEED_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<FeedPlatform, string> = {
  rss: 'RSS',
  youtube: 'YouTube',
  reddit: 'Reddit',
  x: 'X',
  linkedin: 'LinkedIn',
  substack: 'Substack',
  captured: 'Captured',
};

const HOST_PLATFORMS: [RegExp, FeedPlatform][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)substack\.com$/, 'substack'],
];

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Which channel an item arrived through.
 *
 * Arrival beats host for captures on purpose: a LinkedIn post someone shared
 * into PowerDeal is a capture first and a LinkedIn item second — the fact that
 * a human chose to keep it is the more useful thing to filter on, and it is
 * why captures are graded INFERRED regardless of where they came from.
 */
export function platformOf(item: Pick<FeedItem, 'platform' | 'arrival' | 'url'>): FeedPlatform {
  if (item.arrival === 'share' || item.arrival === 'manual') return 'captured';

  const declared = item.platform?.toLowerCase();
  if (declared && (FEED_PLATFORMS as readonly string[]).includes(declared)) {
    // A configured YouTube or Reddit source knows what it is.
    if (declared !== 'rss') return declared as FeedPlatform;
  }

  const host = hostOf(item.url);
  for (const [pattern, platform] of HOST_PLATFORMS) {
    if (pattern.test(host)) return platform;
  }

  return 'rss';
}

/** Counts per channel across a pool — drives the chip badges. */
export function platformCounts(items: FeedItem[]): Record<FeedPlatform, number> {
  const counts = Object.fromEntries(
    FEED_PLATFORMS.map((p) => [p, 0]),
  ) as Record<FeedPlatform, number>;

  for (const item of items) counts[platformOf(item)] += 1;
  return counts;
}
