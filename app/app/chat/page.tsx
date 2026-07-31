import { getDeals } from '@/lib/data';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import { envStatus } from '@/lib/env-check';
import ChatPanel from '@/components/modules/chat-panel';

export const metadata = { title: 'Chat' };

/**
 * `?about=` pre-grounds the conversation on an entity, and `?deal=` selects the
 * account it touches — that is the landing point for "Ask about SDG&E" on an
 * entity page.
 *
 * Read on the server and passed down rather than pulled from useSearchParams in
 * the panel, which would need its own Suspense boundary to keep this page
 * statically renderable.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ about?: string; deal?: string }>;
}) {
  const [{ data: deals }, params] = await Promise.all([getDeals(), searchParams]);

  return (
    <ChatPanel
      deals={deals}
      brainReady={BRAIN_READY}
      brainError={BRAIN_ERROR}
      aiAvailable={envStatus().anthropic}
      about={params.about}
      initialDealId={params.deal}
    />
  );
}
