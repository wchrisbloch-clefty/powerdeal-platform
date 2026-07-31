'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import type { Deal, Signal } from '@/lib/types';
import { SIGNAL_TYPES } from '@/lib/types';
import { formatDate, cn } from '@/lib/utils';
import SignalCapture from './signal-capture';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';

/**
 * SIGNALS — a browsable view of intelligence_log.
 *
 * The log has been write-only since it was built: the deal page could add to it
 * and the sweep could read it, but nothing let a rep look across it. A signal
 * layer nobody can browse is a database table, not a product surface.
 *
 * The dual read — what a signal means for the ACCOUNT versus what it means for
 * the BUSINESS — is the reason the layer exists at all, so the two are rendered
 * side by side and given equal weight. Collapsing them into one "summary" is
 * exactly the flattening the schema was designed to prevent: "Valero is
 * expanding Port Arthur" is an account fact; "downstream operators are adding
 * load ahead of the ozone rule" is a market thesis, and the second one is what
 * you take into the next five conversations.
 */

const RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last quarter', days: 90 },
] as const;

export default function SignalsPanel({
  signals,
  deals,
}: {
  signals: Signal[];
  deals: Deal[];
}) {
  const [type, setType] = useState<string>('all');
  const [dealId, setDealId] = useState('all');
  const [range, setRange] = useState<string>('all');
  const [logging, setLogging] = useState(false);
  const [logDealId, setLogDealId] = useState('');

  const logDeal = deals.find((d) => d.id === logDealId) ?? null;

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of signals) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    return counts;
  }, [signals]);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    const cutoff = days ? Date.now() - days * 86_400_000 : null;

    return signals.filter((s) => {
      if (type !== 'all' && s.signal_type !== type) return false;
      if (dealId !== 'all' && !(s.deal_ids ?? []).includes(dealId)) return false;
      if (cutoff && Date.parse(s.logged_at) < cutoff) return false;
      return true;
    });
  }, [signals, type, dealId, range]);

  const dealsWithSignals = useMemo(() => {
    const ids = new Set(signals.flatMap((s) => s.deal_ids ?? []));
    return deals.filter((d) => ids.has(d.id));
  }, [signals, deals]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-text-dim">
          Every signal carries two readings: what it means for the account, and
          what it means for the market. The second is the one that travels to
          other deals.
        </p>
        <Button variant="primary" size="sm" onClick={() => setLogging((v) => !v)}>
          {logging ? <X size={14} /> : <Plus size={14} />}
          {logging ? 'Cancel' : 'Log a signal'}
        </Button>
      </div>

      {/*
        SignalCapture is built for a deal page, where the account is already
        known. Here it is not, so the account gets picked first — a signal with
        no deal behind it cannot be read against an account, which is half the
        point of logging it.
      */}
      {logging && (
        <div className="rounded-card border border-rule bg-bg-raised p-4">
          <div className="mb-3">
            <label className="eyebrow mb-1 block" htmlFor="signal-deal">
              Account this signal is about
            </label>
            <select
              id="signal-deal"
              value={logDealId}
              onChange={(e) => setLogDealId(e.target.value)}
              className="h-tap xl:h-8 w-full max-w-sm rounded-md border border-rule bg-bg px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
            >
              <option value="">Select an account…</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deal_id} · {d.company}
                </option>
              ))}
            </select>
          </div>

          {logDeal ? (
            <SignalCapture deal={logDeal} onClose={() => setLogging(false)} />
          ) : (
            <p className="text-sm text-text-dim">
              Pick the account above and the capture form appears.
            </p>
          )}
        </div>
      )}

      {signals.length === 0 ? (
        <EmptyState
          title="No signals logged yet"
          body="Signals are logged from a feed item's “Act on it → Log as signal”, from a deal page, or with the button above. They are the durable record of what you learned, separate from the news that prompted it."
        />
      ) : (
        <>
          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="scrollbar-thin -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
              <FilterChip active={type === 'all'} onClick={() => setType('all')}>
                All types
              </FilterChip>
              {SIGNAL_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
                <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
                  {t}
                  <span className="ml-1 font-mono text-2xs opacity-60">
                    {typeCounts.get(t)}
                  </span>
                </FilterChip>
              ))}
            </div>

            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Filter by date range"
              className="h-tap xl:h-8 shrink-0 rounded-md border border-rule bg-bg-raised px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>

            {dealsWithSignals.length > 0 && (
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                aria-label="Filter by deal"
                className="h-tap xl:h-8 shrink-0 rounded-md border border-rule bg-bg-raised px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
              >
                <option value="all">All deals</option>
                {dealsWithSignals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deal_id} · {d.company}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Nothing matches this filter" body="Widen the type, range, or deal filter." />
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((signal) => (
                <SignalRow key={signal.id} signal={signal} deals={deals} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SignalRow({ signal, deals }: { signal: Signal; deals: Deal[] }) {
  const hits = (signal.deal_ids ?? [])
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  return (
    <li className="rounded-card border border-rule bg-bg-raised p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{signal.signal_type}</Badge>
        {signal.source_name ? (
          <span className="truncate text-xs text-text-dim">{signal.source_name}</span>
        ) : null}
        <span className="ml-auto whitespace-nowrap text-xs text-text-faint">
          {formatDate(signal.logged_at)}
        </span>
      </div>

      {signal.raw_signal ? (
        <p className="mt-2 text-sm leading-relaxed text-text">{signal.raw_signal}</p>
      ) : null}

      {/* The dual read, side by side. Stacks on narrow screens rather than
          shrinking to two unreadable columns. */}
      {(signal.account_meaning || signal.business_meaning) && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Meaning
            label="What it means for the account"
            body={signal.account_meaning}
          />
          <Meaning
            label="What it means for the business"
            body={signal.business_meaning}
          />
        </div>
      )}

      {signal.so_what ? (
        <p className="mt-2.5 text-sm italic text-accent-dim">→ {signal.so_what}</p>
      ) : null}

      {hits.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-0.5">Deals</span>
          {hits.map((d) => (
            <Link
              key={d.id}
              href={`/app/pipeline/${d.id}`}
              className="inline-flex items-center rounded-full border border-rule bg-bg px-2 py-0.5 text-2xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
            >
              {d.company}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

function Meaning({ label, body }: { label: string; body: string | null }) {
  return (
    <div className="rounded-md border border-rule bg-bg p-2.5">
      <p className="eyebrow mb-1">{label}</p>
      <p className={cn('text-sm', body ? 'text-text-dim' : 'text-text-faint')}>
        {body ?? 'Not recorded.'}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-tap min-w-tap items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors xl:min-h-0 xl:min-w-0',
        active
          ? 'border-accent-border bg-accent-bg text-accent-dim'
          : 'border-rule bg-bg-raised text-text-dim hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
