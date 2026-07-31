import { getDeals, getUserSettings } from '@/lib/data';
import { getTickerData } from '@/lib/ticker-data';
import { getActiveVertical } from '@/lib/active-vertical';
import { getLiveFeed } from '@/lib/engine/live-feed';
import { runDiscovery, type CoverageGap } from '@/lib/engine/discover';
import { findPeerCandidates } from '@/lib/engine/peer-radar';
import { computeTrends } from '@/lib/engine/trending';
import { getFeedStates } from '@/lib/feed-state';
import IntelFeed from '@/components/modules/intel-feed';

export const metadata = { title: 'Intelligence' };

/**
 * Live on load.
 *
 * This page used to read persisted rows and show "no sweep has run yet" until
 * someone pressed a button — the first screen of the product was an
 * instruction. It now fetches the configured sources itself (behind the live
 * feed's ~10 minute cache) and always renders something, falling back to seed
 * only when every source is unreachable.
 *
 * force-dynamic rather than a revalidate window: the caching that matters now
 * lives in getLiveFeed, which is shared with /api/feed and the entity pages, so
 * a second cache here would only make the two disagree about how fresh the page
 * is.
 */
export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const [{ data: deals }, ticker, settings, states] = await Promise.all([
    getDeals(),
    getTickerData(),
    getUserSettings(),
    getFeedStates(),
  ]);

  const feed = await getLiveFeed(deals);
  const vertical = getActiveVertical();

  /**
   * Discovery is best-effort and must never take the page down with it. It
   * fetches live feeds that can be slow, blocked or gone — an Intelligence page
   * that 500s because an outlet's RSS moved is a far worse outcome than one
   * missing its gap block for 15 minutes.
   */
  let gaps: CoverageGap[] = [];
  try {
    gaps = await runDiscovery(
      vertical,
      feed.items.map((i) => ({ title: i.title, publishedAt: i.published_at })),
      settings?.source_prefs?.enabled ?? [],
    );
  } catch (err) {
    console.warn('[intelligence] discovery failed:', err);
  }

  const peers = findPeerCandidates(gaps, deals);

  // Trending and Today's Topics read one ranked pool, drawn from the reader's
  // own vocabulary: utilities, regulators, pipeline companies, watchlist topics.
  const trends = computeTrends(feed.items, deals, 12);

  return (
    <IntelFeed
      items={feed.items}
      deals={deals}
      ticker={ticker}
      isSeed={feed.isSeed}
      live={feed.live}
      fetchedAt={feed.fetchedAt}
      eagerCount={feed.eagerCount}
      gaps={gaps}
      peers={peers}
      trends={trends}
      initialStates={states}
    />
  );
}
