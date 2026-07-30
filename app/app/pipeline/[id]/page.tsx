import { notFound } from 'next/navigation';
import {
  getDeal, getSignalsForDeal, getMarketWatchForDeal, getStageTransitions,
} from '@/lib/data';
import DealDetail from '@/components/modules/deal-detail';

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

  const [signals, marketWatch, transitions] = await Promise.all([
    getSignalsForDeal(id),
    getMarketWatchForDeal(id),
    getStageTransitions(id),
  ]);

  return (
    <DealDetail
      deal={deal}
      signals={signals}
      marketWatch={marketWatch}
      transitions={transitions}
      isSeed={isSeed}
    />
  );
}
