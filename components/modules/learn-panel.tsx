'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2, RotateCcw } from 'lucide-react';
import { MODES, detectMode, explainDetection, type LearnMode } from '@/lib/learn/modes';
import { sessionLabel, type LearnSession } from '@/lib/learn/session';
import { relativeTime, cn } from '@/lib/utils';

/**
 * LEARN — one box, five modes, and no score anywhere.
 *
 * There is no mode picker. The box reads the question. A rep with ninety
 * seconds between meetings does not want to classify their own question before
 * they can ask it, and making them choose a tab first is the friction that
 * stops the tab being opened at all.
 *
 * THE READ IS SHOWN AND IS ONE CLICK TO OVERRIDE. "Reading this as Explain —
 * matched 'what is'" sits under the box with the alternatives beside it. It
 * never asks before answering: the answer arrives in the mode that led, and
 * the reader redirects after seeing it rather than before writing it.
 *
 * ══ NO SCORING, ANYWHERE, EVER ══
 *
 * No percentage, no streak, no level, no mastery rating, no "topics you're
 * weak on". Not now and not later as a nice-to-have. The one thing this
 * surface has to survive is somebody opening it to work on the argument they
 * are worst at, and a number on the screen is enough to stop that.
 *
 * ══ A FAILED SAVE NEVER TAKES THE ANSWER WITH IT ══
 *
 * The answer streams whether or not the session persists. When the write
 * fails, the panel says "answered, not saved" beside it — the true statement.
 * Blanking the answer because its bookkeeping failed would be the health
 * surface's own bug, rebuilt in a new place.
 */

interface SessionList {
  sessions: LearnSession[];
  error: string | null;
  available: boolean;
}

interface Meta {
  sessionId?: string;
  mode?: LearnMode;
  writeError?: string | null;
}

export default function LearnPanel() {
  const [input, setInput] = useState('');
  const [override, setOverride] = useState<LearnMode | null>(null);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [list, setList] = useState<SessionList | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  const detection = detectMode(input);
  const activeMode = override ?? detection.mode;

  async function loadList() {
    try {
      const res = await fetch('/api/learn');
      setList((await res.json()) as SessionList);
      setListFailed(false);
    } catch {
      // Not reaching the route is not the same as the route finding nothing.
      setList(null);
      setListFailed(true);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function ask(continuing = false) {
    const text = input.trim();
    if (!text || streaming) return;

    setStreaming(true);
    setError(null);
    setWriteError(null);
    if (!continuing) setAnswer('');

    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          mode: activeMode,
          sessionId: continuing ? sessionId : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `The request failed (${res.status}).`);
        setStreaming(false);
        return;
      }

      setInput('');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = continuing ? `${answer}\n\n---\n\n` : '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload) as {
              type: string;
              text?: string;
              message?: string;
            };
            if (chunk.type === 'text' && chunk.text) {
              acc += chunk.text;
              setAnswer(acc);
            }
            if (chunk.type === 'meta' && chunk.message) {
              try {
                const meta = JSON.parse(chunk.message) as Meta;
                if (meta.sessionId) setSessionId(meta.sessionId);
                // Reported beside the answer, never instead of it.
                if (meta.writeError) setWriteError(meta.writeError);
              } catch {
                // A meta frame that is not JSON is the provider's own meta
                // frame. Not an error; nothing to read from it here.
              }
            }
            if (chunk.type === 'error' && chunk.message) setError(chunk.message);
          } catch {
            // Partial frame — skip rather than kill the stream.
          }
        }
      }
      void loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
      answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function resume(session: LearnSession) {
    setSessionId(session.id);
    setOverride(session.mode);
    setAnswer(
      session.turns
        .map((t) => (t.role === 'user' ? `**${t.text}**` : t.text))
        .join('\n\n'),
    );
    setError(null);
    setWriteError(null);
  }

  async function drop(id: string) {
    await fetch(`/api/learn?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (sessionId === id) {
      setSessionId(null);
      setAnswer('');
    }
    void loadList();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 space-y-3">
        {/* ── The one box ── */}
        <div className="rounded-card border border-rule bg-bg-raised p-3">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // A new question re-reads the mode. An override belongs to the
              // question it was chosen for, not to the box.
              setOverride(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void ask(Boolean(sessionId));
            }}
            rows={3}
            placeholder="Ask anything — explain it, quiz me on it, roleplay it, compare it, or pick up where I left off."
            className="w-full resize-none bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule-faint pt-2">
            {/* THE READ, and one click to change it. Never a question asked
                before answering. */}
            <p className="text-2xs text-text-faint">
              {input.trim()
                ? override
                  ? `Using ${MODES.find((m) => m.mode === override)!.label} — you chose it.`
                  : explainDetection(detection)
                : 'Five modes, one box. It reads the question.'}
            </p>

            {input.trim() ? (
              <div className="flex flex-wrap gap-1">
                {MODES.filter((m) => m.mode !== activeMode).map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setOverride(m.mode)}
                    title={m.blurb}
                    className="rounded-sm border border-rule px-1.5 py-0.5 text-2xs text-text-faint hover:text-text"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void ask(Boolean(sessionId))}
              disabled={!input.trim() || streaming}
              className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-2xs text-text-dim disabled:opacity-40 hover:text-text"
            >
              {streaming ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <Send size={12} aria-hidden />
              )}
              {sessionId ? 'Continue' : 'Ask'}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/* ANSWERED, NOT SAVED. The answer stays; the truth about it is beside
            it rather than in place of it. */}
        {writeError ? (
          <p className="rounded-card border border-warning/40 bg-warning/5 px-3.5 py-2 text-2xs text-text-dim">
            Answered, <span className="text-text">not saved</span> — this session will not be
            in the resume list. {writeError}
          </p>
        ) : null}

        {answer ? (
          <div
            ref={answerRef}
            className="whitespace-pre-wrap rounded-card border border-rule bg-bg-raised px-3.5 py-3 text-sm text-text-dim"
          >
            {answer}
          </div>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {MODES.map((m) => (
              <li
                key={m.mode}
                className="rounded-card border border-rule bg-bg-raised px-3 py-2"
              >
                <p className="text-2xs text-text">{m.label}</p>
                <p className="mt-0.5 text-2xs text-text-faint">{m.blurb}</p>
                <button
                  type="button"
                  onClick={() => {
                    setInput(m.example);
                    setOverride(null);
                  }}
                  className="mt-1 text-2xs text-text-faint underline decoration-rule underline-offset-2 hover:text-text"
                >
                  {m.example}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Resume. The only thing persistence is for. ── */}
      <aside className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Pick back up</p>
          {sessionId ? (
            <button
              type="button"
              onClick={() => {
                setSessionId(null);
                setAnswer('');
                setOverride(null);
              }}
              className="inline-flex items-center gap-1 text-2xs text-text-faint hover:text-text"
            >
              <RotateCcw size={11} aria-hidden /> New
            </button>
          ) : null}
        </div>

        {listFailed || !list ? (
          <p className="rounded-card border border-danger/40 bg-danger/5 px-2.5 py-1.5 text-2xs text-danger">
            Could not reach the sessions endpoint. Not the same as having none.
          </p>
        ) : list.error ? (
          /* A failed read is NOT an empty list. Rendering "no sessions yet"
             here would be the bug this build keeps finding. */
          <p className="rounded-card border border-danger/40 bg-danger/5 px-2.5 py-1.5 text-2xs text-danger">
            Could not read your sessions — this is not the same as having none.{' '}
            {list.error}
          </p>
        ) : list.sessions.length === 0 ? (
          <p className="text-2xs text-text-faint">
            The read succeeded and there is nothing here yet. Sessions appear once
            one has an answer in it.
          </p>
        ) : (
          <ul className="space-y-1">
            {list.sessions.map((s) => (
              <li key={s.id} className="group flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => void resume(s)}
                  className={cn(
                    'min-w-0 flex-1 rounded-sm px-1.5 py-1 text-left text-2xs hover:bg-bg-overlay',
                    sessionId === s.id ? 'bg-bg-overlay text-text' : 'text-text-dim',
                  )}
                >
                  <span className="block truncate">{sessionLabel(s)}</span>
                  <span className="block text-text-faint">
                    {s.mode} · {relativeTime(s.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void drop(s.id)}
                  aria-label="Delete session"
                  className="mt-1 shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                >
                  <Trash2 size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
