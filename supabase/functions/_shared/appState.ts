import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Service-role Supabase client + app_state helpers (CB Hub pattern).
 *
 * Edge functions run across every user, so they use the service role and
 * bypass RLS. That makes user_id scoping the caller's responsibility on every
 * single query — there is no database backstop here.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readState<T>(
  supabase: SupabaseClient,
  userId: string,
  key: string,
): Promise<T | null> {
  const { data } = await supabase
    .from('app_state')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  return (data?.value as T) ?? null;
}

export async function writeState(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' },
    );
  if (error) throw new Error(`app_state write failed: ${error.message}`);
}

/** Every user with a settings row — the iteration set for scheduled work. */
export async function listUsers(
  supabase: SupabaseClient,
): Promise<{ user_id: string; watchlist: unknown; notify: Record<string, boolean> }[]> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(
      'user_id, watchlist, notify_market_watch, notify_stall_alert, notify_weekly_recap',
    );
  if (error) throw new Error(`Could not list users: ${error.message}`);

  return (data ?? []).map((row) => ({
    user_id: row.user_id as string,
    watchlist: row.watchlist,
    notify: {
      market_watch: row.notify_market_watch as boolean,
      stall_alert: row.notify_stall_alert as boolean,
      weekly_recap: row.notify_weekly_recap as boolean,
    },
  }));
}

export interface DealRow {
  id: string;
  deal_id: string;
  company: string;
  vertical: string;
  state: string | null;
  utility: string | null;
  stage: string;
  health_score: number;
  days_in_stage: number;
  multi_threaded: boolean;
  decision_mapped: boolean;
  economic_buyer: string | null;
  champion: string | null;
  next_move: string | null;
  key_risk: string | null;
  updated_at: string;
}

export async function listDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<DealRow[]> {
  const { data, error } = await supabase
    .from('deals')
    .select(
      'id, deal_id, company, vertical, state, utility, stage, health_score, days_in_stage, multi_threaded, decision_mapped, economic_buyer, champion, next_move, key_risk, updated_at',
    )
    .eq('user_id', userId)
    .not('stage', 'in', '("Closed-Won","Post-Sale","Archived")');

  if (error) throw new Error(`Could not list deals: ${error.message}`);
  return (data ?? []) as DealRow[];
}

/**
 * AGENT RUN RECORDS — the edge-function half of the health surface.
 *
 * Mirrors lib/agent-runs.ts on the Next side, writing to the same
 * `agents:runs` key so one status page covers both runtimes. It has to be a
 * separate implementation because this is Deno with no access to the app's
 * module graph; the SHAPE is what must stay in sync, and it is small enough to
 * keep that way by hand.
 *
 * Records against the operator's own row rather than per-user: the status page
 * asks "did the Friday sweep run", not "did it run for user 7".
 */
const AGENT_RUNS_KEY = 'agents:runs';
const AGENT_ALERT_KEY = 'agents:alert';
const FAILURE_ALERT_THRESHOLD = 2;

interface AgentRun {
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  itemsProcessed: number | null;
  consecutiveFailures: number;
}

/** Never throws — a job must not fail because its own bookkeeping did. */
export async function recordAgentRun(
  supabase: SupabaseClient,
  ownerId: string,
  jobId: string,
  result: { ok: boolean; durationMs?: number; itemsProcessed?: number; error?: string | null },
): Promise<void> {
  try {
    const runs =
      (await readState<Record<string, AgentRun>>(supabase, ownerId, AGENT_RUNS_KEY)) ?? {};
    const prev = runs[jobId];
    const now = new Date().toISOString();

    runs[jobId] = {
      lastAttemptAt: now,
      lastSuccessAt: result.ok ? now : (prev?.lastSuccessAt ?? null),
      lastError: result.ok ? null : (result.error ?? 'Unknown error'),
      durationMs: result.durationMs ?? null,
      itemsProcessed: result.itemsProcessed ?? null,
      consecutiveFailures: result.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
    };

    await writeState(supabase, ownerId, AGENT_RUNS_KEY, runs);

    const failing = Object.entries(runs)
      .filter(([, r]) => r.consecutiveFailures >= FAILURE_ALERT_THRESHOLD)
      .map(([id, r]) => ({ id, label: id, failures: r.consecutiveFailures, error: r.lastError }));

    await writeState(
      supabase,
      ownerId,
      AGENT_ALERT_KEY,
      failing.length > 0 ? { jobs: failing, since: new Date().toISOString() } : null,
    );
  } catch (err) {
    console.warn(`[agent-runs] could not record ${jobId}:`, (err as Error).message);
  }
}
