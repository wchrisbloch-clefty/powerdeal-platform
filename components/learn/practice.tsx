'use client';

import { useState } from 'react';
import { Loader2, Send, RotateCcw } from 'lucide-react';
import { GapPanel } from '@/components/ui/gap';
import FormattedText from '@/components/ui/formatted-text';
import Observations from '@/components/learn/observations';
import { parsePractice, type PracticeResponse } from '@/lib/learn/practice/response';
import type { ResolvedScenario } from '@/lib/learn/practice/scenarios-resolve';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * PRACTICE. YOU SAY IT; THE BUYER ANSWERS.
 * ═══════════════════════════════════════════════════════════════
 *
 * The response is not about your answer. It is what happens next. A vague
 * answer to a busy CFO gets a CFO who disengages, because that is what actually
 * happens in the room — you learn from where the conversation went, not from a
 * verdict about how you did.
 *
 * ══ WHAT IS DELIBERATELY ABSENT ══
 *
 * No timer. No word count. No minimum. No "attempt 3 of 5". No summary when you
 * leave, no "you practised four objections today", and no comparison with
 * anything you said before — not as a feature and not later as a nice-to-have.
 *
 * The exchange lands in the resume list labelled by the room it was in, exactly
 * like every other session, and that is the entire record.
 *
 * ══ THE GUARDRAIL IS RENDERED, NOT APPLIED ══
 *
 * ⚠️ WHEN THE BUYER GRADES YOU, THE PAGE SAYS SO — it does not quietly remove
 * the sentence. A scrubbed grade is indistinguishable from one that was never
 * written, which would make this surface look permanently compliant and hide
 * the only signal worth having: that the prompt is drifting. Same argument as
 * the read-failure banner and the deployed-behind row.
 */
export default function LearnPractice({ scenarios }: { scenarios: ResolvedScenario[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [raw, setRaw] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const open = scenarios.find((s) => s.scenario.id === openId) ?? null;
  const response: PracticeResponse | null = raw ? parsePractice(raw) : null;

  function enter(id: string) {
    setOpenId(id);
    setSaid('');
    setRaw('');
    setError(null);
    setSessionId(null);
  }

  async function send() {
    const text = said.trim();
    if (!text || streaming || !open) return;
    setStreaming(true);
    setError(null);

    try {
      const res = await fetch('/api/learn/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: open.scenario.id,
          said: text,
          sessionId: sessionId ?? undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? `The request failed (${res.status}).`);
        setStreaming(false);
        return;
      }

      setSaid('');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as { type: string; text?: string; message?: string };
            if (chunk.type === 'text' && chunk.text) {
              acc += chunk.text;
              setRaw(acc);
            }
            if (chunk.type === 'meta' && chunk.message) {
              try {
                const meta = JSON.parse(chunk.message) as { sessionId?: string };
                if (meta.sessionId) setSessionId(meta.sessionId);
              } catch {
                // The provider's own meta frame. Nothing to read here.
              }
            }
            if (chunk.type === 'error' && chunk.message) setError(chunk.message);
          } catch {
            // Partial frame.
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="space-y-rhythm-block">
      <p className="max-w-measure text-sm text-text-dim">
        Say it the way you would say it in the room. What comes back is what the buyer
        says next — nothing here tells you how you did.
      </p>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {scenarios.map(({ scenario, available, reason }) => (
          <li key={scenario.id}>
            <button
              type="button"
              onClick={() => enter(scenario.id)}
              /* ⚠️ NOT DISABLED WHEN UNAVAILABLE. Nothing on this surface
                 blocks; the panel below says why it cannot run, which is more
                 use than a control that does nothing and explains nothing. */
              className={cn(
                'flex min-h-tap w-full flex-col items-start rounded-card border px-3 py-2 text-left',
                openId === scenario.id
                  ? 'border-accent-border bg-accent-bg'
                  : 'border-rule bg-bg-raised hover:border-gap-rule',
              )}
            >
              <span className="text-2xs text-text">{scenario.who}</span>
              <span className="mt-0.5 max-w-measure text-2xs text-text-faint">
                {available ? scenario.setting : `Unavailable — ${reason ?? ''}`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        !open.available ? (
          <GapPanel
            kind="blocked"
            subject="this scenario"
            reason={`Its buyer reasons from ${open.scenario.source}, which is not available. ${open.reason ?? ''} Running it anyway would improvise a buyer, and a plausible wrong buyer is worse practice than none.`}
          />
        ) : (
          <div className="space-y-rhythm-block rounded-card border border-rule bg-bg-raised p-3.5">
            {/* What they said. The thing being answered. */}
            <blockquote className="border-l-2 border-gap-rule pl-3">
              <p className="eyebrow">{open.scenario.who}</p>
              <p className="prose mt-1">{open.scenario.opener}</p>
            </blockquote>

            {response ? <Exchange response={response} streaming={streaming} /> : null}

            {error ? (
              <p className="rounded-card border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="rounded-card border border-rule bg-bg p-2.5">
              <textarea
                value={said}
                onChange={(e) => setSaid(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send();
                }}
                rows={3}
                /* No timer, no counter, no minimum. */
                placeholder="Say it the way you would say it."
                className="w-full resize-none bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-2 border-t border-rule-faint pt-2">
                {sessionId ? (
                  <button
                    type="button"
                    onClick={() => enter(open.scenario.id)}
                    className="inline-flex min-h-tap items-center gap-1 text-2xs text-text-faint hover:text-text lg:min-h-0"
                  >
                    <RotateCcw size={11} aria-hidden /> Start this room again
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!said.trim() || streaming}
                  className="ml-auto inline-flex min-h-tap items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-2xs text-text-dim disabled:opacity-40 hover:text-text lg:min-h-0"
                >
                  {streaming ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Send size={12} aria-hidden />
                  )}
                  Say it
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

function Exchange({
  response,
  streaming,
}: {
  response: PracticeResponse;
  streaming: boolean;
}) {
  return (
    <div className="space-y-rhythm-block">
      <FormattedText text={response.reply} scale="reading" />

      {response.pending ? (
        <p role="status" className="text-2xs text-text-faint">
          Still writing.
        </p>
      ) : null}

      {response.malformed ? (
        <p className="rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-2xs text-text-dim">
          {response.malformed}
        </p>
      ) : null}

      {/* ⚠️ NOT RENDERED WHILE THE TAIL IS STILL ARRIVING. "No observations came
          back" and "they have not finished being written" are different states,
          and the shared component says the first one out loud. */}
      {response.pending || streaming ? null : (
        <Observations
          tookAway={response.tookAway}
          stillOpen={response.stillOpen}
          findings={response.findings}
        />
      )}
    </div>
  );
}
