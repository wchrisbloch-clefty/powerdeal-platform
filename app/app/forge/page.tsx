import { getDeals } from '@/lib/data';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import { envStatus } from '@/lib/env-check';
import ForgePanel from '@/components/modules/forge-panel';

export const metadata = { title: 'Forge' };

export default async function ForgePage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const [{ data: deals }, params] = await Promise.all([getDeals(), searchParams]);

  return (
    <ForgePanel
      deals={deals}
      brainReady={BRAIN_READY}
      brainError={BRAIN_ERROR}
      aiAvailable={envStatus().anthropic}
      initialDealId={params.deal}
    />
  );
}
