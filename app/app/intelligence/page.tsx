import { getFeedItems, getDeals, getUserSettings } from '@/lib/data';
import { getTickerData } from '@/lib/ticker-data';
import { getActiveVertical } from '@/lib/active-vertical';
import { runDiscovery, type CoverageGap } from '@/lib/engine/discover';
import { findPeerCandidates } from '@/lib/engine/peer-radar';
import { computeTrends } from '@/lib/engine/trending';
import { getFeedStates } from '@/lib/feed-state';
import IntelFeed from '@/components/modules/intel-feed';

export const metadata = { title: 'Intelligence' };
// Discovery hits the network, so this is the throttle on how often that runs.
export const revalidate = 900;

export default async function IntelligencePage() {
  const [{ data: items, isSeed }, { data: deals }, ticker, settings, states] =
    await Promise.all([
      getFeedItems({ limit: 40 }),
      getDeals(),
      getTickerData(),
      getUserSettings(),
      getFeedStates(),
    ]);

  const vertical = getActiveVertical();

  /**
   * Discovery is best-effort and must never take the page down with it. It
   * fetches live feeds that can be slow, blocked or gone — a Intelligence page
   * that 500s because an outlet's RSS moved is a far worse outcome than one
   * missing its gap block for 15 minutes.
   */
  let gaps: CoverageGap[] = [];
  try {
    gaps = await runDiscovery(
      vertical,
      items.map((i) => ({ title: i.title, publishedAt: i.published_at })),
      settings?.source_prefs?.enabled ?? [],
    );
  } catch (err) {
    console.warn('[intelligence] discovery failed:', err);
  }

  const peers = findPeerCandidates(gaps, deals);

  // Trends rank on the reader's own vocabulary first — pipeline companies and
  // their utilities — then on domain terms.
  const entities = [
    ...deals.map((d) => d.company),
    ...deals.map((d) => d.utility).filter((u): u is string => Boolean(u)),
  ];
  const trends = computeTrends(items, entities);

  return (
    <IntelFeed
      items={items}
      deals={deals}
      ticker={ticker}
      isSeed={isSeed}
      gaps={gaps}
      peers={peers}
      trends={trends}
      initialStates={states}
    />
  );
}
