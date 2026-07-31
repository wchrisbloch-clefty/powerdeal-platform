import {
  getCcusEvents,
  getDeals,
  getMarketWatch,
  getRecentSignals,
  getUserSettings,
} from '@/lib/data';
import { getTickerData } from '@/lib/ticker-data';
import { getActiveVertical } from '@/lib/active-vertical';
import { getLiveFeed } from '@/lib/engine/live-feed';
import { runDiscovery, type CoverageGap } from '@/lib/engine/discover';
import { findPeerCandidates } from '@/lib/engine/peer-radar';
import { computeTrends } from '@/lib/engine/trending';
import { fetchTopicVideos, youtubeConfigured } from '@/lib/engine/youtube';
import { fetchRatesWithTrend, eiaConfigured } from '@/lib/geo/eia-api';
import { getFeedStates } from '@/lib/feed-state';
import { getDismissals } from '@/lib/item-extras';
import { getResearchRuns } from '@/lib/research';
import { getFeedItemsByKeys } from '@/lib/data';
import { buildBenchmarks } from '@/lib/pricing';
import { isAdminConfigured } from '@/lib/supabase/admin';
import IntelTabs, { DEFAULT_TAB, isIntelTab, type IntelTab } from '@/components/modules/intel-tabs';
import IntelFeed from '@/components/modules/intel-feed';
import MarketWatchPanel from '@/components/modules/market-watch-panel';
import SignalsPanel from '@/components/modules/signals-panel';
import TrendingPanel from '@/components/modules/trending-panel';
import WeeklyRecapPanel from '@/components/modules/weekly-recap';
import SourcesPanel from '@/components/modules/sources-panel';
import VideoPanel from '@/components/modules/video-panel';
import CcusTracker from '@/components/modules/ccus-tracker';
import PricingPanel from '@/components/modules/pricing-panel';
import ResearchPanel from '@/components/modules/research-panel';
import { EmptyState } from '@/components/ui/card';

export const metadata = { title: 'Intelligence' };
export const dynamic = 'force-dynamic';

/**
 * INTELLIGENCE — the tabbed hub.
 *
 * Social, CCUS and Pricing were separate nav destinations, which made the left
 * nav a list of views rather than places. They were all answering "what is the
 * market doing", so they are tabs here, and the nav is destinations only.
 *
 * Each tab loads ONLY its own data. That is the whole reason tabs are links
 * with a `?tab=` param rather than client state: rendering the Feed should not
 * cost a CCUS query, an EIA rate fetch and a scan of the signal log.
 */
export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: raw } = await searchParams;
  const tab: IntelTab = isIntelTab(raw) ? raw : DEFAULT_TAB;

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Market Watch</p>
        <h1 className="mt-1 font-display text-2xl text-text">Intelligence</h1>
      </header>

      <IntelTabs active={tab} />

      <TabContent tab={tab} />
    </div>
  );
}

async function TabContent({ tab }: { tab: IntelTab }) {
  switch (tab) {
    case 'feed':
      return <FeedTab />;
    case 'market-watch':
      return <MarketWatchTab />;
    case 'trending':
      return <TrendingTab />;
    case 'signals':
      return <SignalsTab />;
    case 'ccus':
      return <CcusTab />;
    case 'pricing':
      return <PricingTab />;
    case 'sources':
      return <SourcesTab />;
    case 'video':
      return <VideoTab />;
    case 'research':
      return <ResearchTab />;
  }
}

// ── Feed ────────────────────────────────────────────────────────

async function FeedTab() {
  const [{ data: deals }, ticker, settings, states, dismissed] = await Promise.all([
    getDeals(),
    getTickerData(),
    getUserSettings(),
    getFeedStates(),
    getDismissals(),
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
      peers={findPeerCandidates(gaps, deals)}
      trends={computeTrends(feed.items, deals, 12)}
      initialStates={states}
      initialDismissed={dismissed}
    />
  );
}

// ── Market Watch ────────────────────────────────────────────────

async function MarketWatchTab() {
  const [entries, { data: deals }] = await Promise.all([getMarketWatch(60), getDeals()]);
  return <MarketWatchPanel entries={entries} deals={deals} />;
}

// ── Trending ────────────────────────────────────────────────────

async function TrendingTab() {
  const { data: deals } = await getDeals();
  const feed = await getLiveFeed(deals);
  const trends = computeTrends(feed.items, deals, 24);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <p className="mb-3 text-sm text-text-dim">
          Ranked from what is in the feed right now — utilities, regulators,
          pipeline companies and watchlist topics, each carrying the strongest
          tier that reported it. Every row opens that entity&rsquo;s page.
        </p>
        {trends.length === 0 ? (
          <EmptyState
            title="Nothing trending yet"
            body="Trending needs items in the feed. If the Feed tab is showing seed content, the sources were unreachable."
          />
        ) : (
          <TrendingPanel trends={trends} />
        )}
      </div>
      <WeeklyRecapPanel className="min-w-0" />
    </div>
  );
}

// ── Signals ─────────────────────────────────────────────────────

async function SignalsTab() {
  const [signals, { data: deals }] = await Promise.all([getRecentSignals(200), getDeals()]);
  return <SignalsPanel signals={signals} deals={deals} />;
}

// ── CCUS ────────────────────────────────────────────────────────

async function CcusTab() {
  const [{ data: events }, { data: deals }] = await Promise.all([getCcusEvents(), getDeals()]);
  return <CcusTracker events={events} deals={deals} />;
}

// ── Pricing ─────────────────────────────────────────────────────

async function PricingTab() {
  const configured = eiaConfigured();
  const [{ data: deals }, rates] = await Promise.all([
    getDeals(),
    configured ? fetchRatesWithTrend().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <PricingPanel
      rates={rates}
      deals={deals}
      benchmarks={buildBenchmarks(deals, rates)}
      configured={configured}
    />
  );
}

// ── Sources ─────────────────────────────────────────────────────

async function SourcesTab() {
  const settings = await getUserSettings();
  return (
    <SourcesPanel
      vertical={getActiveVertical()}
      settings={settings}
      canPersist={isAdminConfigured()}
    />
  );
}

// ── Video ───────────────────────────────────────────────────────

async function VideoTab() {
  const configured = youtubeConfigured();
  const settings = await getUserSettings();
  const topics = settings?.watchlist?.topics ?? [
    'SOFC fuel cell industrial',
    'utility rate increase industrial',
    'Class VI carbon sequestration',
  ];

  const videos = configured ? await fetchTopicVideos(topics, 2).catch(() => []) : [];
  return <VideoPanel videos={videos} configured={configured} />;
}

// ── Research ────────────────────────────────────────────────────

async function ResearchTab() {
  const [runs, { data: deals }] = await Promise.all([getResearchRuns(), getDeals()]);
  const keys = [...new Set(runs.flatMap((r) => r.itemKeys))];
  const itemsByKey = await getFeedItemsByKeys(keys);
  return <ResearchPanel runs={runs} itemsByKey={itemsByKey} deals={deals} />;
}
