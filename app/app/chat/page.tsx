import { getDeals } from '@/lib/data';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import { envStatus } from '@/lib/env-check';
import ChatPanel from '@/components/modules/chat-panel';
import PageHeader from '@/components/chrome/page-header';

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
    /**
     * ⚠️ CHAT HAD NO PAGE HEADER AT ALL — the only surface without one, and it
     * was not a decision. The panel owned `100vh` directly, so there was
     * nowhere to put a header without the two competing for the viewport.
     *
     * The height moves up here and the panel fills what it is given, which is
     * where a page-level constraint belongs anyway.
     */
    <div className="flex h-[calc(100vh-var(--topbar-height)-6rem)] flex-col gap-rhythm-block md:h-[calc(100vh-var(--topbar-height)-4rem)]">
      <PageHeader eyebrow="Assistant" title="Chat" />
      <div className="min-h-0 flex-1">
        <ChatPanel
          deals={deals}
          brainReady={BRAIN_READY}
          brainError={BRAIN_ERROR}
          aiAvailable={envStatus().anthropic}
          about={params.about}
          initialDealId={params.deal}
        />
      </div>
    </div>
  );
}
