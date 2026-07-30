import { getDeals } from '@/lib/data';
import PipelineView from '@/components/modules/pipeline-view';

export const metadata = { title: 'Pipeline' };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ data: deals, isSeed }, params] = await Promise.all([
    getDeals(),
    searchParams,
  ]);

  return <PipelineView deals={deals} isSeed={isSeed} initialQuery={params.q ?? ''} />;
}
