'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { AgentJobStatus, AgentStatus } from '@/lib/agent-runs';
import { relativeTime, cn } from '@/lib/utils';
import Button from '@/components/ui/button';

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

interface StatusResponse {
  persistence: boolean;
  note?: string;
  jobs: AgentJobStatus[];
  summary?: { total: number; ok: number; failing: number; stale: number; neverRun: number };
}

export default function AgentHealth() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/agents/status');
      setData((await res.json()) as StatusResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
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

  if (!data) {
    return <p className="text-sm text-text-dim">Could not reach the agent status endpoint.</p>;
  }

  if (!data.persistence) {
    return (
      <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
        {data.note ??
          'Supabase is not configured, so run records cannot be stored. Job status is unknown — not healthy.'}
      </p>
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
                    <span className="block text-tiny text-text-faint">
                      {job.schedule} · {job.runner === 'vercel' ? 'Vercel cron' : 'Supabase pg_cron'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
                      <span className="text-text-dim">{style.label}</span>
                    </span>
                    {job.run?.lastError ? (
                      <span className="mt-0.5 block max-w-col-clamp text-tiny text-danger">
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
                      relativeTime(job.run?.lastSuccessAt ?? job.run?.lastAttemptAt)
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-tiny text-text-dim">
                    {job.run?.itemsProcessed ?? '—'}
                  </td>
                  <td className="py-2 font-mono text-tiny text-text-dim">
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
          <span className="font-mono">{'{CRON_SECRET}'}</span> placeholders that have to be filled
          in first.
        </p>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-1.5 pr-3 font-normal text-tiny uppercase tracking-wider text-text-faint">{children}</th>;
}
