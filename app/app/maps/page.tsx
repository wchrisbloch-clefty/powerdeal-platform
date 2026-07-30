import { getDeals } from '@/lib/data';
import { fetchRatesWithTrend, eiaConfigured } from '@/lib/geo/eia-api';
import { poweroutageConfigured } from '@/lib/geo/poweroutage';
import MapsPanel from '@/components/modules/maps-panel';

export const metadata = { title: 'Maps' };
export const revalidate = 3600;

export default async function MapsPage() {
  const [{ data: deals }, rates] = await Promise.all([
    getDeals(),
    eiaConfigured() ? fetchRatesWithTrend().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <MapsPanel
      deals={deals}
      rates={rates}
      outagesAvailable={poweroutageConfigured()}
    />
  );
}
