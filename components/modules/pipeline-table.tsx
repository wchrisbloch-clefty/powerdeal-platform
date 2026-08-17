'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpDown, CheckCircle2 } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { riskFlags } from '@/lib/deals';
import { formatMw, formatDate, cn } from '@/lib/utils';
import HealthRing from '@/components/ui/health-ring';
import DealCard from '@/components/ui/deal-card';
import { StagePill } from '@/components/ui/badge';

/**
 * Sortable pipeline table.
 *
 * Below `md` the table is replaced entirely by a card stack — a 17-column
 * table has no honest mobile representation, and horizontal scroll on a
 * 375px screen is not a design.
 */

type SortKey =
  | 'deal_id' | 'company' | 'vertical' | 'state' | 'utility' | 'stage'
  | 'size_mw' | 'meddpicc_score' | 'health_score' | 'days_in_stage' | 'updated_at';

interface Column {
  key: SortKey | null;
  label: string;
  className?: string;
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'health_score', label: 'Health', className: 'w-col-xs' },
  { key: 'deal_id', label: 'Deal ID', className: 'w-col-xl' },
  { key: 'company', label: 'Company', className: 'min-w-col-wide-min' },
  { key: 'vertical', label: 'Vertical', className: 'min-w-col-text-min' },
  { key: null, label: 'Rel.', className: 'w-col-sm' },
  { key: 'state', label: 'State', className: 'w-col-tiny' },
  { key: 'utility', label: 'Utility', className: 'min-w-col-name-min' },
  { key: null, label: 'Beachhead', className: 'min-w-col-text-min' },
  { key: 'stage', label: 'Stage', className: 'min-w-col-text-min' },
  { key: 'size_mw', label: 'MW', className: 'w-col-md', numeric: true },
  { key: 'meddpicc_score', label: 'MEDD', className: 'w-col-sm', numeric: true },
  { key: null, label: 'Thread', className: 'w-col-md' },
  { key: null, label: 'Event', className: 'w-col-md' },
  { key: null, label: 'Decision', className: 'w-col-lg' },
  { key: 'days_in_stage', label: 'Days', className: 'w-col-xs', numeric: true },
  { key: null, label: 'Next move', className: 'min-w-col-widest-min' },
  { key: null, label: 'Risk', className: 'min-w-col-wide-min' },
  { key: 'updated_at', label: 'Updated', className: 'w-col-2xl' },
];

export default function PipelineTable({ deals }: { deals: Deal[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('health_score');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const out = [...deals];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      // Nulls always sort last regardless of direction — an unknown value is
      // not "small", and floating them to the top buries the real data.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;

      if (typeof av === 'number' && typeof bv === 'number') {
        return asc ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return asc ? cmp : -cmp;
    });
    return out;
  }, [deals, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      // Health defaults ascending (worst first); everything else descending.
      setAsc(key === 'health_score' || key === 'company' || key === 'deal_id');
    }
  }

  if (deals.length === 0) {
    return (
      <p className="rounded-card border border-rule bg-bg-raised px-4 py-10 text-center text-sm text-text-dim">
        No deals match these filters.
      </p>
    );
  }

  return (
    <>
      {/* ── Mobile: card stack ── */}
      <div className="space-y-2.5 md:hidden">
        {sorted.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="scrollbar-thin hidden overflow-x-auto rounded-card border border-rule md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule bg-bg-raised">
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-2.5 py-2 text-left font-mono text-2xs',
                    'uppercase tracking-label text-text-faint',
                    col.numeric && 'text-right',
                    col.className,
                  )}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key as SortKey)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-text',
                        sortKey === col.key && 'text-text',
                      )}
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      <ArrowUpDown size={10} strokeWidth={2} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((deal) => {
              const flags = riskFlags(deal);
              const stalled = deal.days_in_stage > 30;

              return (
                <tr
                  key={deal.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/app/pipeline/${deal.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/app/pipeline/${deal.id}`);
                    }
                  }}
                  className="cursor-pointer border-b border-rule-faint bg-bg transition-colors last:border-0 hover:bg-bg-raised"
                >
                  <td className="px-2.5 py-2">
                    <HealthRing score={deal.health_score} size={28} />
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-2xs text-text-dim">
                    {deal.deal_id}
                  </td>
                  <td className="px-2.5 py-2 font-medium text-text">{deal.company}</td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.vertical}</td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.relationship_type}</td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.state ?? '—'}</td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.utility ?? '—'}</td>
                  <td className="max-w-col-wide-min truncate px-2.5 py-2 text-text-dim">
                    {deal.beachhead_site ?? '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <StagePill stage={deal.stage} />
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-text-dim">
                    {deal.size_mw ? formatMw(deal.size_mw).replace(' MW', '') : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-text-dim">
                    {deal.meddpicc_score}/8
                  </td>

                  {/* Single-thread alarm: red when the deal otherwise looks healthy. */}
                  <td className="px-2.5 py-2">
                    {deal.multi_threaded ? (
                      <span className="text-xs text-text-dim">Multi</span>
                    ) : (
                      <span
                        title="Single-threaded — health is capped at 6"
                        className={cn(
                          'inline-flex items-center gap-1 text-xs',
                          deal.health_score > 5 ? 'text-danger' : 'text-warning',
                        )}
                      >
                        <AlertTriangle size={12} strokeWidth={2} />
                        Single
                      </span>
                    )}
                  </td>

                  {/* Deliberately mirrors the Thread cell above — same shape,
                      same cap, same "looks healthy but isn't" danger colour.
                      Two independent 6-caps read as one idea when they read
                      the same way. */}
                  <td className="px-2.5 py-2">
                    {deal.critical_event?.trim() ? (
                      <span
                        className="text-xs text-text-dim"
                        title={
                          deal.critical_event_date
                            ? `${deal.critical_event} · ${deal.critical_event_date}`
                            : `${deal.critical_event} · no date on record`
                        }
                      >
                        Set
                      </span>
                    ) : (
                      <span
                        title="No critical event — health is capped at 6"
                        className={cn(
                          'inline-flex items-center gap-1 text-xs',
                          deal.health_score > 5 ? 'text-danger' : 'text-warning',
                        )}
                      >
                        <AlertTriangle size={12} strokeWidth={2} />
                        None
                      </span>
                    )}
                  </td>

                  <td className="px-2.5 py-2">
                    {deal.decision_mapped ? (
                      <CheckCircle2 size={14} strokeWidth={2} className="text-success" />
                    ) : (
                      <AlertTriangle size={14} strokeWidth={2} className="text-warning" />
                    )}
                  </td>

                  <td
                    className={cn(
                      'px-2.5 py-2 text-right tabular-nums',
                      stalled ? 'font-medium text-danger' : 'text-text-dim',
                    )}
                  >
                    {deal.days_in_stage}
                  </td>

                  <td className="max-w-col-clamp truncate px-2.5 py-2 text-text-dim">
                    {deal.next_move ?? '—'}
                  </td>

                  {/* Two flags maximum, then a count. A row that renders every
                      flag becomes a wall of red chips and stops being scannable
                      — which is the opposite of what a warning is for. */}
                  <td className="max-w-col-widest-min px-2.5 py-2">
                    {flags.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {flags.slice(0, 2).map((f) => (
                          <span
                            key={f.key}
                            className={cn(
                              'inline-flex items-center rounded-sm px-1.5 py-0.5 text-2xs uppercase tracking-label',
                              f.severity === 'danger'
                                ? 'bg-danger-bg text-danger'
                                : 'bg-bg-overlay text-warning',
                            )}
                          >
                            {f.label}
                          </span>
                        ))}
                        {flags.length > 2 ? (
                          <span
                            className="text-2xs text-text-faint"
                            title={flags.slice(2).map((f) => f.label).join(', ')}
                          >
                            +{flags.length - 2} more
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="truncate text-xs text-text-faint">
                        {deal.key_risk ?? '—'}
                      </span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-2.5 py-2 text-xs text-text-faint">
                    {formatDate(deal.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
