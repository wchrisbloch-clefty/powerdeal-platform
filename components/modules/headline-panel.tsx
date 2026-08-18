'use client';

import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import type { Headline } from '@/lib/engine/headlines';
import type { HeadlinesPayload, SeedCopy } from '@/lib/seed-state';
import { relativeTime, cn } from '@/lib/utils';
import Button from '@/components/ui/button';

/**
 * HEADLINES — what to read first, and why it ranked there.
 *
 * The `reasons` list is rendered verbatim under every item. That is not
 * decoration: a ranking a reader cannot audit is one they trust blindly or
 * ignore entirely, and both are worse than the reverse-chronological list they
 * already understood. The score itself is never shown — it has no units and
 * saying otherwise would be a fabricated number.
 *
 * `gaps` render too, in the same card. The rule across this build: name what
 * is missing inside the output rather than withholding the output. An item
 * with no summary still appears, still ranks, and says that it has no summary.
 *
 * THE READ STATE IS RENDERED, NOT COERCED. "Could not read" and "nothing yet"
 * look identical unless something insists on the difference, and the mistake
 * is always in the same direction — a broken read wearing a friendly empty
 * state. This build has shipped that three times.
 */

/**
 * ⚠️ IMPORTED, NOT REDECLARED. This was a private interface that agreed with
 * the route by hand, and they stopped agreeing: the route's unconfigured
 * branch omitted `feed_copy`, this file read `feed_copy.title`, and the
 * Intelligence tab went blank on every deployment without a Supabase key.
 * One type, both ends.
 */
type Response = HeadlinesPayload<Headline>;

const TONE_STYLES: Record<SeedCopy['tone'], string> = {
  alert: 'border-danger/40 bg-danger/5 text-danger',
  caution: 'border-warning/40 bg-warning/5 text-text-dim',
  quiet: 'border-rule bg-bg-raised text-text-dim',
  normal: 'border-rule bg-bg-raised text-text-dim',
};

export default function HeadlinePanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/headlines');
      setData((await res.json()) as Response);
    } catch {
      // Distinguished from an empty response for the same reason everything
      // else here is: not reaching the route is not the same as the route
      // finding nothing.
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
        <Loader2 size={14} className="animate-spin" aria-hidden /> Ranking what landed…
      </p>
    );
  }

  if (failed || !data) {
    return (
      <p className={cn('rounded-card border px-3.5 py-2.5 text-sm', TONE_STYLES.alert)}>
        Could not reach the headlines endpoint. This is not the same as there being
        no headlines — nothing was read, so nothing is known either way.
      </p>
    );
  }

  const feedBroken = data.feed_state.kind === 'unreadable';
  const dealsBroken = data.deal_state.kind === 'unreadable';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        {data.summary ? (
          <p className="text-sm text-text-dim">{data.summary}</p>
        ) : null}
        {data.considered > data.headlines.length ? (
          /* Said out loud: a view showing 12 of 60 without saying so reads as
             "there are 12". */
          <p className="text-2xs text-text-faint">
            Top {data.headlines.length} of {data.considered} swept
          </p>
        ) : null}
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      {/* ── The read states, only when they change what the page means ── */}
      {feedBroken ? (
        <div className={cn('rounded-card border px-3.5 py-2.5', TONE_STYLES.alert)}>
          <p className="text-sm">{data.feed_copy.title}</p>
          <p className="mt-0.5 text-2xs">{data.feed_copy.body}</p>
        </div>
      ) : null}

      {dealsBroken ? (
        <div className={cn('rounded-card border px-3.5 py-2.5', TONE_STYLES.alert)}>
          <p className="text-sm">{data.deal_copy.title}</p>
          <p className="mt-0.5 text-2xs">
            {data.deal_copy.body} Items below are still ranked, on provenance and
            recency only — nothing could be mapped to an account.
          </p>
        </div>
      ) : null}

      {data.feed_state.kind === 'seeded' ? (
        <div className={cn('rounded-card border px-3.5 py-2.5', TONE_STYLES.caution)}>
          <p className="text-sm text-text">{data.feed_copy.title}</p>
          <p className="mt-0.5 text-2xs">{data.feed_copy.body}</p>
        </div>
      ) : null}

      {data.headlines.length === 0 ? (
        <div className={cn('rounded-card border px-3.5 py-2.5', TONE_STYLES.quiet)}>
          {feedBroken ? (
            <p className="text-sm">
              Nothing to rank, because nothing could be read. See above.
            </p>
          ) : (
            <>
              <p className="text-sm text-text">Nothing swept yet</p>
              <p className="mt-0.5 text-2xs">
                The read succeeded and <span className="text-text">feed_items</span> is
                genuinely empty. The daily sweep runs at 10:00 UTC, or press Sweep on
                the Feed tab.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {data.headlines.map((h, i) => (
            <li
              key={h.item.id}
              className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5"
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-2xs text-text-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text">
                    {h.item.url ? (
                      <a
                        href={h.item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-baseline gap-1 hover:underline"
                      >
                        {h.item.title}
                        <ExternalLink size={11} className="shrink-0" aria-hidden />
                      </a>
                    ) : (
                      h.item.title
                    )}
                  </p>

                  <p className="mt-0.5 text-2xs text-text-faint">
                    {h.item.source_name ?? 'Unknown source'} ·{' '}
                    {relativeTime(h.item.published_at ?? h.item.cached_at)} · {h.item.tier}
                  </p>

                  {h.item.synthesis ? (
                    <p className="mt-1 text-xs text-text-dim">{h.item.synthesis}</p>
                  ) : null}

                  {h.accounts.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {h.accounts.map((a) => (
                        <span
                          key={a.dealId}
                          className="rounded-sm border border-rule px-1.5 py-0.5 text-2xs text-text-dim"
                        >
                          {a.company} · {a.stage}
                        </span>
                      ))}
                    </p>
                  ) : null}

                  {h.hook ? (
                    <p className="mt-1.5 text-2xs text-text-dim">
                      <span className="text-text-faint">Hook</span> — {h.hook}
                    </p>
                  ) : null}

                  {/* WHY IT RANKED HERE. Rendered every time, not on hover. */}
                  <p className="mt-1.5 text-2xs text-text-faint">
                    {h.reasons.length > 0 ? h.reasons.join(' · ') : 'Ranked on recency alone'}
                  </p>

                  {/* WHAT IT DOES NOT HAVE. Named in the output, never a
                      reason to withhold the output. */}
                  {h.gaps.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {h.gaps.map((g) => (
                        <li key={g} className="text-2xs text-text-faint">
                          ○ {g}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
