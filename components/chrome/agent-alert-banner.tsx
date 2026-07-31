import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { getAgentAlert } from '@/lib/agent-runs';

/**
 * The consecutive-failure banner.
 *
 * Not an email, not a log line — something the operator cannot miss on their
 * next visit. A scheduled job that has failed twice in a row has stopped being
 * a blip and started being a hole in coverage, and the whole point of this
 * layer is that such a hole must not stay invisible.
 *
 * Server-rendered in the app shell so it appears on every screen. A banner that
 * only shows on the page you were already going to check is not an alert.
 */
export default async function AgentAlertBanner() {
  const alert = await getAgentAlert().catch(() => null);
  if (!alert || alert.jobs.length === 0) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-card border border-danger bg-bg-raised px-3.5 py-2.5"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm text-text">
        <AlertTriangle size={14} className="shrink-0 text-danger" aria-hidden />
        <span className="font-medium">
          {alert.jobs.length === 1
            ? `${alert.jobs[0].label} has failed ${alert.jobs[0].failures} times in a row`
            : `${alert.jobs.length} scheduled jobs are failing`}
        </span>
        <Link
          href="/app/settings"
          className="text-accent-dim underline underline-offset-2 hover:text-accent"
        >
          View agent health
        </Link>
      </p>
      {alert.jobs[0].error ? (
        <p className="mt-1 text-xs text-text-dim">{alert.jobs[0].error}</p>
      ) : null}
    </div>
  );
}
