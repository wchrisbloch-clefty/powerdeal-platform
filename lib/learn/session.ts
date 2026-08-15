import type { LearnMode } from './modes';

/**
 * ═══════════════════════════════════════════════════════════════
 * LEARN SESSIONS — RESUME-ONLY PERSISTENCE.
 * ═══════════════════════════════════════════════════════════════
 *
 * A session is stored for exactly one reason: so it can be picked back up.
 * Nothing else is derived from the record and nothing else may be.
 *
 * WHAT IS STORED: the mode, the opening question, the turns, when it was last
 * touched. That is the whole shape, and it is the whole shape on purpose.
 *
 * WHAT IS NOT STORED, EVER: a score, a percentage correct, a streak, a level,
 * a mastery rating, a proficiency metric, a confidence value, a topic graph, a
 * "topics you're weak on" list. Not now and not later as a nice-to-have.
 *
 * The reason is not squeamishness about measurement. It is that a scored
 * practice surface stops being a practice surface: people practise what they
 * score well on. The one thing this tab has to survive is somebody opening it
 * to work on the argument they are worst at, and a number on the screen is
 * enough to stop that. `LearnSession` therefore has no numeric field that
 * could hold one, which is a structural guarantee rather than a policy.
 *
 * PURE. The reading and writing live in lib/learn/store.ts.
 */

export interface LearnTurn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface LearnSession {
  id: string;
  mode: LearnMode;
  /** The question that opened it. Used as the label in the resume list. */
  opener: string;
  turns: LearnTurn[];
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

/**
 * How a session is labelled in the resume list.
 *
 * The opener, trimmed to one line. Not a model-generated title: a title costs
 * a call, arrives late, and would be the only thing in this feature that could
 * be subtly wrong about what the reader actually did.
 */
export const LABEL_MAX = 72;

export function sessionLabel(session: Pick<LearnSession, 'opener'>): string {
  const one = session.opener.replace(/\s+/g, ' ').trim();
  if (one.length <= LABEL_MAX) return one || 'Untitled session';
  return `${one.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

/**
 * Sessions worth offering to resume, newest first.
 *
 * A session with no assistant turn never happened — the question was typed and
 * the answer failed or was abandoned. Offering it to resume would put a row in
 * the list that reopens to nothing.
 */
export function resumable(sessions: LearnSession[]): LearnSession[] {
  return sessions
    .filter((s) => s.turns.some((t) => t.role === 'assistant' && t.text.trim().length > 0))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/**
 * The history block handed to `recall`.
 *
 * Capped by CHARACTERS, not by session count. Ten short sessions and ten long
 * ones are different amounts of context, and a count-based cap silently sends
 * ten times the tokens on a heavy week.
 */
export const RECALL_BUDGET_CHARS = 6000;

export function recallContext(sessions: LearnSession[]): string {
  const usable = resumable(sessions);
  if (usable.length === 0) {
    // Said plainly rather than returned empty. An empty history block reads to
    // a model as "no constraint", and the instruction for `recall` tells it to
    // say so — it can only do that if it can tell.
    return 'PREVIOUS SESSIONS: none. This reader has no learn history yet.';
  }

  const parts: string[] = ['PREVIOUS SESSIONS, newest first:'];
  let budget = RECALL_BUDGET_CHARS;
  let included = 0;

  for (const s of usable) {
    const block = [
      `— [${s.mode}] ${sessionLabel(s)} (${s.updated_at})`,
      ...s.turns.slice(-4).map((t) => `  ${t.role}: ${t.text.slice(0, 400)}`),
    ].join('\n');

    if (block.length > budget) break;
    parts.push(block);
    budget -= block.length;
    included += 1;
  }

  // ⚠️ NEVER SILENTLY TRUNCATE. A history that stops at four sessions without
  // saying so lets the model state "you have not covered X" about a session
  // that exists and did not fit.
  if (included < usable.length) {
    parts.push(
      `(${usable.length - included} older session(s) omitted for length. Do not claim a topic was never covered — you are seeing the most recent ${included} of ${usable.length}.)`,
    );
  }

  return parts.join('\n\n');
}

/** A new session, before anything has been asked of a model. */
export function newSession(
  id: string,
  mode: LearnMode,
  opener: string,
  now: string,
  userId: string | null,
): LearnSession {
  return {
    id,
    mode,
    opener,
    turns: [{ role: 'user', text: opener, at: now }],
    created_at: now,
    updated_at: now,
    user_id: userId,
  };
}

export function appendTurn(
  session: LearnSession,
  turn: LearnTurn,
): LearnSession {
  return {
    ...session,
    turns: [...session.turns, turn],
    updated_at: turn.at,
  };
}
