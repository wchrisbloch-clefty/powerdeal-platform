import { AlertTriangle } from 'lucide-react';
import { freshnessGapKind, type JobFreshness } from '@/lib/agent-runs';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * "THIS HAS NOT BEEN CHECKED SINCE …"
 * ═══════════════════════════════════════════════════════════════
 *
 * The line a surface shows when the scheduled job behind it has stopped.
 *
 * ══ WHY IT RENDERS NOTHING WHEN THE JOB IS HEALTHY ══
 *
 * A permanent "last updated 20 minutes ago" strip is furniture: it is present
 * on every load, says the same thing every time, and becomes invisible within
 * a week — which is precisely when it needs to be read. So the healthy state
 * is silence, and the component only speaks when there is something wrong.
 *
 * That is a deliberate trade. It means a reader cannot confirm freshness at a
 * glance, and it means the one time this appears, it has not been trained into
 * the background. The full picture — every job, healthy or not, with its last
 * run and duration — is in Settings › Agent health, which is the right place
 * for a table nobody needs most days.
 *
 * ⚠️ THE STATE IT REPORTS IS THE JOB'S, NOT THE DATA'S. A surface that infers
 * freshness from its newest row cannot tell "nothing happened" from "nothing
 * ran", and this product spent five days on the wrong side of that: the CCUS
 * tab rendered two events from the 6th and the 11th while seven consecutive
 * sweeps 401'd, which is byte-for-byte what it renders on five quiet days.
 */
export default function JobFreshnessNote({
  freshness,
  className,
}: {
  /** Null when the job id is unknown — renders nothing rather than guessing. */
  freshness: JobFreshness | null;
  className?: string;
}) {
  if (!freshness) return null;
  const kind = freshnessGapKind(freshness);
  if (!kind) return null;

  const blocked = kind === 'blocked';

  return (
    <p
      role="status"
      className={cn(
        'mb-rhythm-block flex items-start gap-2 rounded-card border px-3 py-2 text-sm',
        blocked
          ? 'border-danger/40 bg-danger/5 text-danger'
          : 'border-gap-rule border-dotted text-text-dim',
        className,
      )}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span className="max-w-measure">{freshness.sentence}</span>
    </p>
  );
}
