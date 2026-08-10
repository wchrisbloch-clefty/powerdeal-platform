import { notFound } from 'next/navigation';
import {
  getDeal, getSignalsForDeal, getMarketWatchForDeal, getStageTransitions,
} from '@/lib/data';
import DealDetail from '@/components/modules/deal-detail';
import { getMapPlan } from '@/lib/map/store';
import { winLossForDeal } from '@/lib/win-loss';

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

  const [signals, marketWatch, transitions, mapPlan, winLoss] = await Promise.all([
    getSignalsForDeal(id),
    getMarketWatchForDeal(id),
    getStageTransitions(id),
    // Null is normal — the panel falls back to the starter sequence, which is
    // what makes solo mode useful on a deal nobody has planned yet.
    getMapPlan(id).catch(() => null),
    // Empty is normal — the table has never been written to before this pass.
    winLossForDeal(id).catch(() => []),
  ]);

  return (
    <DealDetail
      deal={deal}
      signals={signals}
      marketWatch={marketWatch}
      transitions={transitions}
      isSeed={isSeed}
      mapPlan={mapPlan}
      winLoss={winLoss}
    />
  );
}
