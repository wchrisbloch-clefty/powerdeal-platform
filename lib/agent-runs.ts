import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';

/**
 * AGENT HEALTH — proof that the scheduled work is alive.
 *
 * A cron that dies quietly is worse than no cron. The operator assumes the
 * sweep ran, the recap generated, the stall alert would have fired. Nothing
 * errors. The failure stays invisible until a deal has sat stalled for sixty
 * days and nothing said so.
 *
 * So every scheduled job records what happened, and the status surface reports
 * three states that are deliberately NOT collapsed into one:
 *
 *   · NEVER RUN  — no record at all. Usually means the job was never deployed
 *                  or never scheduled, which is the most important thing the
 *                  operator can learn and the easiest to mistake for "fine".
 *   · FAILING    — ran and threw. Carries the error.
 *   · OK         — ran and finished, with a duration and an item count.
 *
 * "Never run" is the state a naive status page hides, because an empty row and
 * a healthy row look the same when both are blank.
 *
 * Records live in app_state so they survive a redeploy — the whole point is a
 * history that outlives the thing being measured.
 */

export const AGENT_RUNS_KEY = 'agents:runs';
export const AGENT_ALERT_KEY = 'agents:alert';

/** Two consecutive failures is a pattern, not a blip. */
export const FAILURE_ALERT_THRESHOLD = 2;

export type AgentRunner = 'vercel' | 'supabase';

export interface AgentJob {
  id: string;
  label: string;
  schedule: string;
  runner: AgentRunner;
  /** What the operator loses when this job is silently dead. */
  matters: string;
}

/**
 * The jobs that are supposed to exist.
 *
 * Declared here rather than derived from run records, so a job that has NEVER
 * run still appears with an explicit "never run" state. Deriving the list from
 * what has run would make a job that was never deployed simply not show up —
 * exactly the invisible failure this whole surface exists to catch.
 */
export const AGENT_JOBS: AgentJob[] = [
  {
    id: 'feed-sweep',
    label: 'Feed sweep',
    schedule: 'Daily · 10:00 UTC',
    runner: 'vercel',
    matters: 'Persists notable items so trends accumulate and the recap has material.',
  },
  {
    id: 'weekly-recap',
    label: 'Weekly recap',
    schedule: 'Mondays · 12:00 UTC',
    runner: 'vercel',
    matters: 'The week in review, with the accounts to touch first.',
  },
  {
    id: 'feed-health',
    label: 'Feed health probe',
    schedule: 'Mondays · 09:00 UTC',
    runner: 'vercel',
    matters: 'Catches publishers moving feed URLs without notice.',
  },
  {
    id: 'market-watch',
    label: 'Market watch',
    schedule: 'Fridays · 13:00 UTC',
    runner: 'supabase',
    matters: 'The weekly account-mapped market sweep.',
  },
  {
    id: 'stall-alert',
    label: 'Stall alert',
    schedule: 'Daily · 12:00 UTC',
    runner: 'supabase',
    matters: 'The only thing that notices a deal has stopped moving.',
  },
  {
    id: 'ccus-sweep',
    label: 'CCUS sweep',
    schedule: 'Daily · 11:00 UTC',
    runner: 'supabase',
    matters: 'Class VI permit movement, which breaks in local press first.',
  },
];

export interface AgentRun {
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  itemsProcessed: number | null;
  consecutiveFailures: number;
}

export type AgentRunMap = Record<string, AgentRun>;

export type AgentStatus = 'never-run' | 'ok' | 'failing' | 'stale';

export interface AgentJobStatus extends AgentJob {
  status: AgentStatus;
  run: AgentRun | null;
}

export async function getAgentRuns(): Promise<AgentRunMap> {
  return (await getAppState<AgentRunMap>(AGENT_RUNS_KEY)) ?? {};
}

/**
 * Record the outcome of one job run.
 *
 * Never throws. A job must not fail because its own bookkeeping failed — that
 * would turn the health surface into a source of the outages it reports.
 */
export async function recordAgentRun(
  jobId: string,
  result: {
    ok: boolean;
    durationMs?: number;
    itemsProcessed?: number;
    error?: string | null;
  },
): Promise<void> {
  try {
    const client = getAdminClient();
    if (!client) return;

    const runs = await getAgentRuns();
    const prev = runs[jobId];
    const now = new Date().toISOString();

    const next: AgentRun = {
      lastAttemptAt: now,
      lastSuccessAt: result.ok ? now : (prev?.lastSuccessAt ?? null),
      lastError: result.ok ? null : (result.error ?? 'Unknown error'),
      durationMs: result.durationMs ?? null,
      itemsProcessed: result.itemsProcessed ?? null,
      consecutiveFailures: result.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
    };

    const merged: AgentRunMap = { ...runs, [jobId]: next };

    await client
      .from('app_state')
      .upsert(
        { key: AGENT_RUNS_KEY, value: merged, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );

    await syncAlert(merged);
  } catch (err) {
    console.warn(`[agent-runs] could not record ${jobId}:`, (err as Error).message);
  }
}

export interface AgentAlert {
  jobs: { id: string; label: string; failures: number; error: string | null }[];
  since: string;
}

/**
 * Raise or clear the consecutive-failure alert.
 *
 * Written to app_state rather than emailed or logged: the operator has to see
 * it on their next visit without having to go looking, and a log line nobody
 * reads is the same as silence.
 */
async function syncAlert(runs: AgentRunMap): Promise<void> {
  const client = getAdminClient();
  if (!client) return;

  const failing = AGENT_JOBS.filter(
    (j) => (runs[j.id]?.consecutiveFailures ?? 0) >= FAILURE_ALERT_THRESHOLD,
  ).map((j) => ({
    id: j.id,
    label: j.label,
    failures: runs[j.id]!.consecutiveFailures,
    error: runs[j.id]!.lastError,
  }));

  const value: AgentAlert | null =
    failing.length > 0 ? { jobs: failing, since: new Date().toISOString() } : null;

  await client
    .from('app_state')
    .upsert(
      { key: AGENT_ALERT_KEY, value, user_id: POWERDEAL_USER_ID },
      { onConflict: 'user_id,key' },
    );
}

export async function getAgentAlert(): Promise<AgentAlert | null> {
  return await getAppState<AgentAlert>(AGENT_ALERT_KEY);
}

/**
 * How overdue a job is allowed to be before it counts as stale.
 *
 * Generous — roughly two intervals — because a job that runs weekly should not
 * flash a warning six hours after its window. What matters is catching a job
 * that has stopped, not one that ran late.
 */
const STALE_AFTER_MS: Record<string, number> = {
  'feed-sweep': 3 * 24 * 3600_000,
  'weekly-recap': 16 * 24 * 3600_000,
  'feed-health': 16 * 24 * 3600_000,
  'market-watch': 16 * 24 * 3600_000,
  'stall-alert': 3 * 24 * 3600_000,
  'ccus-sweep': 3 * 24 * 3600_000,
};

export function statusOf(job: AgentJob, run: AgentRun | undefined): AgentStatus {
  if (!run) return 'never-run';
  if (run.consecutiveFailures > 0) return 'failing';
  if (!run.lastSuccessAt) return 'failing';

  const age = Date.now() - Date.parse(run.lastSuccessAt);
  const limit = STALE_AFTER_MS[job.id] ?? 7 * 24 * 3600_000;
  return age > limit ? 'stale' : 'ok';
}

export async function getAgentStatuses(): Promise<AgentJobStatus[]> {
  const runs = await getAgentRuns();
  return AGENT_JOBS.map((job) => ({
    ...job,
    status: statusOf(job, runs[job.id]),
    run: runs[job.id] ?? null,
  }));
}

/**
 * Wrap a scheduled job so its outcome is always recorded — including when it
 * throws. An unrecorded failure is indistinguishable from a job that never ran.
 */
export async function withRunRecord<T>(
  jobId: string,
  fn: () => Promise<{ result: T; itemsProcessed?: number }>,
): Promise<T> {
  const started = Date.now();
  try {
    const { result, itemsProcessed } = await fn();
    await recordAgentRun(jobId, {
      ok: true,
      durationMs: Date.now() - started,
      itemsProcessed,
    });
    return result;
  } catch (err) {
    await recordAgentRun(jobId, {
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
