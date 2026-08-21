'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { AgentJobStatus, AgentStatus } from '@/lib/agent-runs';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import TimeAgo from '@/components/ui/time-ago';

/**
 * AGENT HEALTH — the table that says whether the scheduled work is alive.
 *
 * The design decision that matters: NEVER RUN is its own state with its own
 * copy, not a blank cell. A job that was never deployed and a job that ran
 * successfully both produce an empty error column, and collapsing them is
 * precisely how an operator ends up believing a stall alert is watching their
 * pipeline when nothing was ever scheduled.
 */

const STATUS_STYLES: Record<AgentStatus, { dot: string; label: string }> = {
  ok: { dot: 'bg-success', label: 'Healthy' },
  failing: { dot: 'bg-danger', label: 'Failing' },
  stale: { dot: 'bg-warning', label: 'Overdue' },
  'never-run': { dot: 'bg-rule', label: 'Never run' },
};

interface ScoreDriftResponse {
  ok: boolean;
  /** False when the check could not run at all. */
  checked: boolean;
  /** ⚠️ NULL, NOT 0, WHEN THE CHECK DID NOT RUN. See the note at the render. */
  drifted: number | null;
  rows: {
    deal_id: string;
    company: string;
    stored_health: number;
    computed_health: number;
    stored_meddpicc: number;
    computed_meddpicc: number;
  }[];
  truncated?: number;
  error: string | null;
}

interface DriftResponse {
  ok: boolean;
  checkedTables: number;
  blocking: number;
  notices: number;
  error: string | null;
  drift: { kind: string; table: string; detail: string; severity: string; why: string }[];
}

interface ContractRow {
  fn: string;
  deployed: number | null;
  expected: number;
  state: 'current' | 'behind' | 'ahead' | 'unreachable' | 'unstamped';
  detail: string;
}

interface StatusResponse {
  persistence: boolean;
  note?: string;
  jobs: AgentJobStatus[];
  summary?: { total: number; ok: number; failing: number; stale: number; neverRun: number };
  contracts?: ContractRow[] | null;
}

interface ModelProbeRow {
  provider: string;
  model: string;
  envVar: string;
  status: 'resolves' | 'retired' | 'throttled' | 'unauthorized' | 'unreachable' | 'not-configured';
  action: string;
  httpStatus: number | null;
  alternatives: string[];
  tasks: string[];
  explanation: string;
}

interface ModelHealthResponse {
  ok: boolean;
  worst: string;
  headline: string;
  probes: ModelProbeRow[];
  resolutions: {
    task: string;
    chain: string[];
    stale: boolean;
    resolution: {
      provider: string;
      model: string;
      at: string;
      ok: boolean;
      fellThrough: { provider: string; error: string }[];
      error?: string;
    } | null;
  }[];
  fellThroughLastRun: { provider: string; error: string }[];
}

/**
 * Colour by how PERMANENT the problem is, not how loud it is.
 *
 * `retired` is red because nothing but a human changing an env var will fix
 * it. `throttled` is amber because it clears on the provider's clock.
 * `not-configured` is neutral — a deployment choice is not a fault, and
 * painting it red teaches people to ignore red.
 */
const MODEL_STATUS_STYLES: Record<ModelProbeRow['status'], { dot: string; label: string }> = {
  resolves: { dot: 'bg-success', label: 'Resolves' },
  retired: { dot: 'bg-danger', label: 'Retired' },
  unauthorized: { dot: 'bg-danger', label: 'Key rejected' },
  throttled: { dot: 'bg-warning', label: 'Rate-limited' },
  unreachable: { dot: 'bg-warning', label: 'Unreachable' },
  'not-configured': { dot: 'bg-rule', label: 'No key' },
};

export default function AgentHealth() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * SCHEMA DRIFT IS FETCHED SEPARATELY, ON PURPOSE.
   *
   * Folding it into /api/agents/status would make one payload depend on two
   * mechanisms, and a failure in either would take out the reading of both —
   * checklist rule 9, the shape that produced "six idle jobs" from one broken
   * write. Two fetches means a drift check that cannot answer still leaves job
   * status readable, and vice versa.
   */
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  /**
   * SCORE DRIFT IS A FOURTH INDEPENDENT FETCH, for the reason the other three
   * are separate: a failure in one must not blank the others. It is also the
   * one that found the largest defect in this build — twenty-one deals whose
   * stored health had never been produced by the function that names it.
   */
  const [scoreDrift, setScoreDrift] = useState<ScoreDriftResponse | null>(null);
  /**
   * MODEL HEALTH IS THE THIRD INDEPENDENT FETCH, for the same reason.
   *
   * Gemini retired a model and Groq hit its daily ceiling in the same hour, and
   * the first place either appeared was a log line. A provider deprecating out
   * from under us is not something any test here can catch — only asking the
   * live API can. Two dead providers should be on the page, not in a log.
   */
  const [models, setModels] = useState<ModelHealthResponse | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/agents/status');
      setData((await res.json()) as StatusResponse);
    } catch {
      setData(null);
    }
    // Independent: a drift failure must not blank the job table, and a model
    // probe timing out must not blank either of the other two.
    try {
      const d = await fetch('/api/schema/drift');
      setDrift((await d.json()) as DriftResponse);
    } catch {
      setDrift(null);
    }
    try {
      const m = await fetch('/api/models/health');
      setModels((await m.json()) as ModelHealthResponse);
    } catch {
      setModels(null);
    }
    try {
      const h = await fetch('/api/health/drift');
      setScoreDrift((await h.json()) as ScoreDriftResponse);
    } catch {
      setScoreDrift(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-dim">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Checking scheduled jobs…
      </p>
    );
  }

  /**
   * ⚠️ THE EARLY RETURNS USED TO TAKE THE WHOLE PAGE WITH THEM.
   *
   * A failed `/api/agents/status` fetch returned before anything else
   * rendered, which would have hidden model health and schema drift behind an
   * unrelated outage — rebuilding, one level up, the exact coupling the three
   * separate fetches exist to prevent. Each section now renders its own
   * unavailability and nothing else's.
   */
  if (!data || !data.persistence) {
    return (
      <div className="space-y-3">
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          {!data
            ? 'Could not reach the agent status endpoint. Job status is unknown — not healthy.'
            : (data.note ??
              'Supabase is not configured, so run records cannot be stored. Job status is unknown — not healthy.')}
        </p>
        <ModelHealth models={models} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {data.summary ? (
          <p className="text-sm text-text-dim">
            <span className="font-mono text-text">{data.summary.ok}</span> healthy ·{' '}
            <span className="font-mono text-text">{data.summary.failing}</span> failing ·{' '}
            <span className="font-mono text-text">{data.summary.stale}</span> overdue ·{' '}
            <span className="font-mono text-text">{data.summary.neverRun}</span> never run
          </p>
        ) : null}
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      <DeployedBehind contracts={data.contracts} />

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-col-widest-min text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <Th>Job</Th>
              <Th>Status</Th>
              <Th>Last run</Th>
              <Th>Items</Th>
              <Th>Duration</Th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => {
              const style = STATUS_STYLES[job.status];
              return (
                <tr key={job.id} className="border-b border-rule-faint last:border-0 align-top">
                  <td className="py-2 pr-3">
                    <span className="block text-text">{job.label}</span>
                    <span className="block text-2xs text-text-faint">
                      {job.schedule} · {job.runner === 'vercel' ? 'Vercel cron' : 'Supabase pg_cron'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
                      <span className="text-text-dim">{style.label}</span>
                    </span>
                    {job.run?.lastError ? (
                      <span className="mt-0.5 block max-w-col-clamp text-2xs text-danger">
                        {job.run.lastError}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-text-dim">
                    {job.status === 'never-run' ? (
                      /* Said explicitly rather than left blank — this is the
                         row most likely to mean "never deployed". */
                      <span className="text-text-faint">No record — never fired</span>
                    ) : (
                      <TimeAgo value={job.run?.lastSuccessAt ?? job.run?.lastAttemptAt} />
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-2xs text-text-dim">
                    {job.run?.itemsProcessed ?? '—'}
                  </td>
                  <td className="py-2 font-mono text-2xs text-text-dim">
                    {job.run?.durationMs != null ? `${(job.run.durationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.jobs.some((j) => j.status === 'never-run' && j.runner === 'supabase') ? (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-xs text-text-dim">
          Supabase-run jobs showing <span className="text-text">never run</span> usually means the
          edge functions were never deployed, or{' '}
          <span className="font-mono">supabase/functions/schedule.sql</span> was never executed
          against the database — it ships with{' '}
          <span className="font-mono">{'{PROJECT_REF}'}</span> and{' '}
          <span className="font-mono">vault.decrypted_secrets</span> lookups rather than a pasted literal
          in first.
        </p>
      ) : null}

      {/* ── Score drift ──
          The schema-drift defect one layer in: a STORED value disagreeing with
          the function that produced it. Twenty-one deals carried hand-written
          whole-integer health scores for the life of this build, inflated
          100-167%, while compute_health_score sat in the schema being read by
          nothing. The average, the at-risk count and the needs-attention
          ORDERING were all fiction.

          Placed above schema drift deliberately: this one is about the numbers
          the operator makes decisions from. */}
      <div className="border-t border-rule pt-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Score drift</p>
          {/* ⚠️ "COULD NOT LOOK" AND "LOOKED AND FOUND NOTHING" GET DIFFERENT
              COPY. `drifted` is null in the first case and 0 in the second,
              and rendering "0" for a failed check is the exact claim this
              check exists to catch. */}
          {scoreDrift === null || !scoreDrift.checked ? (
            <p className="text-2xs text-text-faint">
              {scoreDrift === null ? 'not checked' : 'could not read'}
            </p>
          ) : (
            <p className="text-2xs">
              <span
                className={cn(
                  'font-mono',
                  (scoreDrift.drifted ?? 0) > 0 ? 'text-danger' : 'text-success',
                )}
              >
                {scoreDrift.drifted}
              </span>{' '}
              <span className="text-text-faint">
                deal{scoreDrift.drifted === 1 ? '' : 's'} disagree with their own function
              </span>
            </p>
          )}
        </div>

        {scoreDrift === null ? (
          <p className="mt-1.5 text-2xs text-text-faint">
            The score check did not answer. That is not the same as no drift — it
            means nothing looked.
          </p>
        ) : !scoreDrift.checked ? (
          <p className="mt-1.5 rounded-sm border border-rule bg-bg-raised px-2.5 py-1.5 text-2xs text-text-dim">
            {scoreDrift.error}
          </p>
        ) : scoreDrift.ok ? (
          <p className="mt-1.5 text-2xs text-text-dim">
            Every stored health and MEDDPICC score matches what its function
            produces for that row.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5">
              {scoreDrift.rows.map((r) => (
                <li key={r.deal_id} className="text-2xs">
                  <span className="text-danger">{'\u25CF'}</span>{' '}
                  <span className="font-mono text-text">{r.deal_id}</span>{' '}
                  <span className="text-text-dim">{r.company}</span>{' '}
                  <span className="font-mono tabular-nums text-text-faint">
                    health {r.stored_health} stored / {r.computed_health} computed
                    {r.stored_meddpicc !== r.computed_meddpicc
                      ? ` · meddpicc ${r.stored_meddpicc} / ${r.computed_meddpicc}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
            {scoreDrift.truncated ? (
              <p className="mt-1.5 text-2xs text-text-faint">
                and {scoreDrift.truncated} more — the count above is the whole number.
              </p>
            ) : null}
            <p className="mt-1.5 max-w-measure text-2xs text-text-dim">
              A stored value that disagrees with its own function is worse than a
              wrong one: the derivation claims otherwise. Apply
              supabase/migrations/20260822_health_recompute.sql.
            </p>
          </>
        )}
      </div>

      {/* ── Schema drift ──
          schema.sql declared feed_items.url_hash for the whole life of the feed
          feature and the live table never had it. Nothing in the repo could see
          the difference; the app can, and this is where it says so. Reports
          only — it never blocks anything. */}
      <div className="border-t border-rule pt-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Schema drift</p>
          {/* THE NUMBER THAT SHOULD BE ZERO, SHOWN WHETHER OR NOT IT IS.
              A count that only appears when it is non-zero is a count nobody
              learns the shape of, so a clean run reads the same as a check
              that did not happen. Zero is rendered as a fact, in the same
              place, at the same size. */}
          {drift === null || drift.error ? (
            <p className="text-2xs text-text-faint">
              {drift === null ? 'not checked' : 'could not read'}
            </p>
          ) : (
            <p className="text-2xs">
              <span
                className={cn(
                  'font-mono',
                  drift.blocking > 0 ? 'text-danger' : 'text-success',
                )}
              >
                {drift.blocking}
              </span>{' '}
              <span className="text-text-faint">
                blocking · {drift.notices} notice{drift.notices === 1 ? '' : 's'} ·{' '}
                {drift.checkedTables} tables
              </span>
            </p>
          )}
        </div>

        {drift === null ? (
          <p className="mt-1.5 text-2xs text-text-faint">
            The drift check did not answer. That is not the same as no drift — it
            means nothing looked.
          </p>
        ) : drift.error ? (
          <p className="mt-1.5 rounded-sm border border-rule bg-bg-raised px-2.5 py-1.5 text-2xs text-text-dim">
            {drift.error}
          </p>
        ) : drift.ok ? (
          <p className="mt-1.5 text-2xs text-text-dim">
            Declared and live schema agree across {drift.checkedTables} tables.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5">
              {drift.drift.slice(0, 8).map((d) => (
                <li key={`${d.table}-${d.kind}-${d.detail}`} className="text-2xs">
                  <span className={d.severity === 'blocking' ? 'text-danger' : 'text-text-faint'}>
                    {d.severity === 'blocking' ? '\u25CF' : '\u25CB'}
                  </span>{' '}
                  <span className="font-mono text-text">
                    {d.table}.{d.detail}
                  </span>{' '}
                  <span className="text-text-faint">{d.why}</span>
                </li>
              ))}
            </ul>
            {drift.drift.length > 8 ? (
              <p className="mt-1 text-2xs text-text-faint">
                +{drift.drift.length - 8} more — see /api/schema/drift
              </p>
            ) : null}
          </>
        )}
      </div>

      <ModelHealth models={models} />
    </div>
  );
}

/**
 * MODEL HEALTH — two independent readings, deliberately not folded together.
 *
 * `probes` ask each provider whether the configured model id still exists.
 * `resolutions` record what the last real call actually did, including every
 * provider it fell through on the way. A model can exist and still be
 * rate-limited, and a call can succeed having burned two dead providers to get
 * there — so neither reading answers alone, and one merged number derived from
 * two partial truths is how "six idle jobs" happened.
 */
function ModelHealth({ models }: { models: ModelHealthResponse | null }) {
  return (
    <div className="border-t border-rule pt-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Model health</p>
        <p className="text-2xs text-text-faint">
          {models === null ? 'not checked' : `${models.probes.length} configured`}
        </p>
      </div>

      {models === null ? (
        <p className="mt-1.5 text-2xs text-text-faint">
          The model check did not answer. That is not the same as every model being
          reachable — it means nothing asked.
        </p>
      ) : (
        <>
          <p
            className={cn(
              'mt-1.5 text-2xs',
              models.ok ? 'text-text-dim' : 'text-danger',
            )}
          >
            {models.headline}
          </p>

          <ul className="mt-2 space-y-1.5">
            {models.probes.map((p) => {
              const style = MODEL_STATUS_STYLES[p.status];
              return (
                <li key={`${p.provider}-${p.model}`} className="text-2xs">
                  <span className="inline-flex items-baseline gap-1.5">
                    <span
                      className={cn('mt-1 h-1.5 w-1.5 shrink-0 self-center rounded-full', style.dot)}
                      aria-hidden
                    />
                    <span className="font-mono text-text">{p.model}</span>
                    <span className="text-text-faint">
                      {p.provider} · {style.label}
                      {p.httpStatus ? ` (${p.httpStatus})` : ''}
                    </span>
                  </span>
                  {p.status === 'retired' ? (
                    /* The only row that needs a human. It names the env var
                       rather than the file, because the fix is a deploy
                       setting — nothing here selects a replacement. */
                    <span className="mt-0.5 block max-w-col-clamp text-danger">
                      Gone for good — set <span className="font-mono">{p.envVar}</span>.{' '}
                      {p.alternatives.length
                        ? `Currently offered: ${p.alternatives.slice(0, 6).join(', ')}`
                        : 'The provider returned no alternatives list.'}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {models.fellThroughLastRun.length > 0 ? (
            /* THE FINDING THAT WAS INVISIBLE. A task can report success having
               fallen through two failing providers to get there — the summary
               appears, the sweep goes green, and both cheap tiers are down. */
            <div className="mt-2.5 rounded-sm border border-rule bg-bg-raised px-2.5 py-1.5">
              <p className="text-2xs text-text-dim">
                Fell through on the last real call:
              </p>
              <ul className="mt-1 space-y-0.5">
                {models.fellThroughLastRun.map((f) => (
                  <li key={`${f.provider}-${f.error}`} className="text-2xs text-text-faint">
                    <span className="font-mono text-text-dim">{f.provider}</span> — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {models.resolutions.length > 0 ? (
            <div className="mt-2.5">
              <p className="text-2xs text-text-faint">Last resolved to</p>
              <ul className="mt-1 space-y-0.5">
                {models.resolutions.map((r) => (
                  <li key={r.task} className="text-2xs">
                    <span className="font-mono text-text-dim">{r.task}</span>{' '}
                    <span className={r.resolution?.ok ? 'text-text-faint' : 'text-danger'}>
                      {r.resolution ? (
                        r.resolution.ok ? (
                          /* Split out of a template literal so the time is its
                             own element: `suppressHydrationWarning` applies to
                             a node, and a clock interpolated into a longer
                             string cannot carry one. */
                          <>
                            {r.resolution.provider} · {r.resolution.model} ·{' '}
                            <TimeAgo value={r.resolution.at} />
                          </>
                        ) : (
                          `no provider answered — ${r.resolution.error ?? 'unknown'}`
                        )
                      ) : (
                        'never called'
                      )}
                      {r.stale ? ' · stale' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2.5 text-2xs text-text-faint">
              No task has recorded a resolution yet. Absent, not healthy.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-1.5 pr-3 font-normal text-2xs uppercase tracking-label text-text-faint">{children}</th>;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * DEPLOYED-BEHIND, AS A VISIBLE STATE.
 * ═══════════════════════════════════════════════════════════════
 *
 * A `window_hours: 336` request and a `window_hours: 48` request returned
 * byte-identical bodies for a week. The parameter was in the source and not in
 * the deployment, and the only evidence was a field MISSING from a curl
 * response — which is a signal that works once, for a reader who already knows
 * what the source returns.
 *
 * ⚠️ SILENT WHEN EVERY FUNCTION IS CURRENT, for the same reason the freshness
 * note is: a permanent green row saying "all three at contract 2" is furniture,
 * and furniture goes invisible exactly when it stops being true.
 *
 * `unreachable` is deliberately NOT a finding. It says something about the
 * network this page is rendering on, not about a deployment, and reporting it
 * beside a real version gap would bury the one that matters.
 */
function DeployedBehind({ contracts }: { contracts?: ContractRow[] | null }) {
  if (!contracts || contracts.length === 0) return null;

  const stale = contracts.filter((c) => c.state === 'behind' || c.state === 'unstamped');
  const ahead = contracts.filter((c) => c.state === 'ahead');
  if (stale.length === 0 && ahead.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-card border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger"
    >
      <p className="font-medium">
        {stale.length > 0
          ? `${stale.length} edge function${stale.length > 1 ? 's are' : ' is'} behind this repo.`
          : 'An edge function is deployed from a newer tree than this one.'}
      </p>
      <ul className="mt-1.5 space-y-1">
        {[...stale, ...ahead].map((c) => (
          <li key={c.fn} className="max-w-measure text-xs">
            {c.detail}
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-measure text-xs">
        Redeploy with{' '}
        <span className="font-mono">
          supabase functions deploy {[...stale, ...ahead].map((c) => c.fn).join(' ')} --no-verify-jwt
        </span>
        . See supabase/functions/ROTATION.md.
      </p>
    </div>
  );
}
