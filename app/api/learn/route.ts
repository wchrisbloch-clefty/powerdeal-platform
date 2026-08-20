import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { routeStream, toSseResponse, canRun } from '@/lib/engine/model-routing';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';
import { knowledgeBlocksForSkill } from '@/lib/skills/knowledge';
import { detectMode, instructionFor, type LearnMode } from '@/lib/learn/modes';
import { blockFormatInstruction } from '@/lib/learn/blocks';
import { visualInstruction } from '@/lib/learn/visual/prompt';
import { newSession, recallContext, resumable } from '@/lib/learn/session';
import { listSessions, getSession, saveSession, appendAndSave, deleteSession } from '@/lib/learn/store';
import { POWERDEAL_USER_ID } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * The Learn tab's one endpoint.
 *
 *   GET    — the resume list, plus whether the store is readable at all.
 *   POST   — ask something. Streams the answer, persists the session.
 *   DELETE — drop a session.
 *
 * ══ NOTHING GATES ══
 *
 * A failed session write does not stop the answer. The reader asked a
 * question and the model answered; losing the ability to resume that session
 * later is not a reason to withhold what is in front of them. The write result
 * rides in the SSE `meta` frame so the UI can say "answered, not saved" — which
 * is the true statement — rather than either lying or blanking the answer.
 *
 * ══ THE ONE HARD REQUIREMENT ══
 *
 * `learn` is a DOMAIN task: Claude or nothing. Teaching the doctrine back to
 * the rep is the surface where output quality most obviously IS the product,
 * and a cheaper model would teach a subtly wrong version of it with no way for
 * the reader to tell. With no ANTHROPIC_API_KEY this returns a 501 that says
 * exactly that, rather than degrading.
 */

interface AskBody {
  input?: string;
  /** Continuing an existing session, rather than opening one. */
  sessionId?: string;
  /** The reader overrode the detected mode by clicking an alternative. */
  mode?: LearnMode;
}

export async function GET() {
  const { sessions, error } = await listSessions();
  return NextResponse.json({
    // Resumable only: a session with no assistant turn reopens to nothing.
    sessions: resumable(sessions),
    // `error` is not the same as an empty list, and the UI renders the
    // difference. See lib/seed-state.ts.
    error,
    available: canRun('learn'),
  });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id.' }, { status: 400 });
  const result = await deleteSession(id);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: 'Unreadable body.' }, { status: 400 });
  }

  const input = (body.input ?? '').trim();
  if (!input) return NextResponse.json({ error: 'Nothing to ask.' }, { status: 400 });

  if (!canRun('learn')) {
    // A 501 with a reason, not a degraded answer.
    return NextResponse.json(
      {
        error:
          'ANTHROPIC_API_KEY is not set. Learn is a domain-reasoning surface and is never routed to a cheaper model — a subtly wrong version of the doctrine, taught confidently, is worse than no Learn tab.',
      },
      { status: 501 },
    );
  }

  // The reader's explicit choice WINS over detection. Clicking "Drill" after
  // seeing the box read it as Explain must not be re-argued by the detector.
  const detection = detectMode(input);
  const mode: LearnMode = body.mode ?? detection.mode;

  const now = new Date().toISOString();
  let sessionId = body.sessionId ?? null;
  let writeError: string | null = null;

  if (sessionId) {
    const appended = await appendAndSave(sessionId, { role: 'user', text: input, at: now });
    if (!appended.ok) writeError = appended.error;
  } else {
    sessionId = randomUUID();
    const created = await saveSession(newSession(sessionId, mode, input, now, POWERDEAL_USER_ID));
    if (!created.ok) writeError = created.error;
  }

  // ── Build the prompt ──
  // `recall` is the only mode that needs history, and it is fetched only for
  // that mode. Loading every session on every question would put the reader's
  // whole learn history into a prompt about 4CP.
  let history = '';
  if (mode === 'recall') {
    const { sessions, error } = await listSessions();
    history = error
      ? `PREVIOUS SESSIONS: could not be read (${error}). Do not claim the reader has no history — say the history could not be loaded.`
      : recallContext(sessions);
  }

  // Continuing a session replays its turns so the model has the thread.
  let priorTurns = '';
  if (body.sessionId) {
    const { session } = await getSession(body.sessionId);
    if (session) {
      priorTurns = session.turns
        .slice(-12)
        .map((t) => `${t.role === 'user' ? 'READER' : 'YOU'}: ${t.text}`)
        .join('\n\n');
    }
  }

  /**
   * The reference shelf, with NO vertical.
   *
   * `lib/learn/` is structurally deal-free, so there is no deal and therefore
   * no vertical to select a playbook from. Learn loads no vertical playbook,
   * and the shelf says so — which is correct, and is exactly what the v3.1.12
   * rule prescribes: say absent rather than substitute. A rep learning
   * the four-lever diagnostic is not learning it about a refinery unless they
   * asked about one, and picking a vertical for them would teach the doctrine
   * through a lens nobody chose.
   */
  const shelf = knowledgeBlocksForSkill('discovery-call-prep');

  /**
   * ⚠️ THE FORMAT AND SCHEMA INSTRUCTIONS SIT INSIDE THE CACHED PREFIX, before
   * the mode instruction rather than after it. They are byte-identical on every
   * call; putting them after the mode block would give five cache entries that
   * differ only in a suffix they all share.
   *
   * Both are BUILT from the same constants the parser and validator enforce.
   * The instruction naming a fence tag the parser does not recognise produces
   * an answer full of raw JSON with nothing anywhere saying why.
   */
  const system = [
    POWERDEAL_IDENTITY,
    '',
    blockFormatInstruction(),
    '',
    visualInstruction(),
    '',
    instructionFor(mode),
    '',
    shelf,
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = [
    history,
    priorTurns ? `THE SESSION SO FAR:\n\n${priorTurns}` : '',
    `READER ASKS: ${input}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const stream = routeStream('learn', {
    system,
    user,
    /**
     * Raised from 2,000 when figures became possible. A visual is several
     * hundred tokens of JSON, and an answer truncated mid-fence renders as an
     * `arriving` placeholder that never resolves — the prose is fine and the
     * figure simply never lands, which reads as a bug in the renderer rather
     * than as a budget that ran out.
     */
    maxTokens: 3000,
    // Prompt caching is a prefix match and the shelf is identical across every
    // learn call, so the system block caches cleanly. The mode instruction sits
    // inside it and there are five of them — five cache entries, not one per
    // question.
    promptCache: true,
  });

  // Wrap the stream so the answer is persisted as it completes, and so the
  // session id and any write failure reach the client.
  return toSseResponse(
    (async function* () {
      yield {
        type: 'meta' as const,
        // Carried in the first frame so the UI has the id even if the stream
        // dies mid-answer — otherwise a failed generation orphans its session.
        message: JSON.stringify({
          sessionId,
          mode,
          detection,
          writeError,
        }),
      };

      let answer = '';
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) answer += chunk.text;
        yield chunk;
      }

      if (answer.trim() && sessionId) {
        const saved = await appendAndSave(sessionId, {
          role: 'assistant',
          text: answer,
          at: new Date().toISOString(),
        });
        if (!saved.ok) {
          // Reported, never thrown. The answer is already on screen; the
          // reader needs to know it will not be there tomorrow.
          yield {
            type: 'meta' as const,
            message: JSON.stringify({ writeError: saved.error }),
          };
        }
      }
    })(),
  );
}
