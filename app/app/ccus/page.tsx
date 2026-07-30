import { getCcusEvents, getDeals } from '@/lib/data';
import CcusTracker from '@/components/modules/ccus-tracker';

export const metadata = { title: 'CCUS' };

export default async function CcusPage() {
  const [{ data: events }, { data: deals }] = await Promise.all([
    getCcusEvents(),
    getDeals(),
  ]);

  return <CcusTracker events={events} deals={deals} />;
}
