import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import type { LearnSession, LearnTurn } from './session';
import { appendTurn } from './session';

/**
 * ═══════════════════════════════════════════════════════════════
 * EVERY WRITE INSPECTS THE ERROR SUPABASE RESOLVES WITH.
 * ═══════════════════════════════════════════════════════════════
 *
 * `supabase-js` RESOLVES with `{ data: null, error }` rather than throwing. A
 * caller that ignores the second half of that tuple sees no exception, falls
 * straight through its own try/catch, and carries on believing it wrote.
 *
 * That is where the `app_state` bug lived: `recordAgentRun` discarded the
 * returned error, nothing threw, and for a day the health surface reported six
 * running jobs as "never run" while every one of them was running. It is not
 * being found twice.
 *
 * So every function here returns a RESULT rather than a value — `{ ok, error }`
 * — and no call site can accidentally treat a failed write as a successful
 * one. The route reports it; the UI renders it.
 *
 * ══ IT STILL NEVER GATES ══
 *
 * A failed session write does not stop the answer. The reader asked a
 * question, the model answered, and losing the ability to RESUME that session
 * later is not a reason to withhold the answer in front of them. The failure
 * is reported beside the answer, not instead of it.
 */

export const LEARN_TABLE = 'learn_sessions';

export interface WriteResult {
  ok: boolean;
  /** Present exactly when `ok` is false. Verbatim from the client. */
  error: string | null;
}

export interface ReadResult {
  sessions: LearnSession[];
  /**
   * Set when the read FAILED. Distinct from an empty list — "no sessions yet"
   * and "could not look" render differently, per lib/seed-state.ts.
   */
  error: string | null;
}

function unconfigured(): string {
  return 'SUPABASE_SERVICE_ROLE_KEY is not set, so learn sessions cannot be stored.';
}

export async function listSessions(limit = 40): Promise<ReadResult> {
  const client = getAdminClient();
  if (!client) return { sessions: [], error: unconfigured() };

  const { data, error } = await client
    .from(LEARN_TABLE)
    .select('*')
    .eq('user_id', POWERDEAL_USER_ID)
    .order('updated_at', { ascending: false })
    .limit(limit);

  // The error is checked FIRST and unconditionally. `data` is null here and
  // `(data ?? []).length` is 0, which is the shape that reads as "none".
  if (error) return { sessions: [], error: error.message };
  return { sessions: (data ?? []) as LearnSession[], error: null };
}

export async function getSession(id: string): Promise<{
  session: LearnSession | null;
  error: string | null;
}> {
  const client = getAdminClient();
  if (!client) return { session: null, error: unconfigured() };

  const { data, error } = await client
    .from(LEARN_TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', POWERDEAL_USER_ID)
    .maybeSingle();

  if (error) return { session: null, error: error.message };
  return { session: (data as LearnSession) ?? null, error: null };
}

export async function saveSession(session: LearnSession): Promise<WriteResult> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: unconfigured() };

  const { error } = await client.from(LEARN_TABLE).upsert(
    {
      id: session.id,
      mode: session.mode,
      opener: session.opener,
      turns: session.turns,
      created_at: session.created_at,
      updated_at: session.updated_at,
      user_id: POWERDEAL_USER_ID,
    },
    { onConflict: 'id' },
  );

  // ⚠️ NOT DISCARDED. See the header.
  if (error) {
    console.warn(`[learn] session write failed for ${session.id}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/**
 * Append one turn and persist.
 *
 * Read-modify-write rather than a jsonb append, because there is one operator
 * and one open box — the concurrency this would lose to does not exist, and a
 * `jsonb_set` here would be an optimisation nobody can read.
 *
 * ⚠️ A FAILED READ DOES NOT BECOME AN EMPTY SESSION. If the row cannot be
 * fetched, this reports the failure rather than writing a fresh session over
 * whatever is there — the destructive version of the same `{ error }` bug.
 */
export async function appendAndSave(
  sessionId: string,
  turn: LearnTurn,
): Promise<WriteResult> {
  const { session, error } = await getSession(sessionId);
  if (error) return { ok: false, error: `Could not read the session to append to it: ${error}` };
  if (!session) return { ok: false, error: `Session ${sessionId} no longer exists.` };
  return saveSession(appendTurn(session, turn));
}

export async function deleteSession(id: string): Promise<WriteResult> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: unconfigured() };

  const { error } = await client
    .from(LEARN_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', POWERDEAL_USER_ID);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
