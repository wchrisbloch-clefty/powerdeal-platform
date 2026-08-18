import { getDeals } from '@/lib/data';
import PipelineView from '@/components/modules/pipeline-view';

export const metadata = { title: 'Pipeline' };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ data: deals, isSeed, readError }, params] = await Promise.all([
    getDeals(),
    searchParams,
  ]);

  /*
    ⚠️ readError WAS DISCARDED HERE, AND THIS IS THE SURFACE WHERE THAT COSTS
    MOST. SEED_DEALS holds 21 rows; the real book holds 21 rows, with the same
    company names. A refused key renders a full, plausible pipeline under a
    banner reading "Template pipeline… load your real Spine" — setup advice for
    a deployment that is already set up, over data that looks like the reader's.
    The Dashboard has said the true thing since getDeals was fixed; Pipeline
    kept saying the old one because it never asked for the third field.
  */
  return (
    <PipelineView
      deals={deals}
      isSeed={isSeed}
      readError={readError}
      initialQuery={params.q ?? ''}
    />
  );
}
