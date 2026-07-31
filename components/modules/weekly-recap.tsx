'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, Loader2, RefreshCw } from 'lucide-react';
import type { WeeklyRecap } from '@/lib/engine/recap';
import { formatDate, cn } from '@/lib/utils';
import { EntityChip } from '@/components/ui/entity-link';
import Button from '@/components/ui/button';

/**
 * WEEKLY RECAP — Market Watch Tier 2, rendered.
 *
 * Deliberately self-contained and placement-agnostic: it fetches its own data
 * and assumes nothing about what surrounds it, so the pending Intelligence IA
 * restructure can move it without touching what it does.
 *
 * The numbers and the narrative are visually separated because they have
 * different warranties. The counts and account list are computed from persisted
 * rows and are facts; the narrative is a model reading those facts. A reader
 * deciding who to call should be able to see which is which.
 */
export default function WeeklyRecapPanel({ className }: { className?: string }) {
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/recap', { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { recap?: WeeklyRecap | null; stale?: boolean }) => {
        setRecap(d.recap ?? null);
        setStale(Boolean(d.stale));
      })
      .catch(() => setRecap(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/recap', { method: 'POST' });
      const body = (await res.json()) as { recap?: WeeklyRecap; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Recap failed.');
      setRecap(body.recap ?? null);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recap failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-dim">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Loading recap…
      </p>
    );
  }

  return (
    <section className={cn('rounded-card border border-rule bg-bg-raised p-4', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CalendarRange size={13} className="text-accent" aria-hidden />
        <span className="eyebrow">This week in the market</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          disabled={busy}
          className="ml-auto"
        >
          <RefreshCw size={13} className={cn(busy && 'animate-spin')} />
          {busy ? 'Building…' : 'Rebuild'}
        </Button>
      </div>

      {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}

      {/*
        No recap yet is the expected state until the first Monday cron fires, or
        until enough sweeps have persisted something to recap. Say that plainly
        rather than rendering an empty shell.
      */}
      {!recap ? (
        <p className="text-sm text-text-dim">
          No recap yet. The sweep persists notable items as it runs and the recap
          is built Mondays — or hit <span className="text-text">Rebuild</span> to
          make one from whatever has accumulated so far.
        </p>
      ) : (
        <>
          <p className="text-xs text-text-faint">
            {formatDate(recap.from)} – {formatDate(recap.to)}
            {stale ? ' · more than a week old' : ''}
          </p>

          {recap.totalItems === 0 ? (
            <p className="mt-2 text-sm text-text-dim">
              Nothing notable was persisted in this window. A quiet week is a
              real answer — it is not a failed recap.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-text-dim">
                <span className="font-mono text-text">{recap.totalItems}</span> notable
                items ·{' '}
                <span className="font-mono text-text">{recap.verifiedCount}</span> from
                primary sources ·{' '}
                <span className="font-mono text-text">{recap.accountsHit.length}</span>{' '}
                account{recap.accountsHit.length === 1 ? '' : 's'} hit
              </p>

              {recap.accountsHit.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow mb-1.5">Accounts to touch first</p>
                  <ul className="flex flex-col gap-2">
                    {recap.accountsHit.slice(0, 5).map((a) => (
                      <li key={a.dealId} className="border-b border-rule-faint pb-2 last:border-0">
                        <Link
                          href={`/app/pipeline/${a.dealId}`}
                          className="text-sm text-text underline decoration-rule underline-offset-2 hover:decoration-accent"
                        >
                          {a.company}
                        </Link>
                        <span className="ml-1.5 font-mono text-[11px] text-text-faint">
                          {a.hits} hit{a.hits === 1 ? '' : 's'}
                        </span>
                        {a.topHeadline ? (
                          <p className="mt-0.5 text-xs text-text-dim">{a.topHeadline}</p>
                        ) : null}
                        {a.outreachHook ? (
                          <p className="mt-0.5 text-xs italic text-accent-dim">
                            → {a.outreachHook}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recap.topMovers.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow mb-1.5">Loudest sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recap.topMovers.map((m) => (
                      <EntityChip
                        key={m.entity}
                        entity={{ name: m.entity, type: 'company' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {recap.narrative ? (
                <div className="mt-3 border-t border-rule pt-3">
                  <p className="eyebrow mb-1.5">The read</p>
                  {recap.narrative.split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="mb-2 text-sm leading-relaxed text-text-dim last:mb-0">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 border-t border-rule pt-3 text-xs text-text-faint">
                  Counts above are computed from persisted rows. The written read
                  needs an AI model configured.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
