import { getDeals } from '@/lib/data';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import { envStatus } from '@/lib/env-check';
import ChatPanel from '@/components/modules/chat-panel';

export const metadata = { title: 'Chat' };

export default async function ChatPage() {
  const { data: deals } = await getDeals();

  return (
    <ChatPanel
      deals={deals}
      brainReady={BRAIN_READY}
      brainError={BRAIN_ERROR}
      aiAvailable={envStatus().anthropic}
    />
  );
}
