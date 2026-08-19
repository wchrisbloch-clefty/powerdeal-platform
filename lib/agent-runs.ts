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
    schedule: 'Fridays · 17:00 UTC',
    runner: 'vercel',
    matters: 'The week in review, with the accounts to touch first.',
  },
  {
    id: 'feed-health',
    label: 'Feed health probe',
    schedule: 'Daily · 09:00 UTC',
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

/**
 * Render a 5-field cron expression as the label a human reads.
 *
 * ⚠️ THE LABELS HAD DRIFTED AND NOTHING NOTICED. `weekly-recap` displayed
 * "Mondays · 12:00 UTC" while `vercel.json` had run it at `0 17 * * 5` —
 * Friday — since the recap was moved to match the Friday ritual. `feed-health`
 * displayed "Mondays · 09:00 UTC" after being moved to daily. Both labels were
 * hand-written strings sitting next to a schedule nobody re-read.
 *
 * The status page's entire job is telling an operator whether scheduled work is
 * alive. A row that reports the wrong schedule tells them a job is overdue when
 * it is not, or on time when it never fired — the same class of failure as a
 * metric whose name is a lie about what produced it (checklist rule 15).
 *
 * Pure, so the suite can hold every label to the file that actually schedules
 * it. See tests/crons.test.ts.
 */
const DAY_NAMES = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

export function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;
  const [minute, hour, dom, month, dow] = parts;

  // Anything this does not confidently understand is returned VERBATIM rather
  // than described approximately. A label that is obviously a cron expression
  // sends the reader to the schedule; a plausible-but-wrong sentence does not.
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return expression;
  if (dom !== '*' || month !== '*') return expression;

  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
  if (dow === '*') return `Daily · ${time}`;
  if (/^\d$/.test(dow)) return `${DAY_NAMES[Number(dow)]} · ${time}`;
  return expression;
}

/** Which cron path backs each Vercel-run job. Asserted against vercel.json. */
export const VERCEL_JOB_PATHS: Record<string, string> = {
  'feed-sweep': '/api/feed/sweep',
  'weekly-recap': '/api/cron/recap',
  'feed-health': '/api/cron/feed-health',
};

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

    // ⚠️ THE RETURNED ERROR USED TO BE DISCARDED.
    //
    // supabase-js RESOLVES with `{ error }` rather than throwing, so a failed
    // write fell straight through the try/catch below — nothing threw, the
    // catch never fired, and execution carried on to syncAlert, which
    // succeeded. The observable result was an alert key written today beside a
    // runs key that read empty, and a health surface reporting six jobs as
    // "never run" while they were demonstrably running.
    //
    // A health surface that cannot tell "did not run" from "could not write
    // down that it ran" is the outage it is supposed to report.
    const { error } = await client
      .from('app_state')
      .upsert(
        { key: AGENT_RUNS_KEY, value: merged, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );
    if (error) throw new Error(`app_state write failed: ${error.message}`);

    await syncAlert(merged);
  } catch (err) {
    // Still never rethrown — a job must not fail because its own bookkeeping
    // failed. But it is no longer silent, and getAgentStatuses can now tell
    // the two states apart.
    console.warn(`[agent-runs] could not record ${jobId}:`, (err as Error).message);
    await noteBookkeepingFailure(jobId, (err as Error).message);
  }
}

/**
 * The bookkeeping failure itself, recorded where it can still be read.
 *
 * Written to a SEPARATE key, because the whole problem is that the runs key
 * could not be written — putting the evidence in the thing that is broken is
 * how this went unnoticed for a day.
 *
 * Best-effort by construction: if this write fails too, there is nothing left
 * to do but the console line above, and pretending otherwise would just add a
 * second silent failure.
 */
const BOOKKEEPING_KEY = 'agent_runs_write_failure';

export interface BookkeepingFailure {
  jobId: string;
  message: string;
  at: string;
}

async function noteBookkeepingFailure(jobId: string, message: string): Promise<void> {
  try {
    const client = getAdminClient();
    if (!client) return;
    await client.from('app_state').upsert(
      {
        key: BOOKKEEPING_KEY,
        value: { jobId, message, at: new Date().toISOString() } satisfies BookkeepingFailure,
        user_id: POWERDEAL_USER_ID,
      },
      { onConflict: 'user_id,key' },
    );
  } catch {
    // Deliberately empty. See above.
  }
}

export async function getBookkeepingFailure(): Promise<BookkeepingFailure | null> {
  return (await getAppState<BookkeepingFailure>(BOOKKEEPING_KEY)) ?? null;
}

/**
 * Is "never run" believable?
 *
 * Six jobs reading never-run at once, beside an alert written minutes ago, is
 * not six idle jobs — it is one broken write. The surface can notice that
 * itself rather than waiting for somebody to compare two fields by eye.
 */
export function bookkeepingLooksBroken(
  runs: AgentRunMap,
  alert: AgentAlert | null,
): boolean {
  if (Object.keys(runs).length > 0) return false;
  if (!alert || !alert.since) return false;
  // The alert is written by the same code path as the runs map. If one is
  // recent and the other is empty, the empty one is the failure.
  return Date.now() - new Date(alert.since).getTime() < 7 * 24 * 60 * 60 * 1000;
}

export interface AgentAlert {
  jobs: { id: string; label: string; failures: number; error: string | null }[];
  since: string;
}

/**
 * What actually sits in app_state.value.
 *
 * The cleared state is an empty `jobs` array, NOT a null row. app_state.value
 * is `jsonb NOT NULL`, so writing null raises a constraint violation — and it
 * did: stall-alert ran, succeeded, and then died on this write, because a
 * successful run is exactly the case that clears the alert. The healthy path
 * was the only one that could fail.
 *
 * Same shape as setFeedState clearing an entry: mutate the value, never write
 * an absent one.
 */
interface StoredAgentAlert {
  jobs: AgentAlert['jobs'];
  since: string | null;
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

  const value: StoredAgentAlert = {
    jobs: failing,
    since: failing.length > 0 ? new Date().toISOString() : null,
  };

  await client
    .from('app_state')
    .upsert(
      { key: AGENT_ALERT_KEY, value, user_id: POWERDEAL_USER_ID },
      { onConflict: 'user_id,key' },
    );
}

/**
 * Null means "nothing is failing" to every caller. Rows written before the fix
 * above are literally null and are normalised here rather than migrated — the
 * next run of any job overwrites them with the current shape anyway.
 */
export async function getAgentAlert(): Promise<AgentAlert | null> {
  const stored = await getAppState<StoredAgentAlert>(AGENT_ALERT_KEY);
  if (!stored?.jobs?.length || !stored.since) return null;
  return { jobs: stored.jobs, since: stored.since };
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
  'weekly-recap': 10 * 24 * 3600_000,
  'feed-health': 3 * 24 * 3600_000,
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

/**
 * ═══════════════════════════════════════════════════════════════
 * FRESHNESS, READ OFF THE HEARTBEAT AND NEVER OFF THE PAYLOAD.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ THE MECHANISM ABOVE ALREADY WORKED. `statusOf` would have called
 * ccus-sweep `stale` from the third day of the outage, and it did. What it
 * could not do was reach anybody: it renders in Settings › Agent health, and
 * the surface where the operator was actually looking — the CCUS tab — showed
 * `ccus_latest`, a PAYLOAD key that only moves when the sweep finds something.
 *
 * So the outage was detected and not delivered. Five missed stall-alert runs
 * and seven missed ccus-sweep runs, every one of them reporting healthy on the
 * page anybody would have opened.
 *
 * ══ THE RULE ══
 *
 *   A surface that shows data from a scheduled job states the JOB's freshness,
 *   from the heartbeat, and never infers it from the newest row it is holding.
 *
 * "The newest event is from the 11th" and "nothing has checked since the 11th"
 * are different sentences, and only one of them is a reason to worry. A
 * payload timestamp cannot tell them apart; a heartbeat can tell them apart
 * without knowing anything about the payload at all.
 */
export interface JobFreshness {
  jobId: string;
  label: string;
  status: AgentStatus;
  /** When the job last completed successfully. Null if it never has. */
  lastSuccessAt: string | null;
  /** How overdue it is, in whole hours. Zero when healthy. */
  overdueHours: number;
  /** One sentence, ready to render. Always true of both facts. */
  sentence: string;
}

export function freshnessOf(job: AgentJob, run: AgentRun | undefined): JobFreshness {
  const status = statusOf(job, run);
  const lastSuccessAt = run?.lastSuccessAt ?? null;
  const limit = STALE_AFTER_MS[job.id] ?? 7 * 24 * 3600_000;
  const age = lastSuccessAt ? Date.now() - Date.parse(lastSuccessAt) : Infinity;
  const overdueHours =
    Number.isFinite(age) && age > limit ? Math.floor((age - limit) / 3600_000) : 0;

  const sentence =
    status === 'never-run'
      ? `${job.label} has never completed a run, so nothing here has been checked.`
      : status === 'failing'
        ? `${job.label} is failing — the last ${run?.consecutiveFailures ?? 1} run(s) errored, ` +
          `so anything below may be out of date. ${run?.lastError ?? ''}`.trim()
        : status === 'stale'
          ? `${job.label} has not completed since ${lastSuccessAt}, ` +
            `${overdueHours}h past its ${job.schedule.toLowerCase()} window. ` +
            `Anything below is what it found before it stopped.`
          : `${job.label} last completed ${lastSuccessAt}.`;

  return { jobId: job.id, label: job.label, status, lastSuccessAt, overdueHours, sentence };
}

/** Every job's freshness. N comes from AGENT_JOBS, so all six are covered. */
export async function getFreshness(): Promise<JobFreshness[]> {
  const runs = await getAgentRuns();
  return AGENT_JOBS.map((job) => freshnessOf(job, runs[job.id]));
}

/** One job's freshness, for a surface that shows one job's output. */
export async function freshnessFor(jobId: string): Promise<JobFreshness | null> {
  const job = AGENT_JOBS.find((j) => j.id === jobId);
  if (!job) return null;
  const runs = await getAgentRuns();
  return freshnessOf(job, runs[jobId]);
}

/**
 * Which gap kind a surface should render for this job's freshness.
 *
 * Reuses the gap vocabulary rather than inventing a second one: `blocked` is
 * already "the read failed and here is why", and a dead job is the same fact
 * about a slower read.
 */
export function freshnessGapKind(f: JobFreshness): 'blocked' | 'unchecked' | null {
  if (f.status === 'ok') return null;
  return f.status === 'never-run' ? 'unchecked' : 'blocked';
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
