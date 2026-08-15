import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';
import type { Provider, TaskKind } from './model-routing';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT THE LAST REAL CALL ACTUALLY RESOLVED TO.
 * ═══════════════════════════════════════════════════════════════
 *
 * The other half of model health. `model-health.ts` asks the provider whether
 * a model id still exists; this records what happened when the app last made a
 * real call. Neither answers the whole question:
 *
 *   · A metadata GET says `llama-3.3-70b-versatile` exists. It does. Chat
 *     completions on it were still 429ing on daily quota all afternoon.
 *   · This log says the last summarize resolved to Claude. It does not say
 *     whether Gemini is dead or merely was not reached.
 *
 * Together they read: "groq threw 429, gemini threw 404, claude answered" —
 * which is the sentence that was previously only visible by scrolling a log.
 *
 * `fellThrough` IS THE POINT. A successful call that quietly burned through
 * two failed providers is the exact state that went unnoticed: the summary
 * appeared, the sweep reported success, and both cheap tiers were down. Only
 * recording the winner would reproduce that blindness at a new address.
 *
 * NEVER THROWS, NEVER GATES. A model call must not fail because its own
 * bookkeeping failed — the lesson of `recordAgentRun`. But it is not silent
 * either: `supabase-js` RESOLVES with `{ error }`, so every write here
 * inspects the returned error and logs it rather than letting it fall through
 * a try/catch that nothing ever throws into.
 */

export const MODEL_LOG_KEY = 'models:last';

export interface FellThrough {
  provider: Provider;
  error: string;
}

export interface Resolution {
  provider: Provider;
  model: string;
  at: string;
  ok: boolean;
  /** Providers tried and failed BEFORE the one that answered. */
  fellThrough: FellThrough[];
  /** Set when no provider answered at all. */
  error?: string;
}

export type ModelLog = Partial<Record<TaskKind, Resolution>>;

export async function getModelLog(): Promise<ModelLog> {
  return (await getAppState<ModelLog>(MODEL_LOG_KEY)) ?? {};
}

/**
 * Write suppression.
 *
 * Chat is interactive and a row per call would be a lot of traffic for a fact
 * that rarely changes. So a resolution is written when its SIGNATURE changes —
 * provider, model, ok, and the fall-through list — or when the last write for
 * that task is older than the interval below.
 *
 * The signature includes `fellThrough` deliberately: a call that starts
 * failing over is a change, and suppressing it would hide the first sighting
 * of exactly the event this exists to catch.
 *
 * In-process only. Serverless instances are short-lived, so this bounds writes
 * without pretending to be a distributed cache.
 */
const REWRITE_AFTER_MS = 10 * 60_000;
const lastWritten = new Map<string, { signature: string; at: number }>();

function signatureOf(r: Resolution): string {
  return [
    r.provider,
    r.model,
    r.ok ? 'ok' : 'fail',
    r.error ?? '',
    ...r.fellThrough.map((f) => `${f.provider}:${f.error}`),
  ].join('|');
}

/** Exported so the suppression can be exercised without a database. */
export function shouldWrite(
  task: TaskKind,
  next: Resolution,
  now: number,
  memo: Map<string, { signature: string; at: number }> = lastWritten,
): boolean {
  const prev = memo.get(task);
  const signature = signatureOf(next);
  if (prev && prev.signature === signature && now - prev.at < REWRITE_AFTER_MS) {
    return false;
  }
  memo.set(task, { signature, at: now });
  return true;
}

export async function recordResolution(
  task: TaskKind,
  resolution: Resolution,
): Promise<void> {
  try {
    if (!shouldWrite(task, resolution, Date.now())) return;

    const client = getAdminClient();
    if (!client) return;

    const log = await getModelLog();
    const merged: ModelLog = { ...log, [task]: resolution };

    // supabase-js RESOLVES with `{ error }`. Discarding it is how `app_state`
    // wrote nothing for a day while every caller believed it had.
    const { error } = await client
      .from('app_state')
      .upsert(
        { key: MODEL_LOG_KEY, value: merged, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );
    if (error) {
      console.warn(`[model-log] write failed for ${task}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[model-log] could not record ${task}:`, (err as Error).message);
  }
}

// ── Reading it back ─────────────────────────────────────────────

export interface TaskResolution {
  task: TaskKind;
  resolution: Resolution | null;
}

/**
 * A resolution older than this is reported with its age rather than as current
 * state. "summarize last resolved to Claude" means nothing without knowing
 * whether that was an hour ago or in March.
 */
export const STALE_RESOLUTION_MS = 7 * 24 * 3600_000;

export function isStale(r: Resolution | null, now = Date.now()): boolean {
  if (!r) return false;
  return now - Date.parse(r.at) > STALE_RESOLUTION_MS;
}

/**
 * Every provider that failed on its last recorded attempt, across all tasks.
 *
 * Deduplicated by provider and error, because the same 429 reported once per
 * task is one fact about Groq, not four facts.
 */
export function failingProviders(log: ModelLog): FellThrough[] {
  const seen = new Map<string, FellThrough>();
  for (const r of Object.values(log)) {
    if (!r) continue;
    for (const f of r.fellThrough) seen.set(`${f.provider}|${f.error}`, f);
    if (!r.ok && r.error) seen.set(`${r.provider}|${r.error}`, { provider: r.provider, error: r.error });
  }
  return [...seen.values()];
}
