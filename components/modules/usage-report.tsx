'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatMs, type UsageReport as Report } from '@/lib/usage';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import TimeAgo from '@/components/ui/time-ago';

/**
 * THE WEEK, AS RECORDED RATHER THAN AS REMEMBERED.
 *
 * Read at the END of the usage week, not during it. The order below is
 * deliberate and is the opposite of what a dashboard usually does:
 *
 *   1. WHAT WAS NEVER OPENED. First, because it is the finding no amount of
 *      reflection produces — nobody remembers not doing something — and
 *      because it is the one that changes what gets built next.
 *   2. THE WISHES. Captured at the moment of friction, with the surface they
 *      were written from.
 *   3. WHERE THE TIME WENT. Opens and dwell side by side, never averaged:
 *      twenty eight-second visits and one ten-minute visit are different
 *      facts and one number cannot hold both.
 *   4. WHAT WAS DONE, and how often it failed.
 *
 * No score. No engagement index. One operator, one week — a derived number
 * would have no denominator and would read as a finding anyway.
 */

interface Response extends Report {
  available: boolean;
  reason?: string;
  headline: string;
}

export default function UsageReport() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/usage');
      setData((await res.json()) as Response);
    } catch {
      setData(null);
      setFailed(true);
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
        <Loader2 size={14} className="animate-spin" aria-hidden /> Reading the week…
      </p>
    );
  }

  // Could-not-read and nothing-recorded are separated here for the same reason
  // they are everywhere else in this build.
  if (failed || !data) {
    return (
      <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
        Could not reach the usage endpoint. Nothing is known about the week — which
        is not the same as the week being empty.
      </p>
    );
  }

  if (!data.available) {
    return (
      <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
        {data.reason}
      </p>
    );
  }

  return (
    <div className="space-y-rhythm-page">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm text-text-dim">{data.headline}</p>
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      {/* ── 1. Never opened. First on purpose. ── */}
      {data.neverOpened.length > 0 ? (
        <div>
          <p className="eyebrow">Never opened</p>
          <p className="mt-1 text-2xs text-text-faint">
            The finding recollection cannot produce. Each of these exists, is
            reachable, and was not used once.
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {data.neverOpened.map((s) => (
              <li
                key={s.path}
                className="rounded-sm border border-warning/40 bg-warning/5 px-1.5 py-0.5 text-2xs text-text-dim"
              >
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 2. Wishes, newest first. ── */}
      <div className="border-t border-rule pt-3">
        <p className="eyebrow">I wish it just…</p>
        {data.wishes.length === 0 ? (
          <p className="mt-1 text-2xs text-text-faint">
            Nothing captured. The box is bottom-right on every surface.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {data.wishes.map((w, i) => (
              <li key={`${w.at}-${i}`} className="text-xs">
                <p className="text-text">{w.text}</p>
                <p className="text-2xs text-text-faint">
                  <span className="font-mono">{w.path}</span> · <TimeAgo value={w.at} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 3. Where the time went. Opens and dwell, never averaged. ── */}
      <div className="border-t border-rule pt-3">
        <p className="eyebrow">Where the time went</p>
        <div className="scrollbar-thin mt-1.5 overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-rule text-left text-text-faint">
                <th className="pb-1 pr-3 font-normal">Surface</th>
                <th className="pb-1 pr-3 font-normal">Opens</th>
                <th className="pb-1 pr-3 font-normal">Time</th>
                <th className="pb-1 font-normal">Last</th>
              </tr>
            </thead>
            <tbody>
              {data.surfaces.map((s) => (
                <tr
                  key={s.path}
                  className={cn(
                    'border-b border-rule-faint last:border-0',
                    s.neverOpened && 'text-text-faint',
                  )}
                >
                  <td className="py-1 pr-3">{s.label}</td>
                  <td className="py-1 pr-3 font-mono">{s.openedCount}</td>
                  <td className="py-1 pr-3 font-mono">{formatMs(s.totalMs)}</td>
                  <td className="py-1 text-text-faint">
                    <TimeAgo value={s.lastAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. What was done, and what failed doing it. ── */}
      {data.actionTally.length > 0 ? (
        <div className="border-t border-rule pt-3">
          <p className="eyebrow">What got used</p>
          <ul className="mt-1.5 space-y-0.5">
            {data.actionTally.map((a) => (
              <li key={a.action} className="text-2xs">
                <span className="font-mono text-text-dim">{a.action}</span>{' '}
                <span className="text-text-faint">×{a.count}</span>
                {a.failures > 0 ? (
                  <span className="text-danger"> · {a.failures} failed</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
