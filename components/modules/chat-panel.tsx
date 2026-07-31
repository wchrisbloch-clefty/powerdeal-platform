'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Square, X } from 'lucide-react';
import { clearAskContext, getAskContext, groundingFor, type AskContext } from '@/lib/ask-context';
import type { Deal } from '@/lib/types';
import { useAiStream } from '@/lib/use-ai-stream';
import type { TaskKind } from '@/lib/engine/model-routing';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import AiOutput from '@/components/ui/ai-output';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_ACTIONS: { task: TaskKind; label: string; needsDeal: boolean }[] = [
  { task: 'brief', label: '📋 Brief', needsDeal: true },
  { task: 'plan', label: '📊 Plan', needsDeal: true },
  { task: 'map-gen', label: '🗺️ Build MAP', needsDeal: true },
  { task: 'outreach', label: '📨 Outreach plan', needsDeal: true },
  { task: 'intel', label: '🔍 Strategic read', needsDeal: true },
  { task: 'campaign', label: '📡 Campaign mode', needsDeal: false },
];

export default function ChatPanel({
  deals,
  brainReady,
  brainError,
  aiAvailable,
  about,
  initialDealId,
}: {
  deals: Deal[];
  brainReady: boolean;
  brainError: string | null;
  aiAvailable: boolean;
  /** Entity this conversation arrived pre-grounded on, from an entity page. */
  about?: string;
  initialDealId?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  /**
   * A pre-grounded arrival fills the composer rather than sending it. The
   * question is a starting point the reader will usually want to sharpen, and
   * firing a model call off a navigation spends tokens on a question nobody
   * actually asked.
   */
  const [input, setInput] = useState(() =>
    about
      ? `What should I know about ${about} right now, and what does it mean for my accounts?`
      : '',
  );
  const [dealId, setDealId] = useState<string>(initialDealId ?? '');

  /**
   * The item handed over from a feed card's "Ask". Rendered as a dismissable
   * chip so the reader can see WHY the answer is shaped the way it is — an
   * invisible context block that silently steers every reply is worse than no
   * grounding at all.
   */
  const [askCtx, setAskCtx] = useState<AskContext | null>(null);

  useEffect(() => {
    const ctx = getAskContext();
    if (!ctx) return;
    setAskCtx(ctx);
    // If the item mapped to a deal, the account selector follows it.
    if (ctx.dealId) setDealId(ctx.dealId);
  }, []);

  function dropContext() {
    setAskCtx(null);
    clearAskContext();
  }
  const ai = useAiStream();
  const endRef = useRef<HTMLDivElement>(null);

  const selected = deals.find((d) => d.id === dealId) ?? null;
  const blocked = !brainReady || !aiAvailable;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, ai.text]);

  async function send(message: string, task: TaskKind = 'ask') {
    if (!message.trim() && task === 'ask') return;

    const userTurn: Turn = {
      role: 'user',
      content: message || `[${task}]`,
    };
    const history = turns.slice(-12);
    setTurns((t) => [...t, userTurn]);
    setInput('');

    // The grounding rides on the FIRST message only. Repeating it on every turn
    // would re-anchor the model on the article long after the conversation has
    // moved past it.
    const grounded =
      askCtx && turns.length === 0 ? `${groundingFor(askCtx)}\n\nQUESTION: ${message}` : message;

    const text = await ai.run({
      task,
      dealId: dealId || undefined,
      content: grounded,
      history,
    });

    if (text) setTurns((t) => [...t, { role: 'assistant', content: text }]);
  }

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-6rem)] flex-col gap-4 md:h-[calc(100vh-var(--topbar-height)-4rem)] md:flex-row">
      {/* ── Quick actions ── */}
      <aside className="shrink-0 space-y-2 md:w-52">
        <p className="eyebrow">Quick actions</p>
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {QUICK_ACTIONS.map((a) => (
            <Button
              key={a.task}
              variant="secondary"
              size="sm"
              disabled={blocked || ai.streaming || (a.needsDeal && !selected)}
              title={a.needsDeal && !selected ? 'Select a deal first' : undefined}
              onClick={() => send('', a.task)}
              className="w-full shrink-0 justify-start md:w-full"
            >
              {a.label}
            </Button>
          ))}
        </div>

        <div className="pt-2">
          <label className="eyebrow mb-1 block">Context</label>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="h-tap xl:h-8 w-full rounded-md border border-rule bg-bg-raised px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
          >
            <option value="">No deal selected</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deal_id} · {d.company}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="mt-1.5 text-2xs text-text-faint">
              The full deal record and its logged signals are injected on every
              message — you never have to re-explain the account.
            </p>
          ) : null}
        </div>
      </aside>

      {/* ── Conversation ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The grounding, made visible. A reader should never wonder why an
            answer keeps circling one article. */}
        {askCtx && (
          <div className="mb-3 flex items-start gap-2 rounded-card border border-accent-border bg-accent-bg px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="eyebrow mb-0.5">
                Grounded on this item
                {askCtx.dealLabel ? ` · ${askCtx.dealLabel}` : ''}
              </p>
              <p className="truncate text-sm text-text">{askCtx.title}</p>
              {askCtx.source ? (
                <p className="truncate text-2xs text-text-dim">{askCtx.source}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={dropContext}
              aria-label="Remove item context"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-dim hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {blocked && (
            <div className="rounded-card border border-rule bg-bg-raised p-4">
              <p className="font-display text-base text-text">
                {!aiAvailable ? 'AI key required' : 'PowerDeal brain not synced'}
              </p>
              <p className="mt-1.5 text-sm text-text-dim">
                {!aiAvailable
                  ? 'Set ANTHROPIC_API_KEY to enable chat. Domain reasoning is never routed to a cheaper model, so there is no fallback here by design.'
                  : (brainError ??
                    'The system prompt file is still a placeholder. Paste the PowerDeal v3.1.8 prompt into prompts/ and commit.')}
              </p>
            </div>
          )}

          {turns.length === 0 && !blocked && (
            <div className="rounded-card border border-dashed border-rule px-4 py-12 text-center">
              <p className="text-sm text-text-dim">
                Ask anything, or pick a quick action. The PowerDeal methodology and your
                live pipeline are already loaded.
              </p>
            </div>
          )}

          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                turn.role === 'user' &&
                  'ml-auto max-w-[85%] rounded-card border border-rule bg-bg-raised px-3.5 py-2.5',
              )}
            >
              {turn.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm text-text">{turn.content}</p>
              ) : (
                <AiOutput text={turn.content} streaming={false} />
              )}
            </div>
          ))}

          {(ai.streaming || ai.error) && (
            <AiOutput
              text={ai.text}
              streaming={ai.streaming}
              error={ai.error}
              provider={ai.provider}
              model={ai.model}
              onStop={ai.stop}
            />
          )}

          <div ref={endRef} />
        </div>

        {/* ── Composer ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex shrink-0 gap-2"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter newlines — the convention people expect.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={blocked}
            placeholder={
              selected
                ? `Ask about ${selected.company}…`
                : 'Ask anything about the pipeline…'
            }
            className="flex-1 resize-none rounded-md border border-rule bg-bg-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none disabled:opacity-50"
          />
          {ai.streaming ? (
            <Button type="button" variant="secondary" onClick={ai.stop}>
              <Square size={14} />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={blocked || !input.trim()}
            >
              <Send size={14} />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
