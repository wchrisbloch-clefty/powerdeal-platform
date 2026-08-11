import { notFound } from 'next/navigation';
import {
  getDeal, getSignalsForDeal, getMarketWatchForDeal, getStageTransitions,
} from '@/lib/data';
import DealDetail from '@/components/modules/deal-detail';
import { getMapPlan } from '@/lib/map/store';
import { winLossForDeal } from '@/lib/win-loss';
import { competitorsForDeal } from '@/lib/competitive';
import { resolveUtilityContext } from '@/lib/utility/store';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: deal } = await getDeal(id);
  return { title: deal ? `${deal.company} · ${deal.deal_id}` : 'Deal' };
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: deal, isSeed } = await getDeal(id);
  if (!deal) notFound();

  const [signals, marketWatch, transitions, mapPlan, winLoss, competitors] = await Promise.all([
    getSignalsForDeal(id),
    getMarketWatchForDeal(id),
    getStageTransitions(id),
    // Null is normal — the panel falls back to the starter sequence, which is
    // what makes solo mode useful on a deal nobody has planned yet.
    getMapPlan(id).catch(() => null),
    // Empty is normal — the table has never been written to before this pass.
    winLossForDeal(id).catch(() => []),
    // Empty is the ZERO-CLICK DEFAULT, not an absence: do-nothing and the grid
    // are on for a deal with no rows at all. Rows exist only where someone
    // contradicted the default or recorded detail.
    competitorsForDeal(id).catch(() => []),
  ]);

  // Resolved from the deal's FIELDS, not by a join from its id. The same call
  // an origination surface makes with a state and nothing else — which is what
  // keeps the utility layer reachable for a prospect with no deal row.
  const utility = await resolveUtilityContext({
    state: deal.state,
    siteUtility: deal.beachhead_utility,
    accountUtility: deal.utility,
  }).catch(() => null);

  return (
    <DealDetail
      deal={deal}
      signals={signals}
      marketWatch={marketWatch}
      transitions={transitions}
      isSeed={isSeed}
      mapPlan={mapPlan}
      winLoss={winLoss}
      competitors={competitors}
      utility={utility}
    />
  );
}
