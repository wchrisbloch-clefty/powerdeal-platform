import { getFeedItems, getDeals } from '@/lib/data';
import { getTickerData } from '@/lib/ticker-data';
import IntelFeed from '@/components/modules/intel-feed';

export const metadata = { title: 'Intelligence' };
export const revalidate = 900; // ticker + feed are cheap to re-render quarter-hourly

export default async function IntelligencePage() {
  const [{ data: items, isSeed }, { data: deals }, ticker] = await Promise.all([
    getFeedItems({ limit: 40 }),
    getDeals(),
    getTickerData(),
  ]);

  return <IntelFeed items={items} deals={deals} ticker={ticker} isSeed={isSeed} />;
}
