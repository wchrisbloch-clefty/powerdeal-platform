'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
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

/**
 * ═══════════════════════════════════════════════════════════════
 * EIGHTEEN COLUMNS, AND THE TWO THAT SAY WHAT TO DO WERE OFF-SCREEN.
 * ═══════════════════════════════════════════════════════════════
 *
 * The table scrolls horizontally, and the order it scrolled in put the
 * IDENTIFYING columns first and the ACTIONABLE ones last: Next move was 16th
 * of 18 and Risk was 17th. At 1440 the reader saw Health through Days and had
 * to scroll right to find out what to do about any of it — on the surface
 * whose entire job is deciding what to work on today.
 *
 * ══ THREE ALARM COLUMNS BECAME ONE ══
 *
 * Thread, Event and Decision each rendered their own warning triangle, in
 * three adjacent columns, each answering a slice of one question: what is
 * missing on this deal. Three triangles in a row read as three problems and
 * scanned as noise; the eye cannot rank them because they are drawn
 * identically.
 *
 * `riskFlags` already computes exactly this, already ranks by severity, and
 * was already being used for the mobile card and the Risk column — so the
 * three columns were a second, dumber implementation of a function sitting in
 * the same file's imports. Collapsed into Risk, which now leads with the worst
 * flag rather than listing all of them at equal volume.
 *
 * NOTHING IS LOST. None of the three was sortable (`key: null`), and every
 * flag they showed is in `riskFlags` under the same severity rules — the same
 * "looks healthy but isn't" danger colour on a deal scoring above 5.
 *
 * ⚠️ THE IDENTIFYING COLUMNS STAY, AND THEY STAY IN ORDER. Deal ID, Vertical,
 * Rel., State, Utility, Beachhead are how a reader confirms they are looking
 * at the right row. Demoting them to a quieter tone is a hierarchy decision;
 * removing them would be a different product.
 */
const COLUMNS: Column[] = [
  // ── What needs work, and what the work is ──
  { key: 'health_score', label: 'Health', className: 'w-col-xs' },
  { key: 'company', label: 'Company', className: 'min-w-col-wide-min' },
  { key: null, label: 'Risk', className: 'min-w-col-wide-min' },
  { key: null, label: 'Next move', className: 'min-w-col-widest-min' },
  // ── Where it is ──
  { key: 'stage', label: 'Stage', className: 'min-w-col-text-min' },
  { key: 'days_in_stage', label: 'Days', className: 'w-col-xs', numeric: true },
  { key: 'meddpicc_score', label: 'MEDD', className: 'w-col-sm', numeric: true },
  { key: 'size_mw', label: 'MW', className: 'w-col-md', numeric: true },
  // ── Which row this is ──
  { key: 'deal_id', label: 'Deal ID', className: 'w-col-xl' },
  { key: 'vertical', label: 'Vertical', className: 'min-w-col-text-min' },
  { key: null, label: 'Rel.', className: 'w-col-sm' },
  { key: 'state', label: 'State', className: 'w-col-tiny' },
  { key: 'utility', label: 'Utility', className: 'min-w-col-name-min' },
  { key: null, label: 'Beachhead', className: 'min-w-col-text-min' },
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
                        // ⚠️ THE TAP TARGET IS THE PADDING, NOT THE LABEL.
                        // These were 58x16 — a 16px-tall control on a touch
                        // screen, in a header row that is the primary way the
                        // table gets reordered. `-my-2 py-2` grows the hit box
                        // into the cell's existing padding without moving the
                        // header text a pixel, so the row height is unchanged
                        // and the target clears the floor.
                        'inline-flex items-center gap-1 hover:text-text',
                        '-my-2 min-h-tap py-2 lg:min-h-0 lg:py-0',
                        /*
                          ⚠️ min-w-tap, AND I FIXED THE WRONG THING FIRST.
                          "Sort by Days" and "Sort by MEDD" measured 43x44 on
                          iPad — one pixel under, on the two shortest labels.
                          I read that as the column constraining the button and
                          widened both columns a size. The next run returned the
                          identical 43x44.

                          The button is `inline-flex`, so it SHRINK-WRAPS its
                          content and the column width never reaches it: "Days"
                          at text-2xs plus a 10px icon and a 4px gap is 43px,
                          and it would be 43px in a column twice as wide. The
                          measurement not moving is what said so — a fix that
                          changes nothing is evidence about the diagnosis, not
                          a smaller version of the fix.

                          Justified only where a finger is the pointer, so the
                          desktop header keeps its natural width.
                        */
                        'min-w-tap justify-start lg:min-w-0',
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
                  {/* ── What needs work, and what the work is ── */}
                  <td className="px-2.5 py-2">
                    <HealthRing score={deal.health_score} size={28} />
                  </td>

                  {/* ⚠️ `stalled` WAS COMPUTED AND NEVER RENDERED. The row
                      knew a deal had not moved in over 30 days and showed it
                      nowhere. It rides with the company name because that is
                      the cell the eye lands on. */}
                  <td className="px-2.5 py-2 font-medium text-text">
                    {deal.company}
                    {stalled ? (
                      <span
                        title={`No stage movement in ${deal.days_in_stage} days`}
                        className="ml-1.5 font-mono text-2xs font-normal uppercase tracking-label text-warning"
                      >
                        stalled
                      </span>
                    ) : null}
                  </td>

                  {/* Two flags maximum, then a count. A row that renders every
                      flag becomes a wall of red chips and stops being scannable
                      — which is the opposite of what a warning is for.

                      ⚠️ THIS NOW CARRIES WHAT THREE COLUMNS USED TO. Thread,
                      Event and Decision each drew their own warning triangle in
                      adjacent columns; riskFlags already computed all three,
                      already ranked them by severity, and was already feeding
                      this cell. The three columns were a second implementation
                      of a function imported at the top of this file. */}
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

                  <td
                    className={cn(
                      'max-w-col-clamp truncate px-2.5 py-2',
                      deal.next_move ? 'text-text' : 'text-text-faint',
                    )}
                  >
                    {deal.next_move ?? '—'}
                  </td>

                  {/* ── Where it is ── */}
                  <td className="px-2.5 py-2">
                    <StagePill stage={deal.stage} />
                  </td>
                  <td
                    className={cn(
                      'px-2.5 py-2 text-right tabular-nums',
                      stalled ? 'font-medium text-danger' : 'text-text-dim',
                    )}
                  >
                    {deal.days_in_stage}
                  </td>
                  {/* 0/8 is a gap wearing a number. It read at the same
                      weight as 6/8, so a scorecard nobody has started looked
                      like one somebody had. */}
                  <td
                    className={cn(
                      'px-2.5 py-2 text-right font-mono tabular-nums',
                      deal.meddpicc_score === 0 ? 'text-text-faint' : 'text-text-dim',
                    )}
                  >
                    {deal.meddpicc_score}/8
                  </td>
                  <td
                    className={cn(
                      'px-2.5 py-2 text-right tabular-nums',
                      deal.size_mw ? 'text-text-dim' : 'text-text-faint',
                    )}
                  >
                    {deal.size_mw ? formatMw(deal.size_mw).replace(' MW', '') : '—'}
                  </td>

                  {/* ── Which row this is ──
                      ⚠️ AN ABSENT VALUE MUST NOT WEIGH THE SAME AS A PRESENT
                      ONE. Every context cell was `text-text-dim`, so "SDG&E"
                      and "—" read at identical strength and a row of gaps
                      looked exactly as populated as a row of facts. `Cell`
                      drops an em dash to `text-faint`, the gap system's own
                      quiet tone, so a filled row reads denser than an empty one
                      at a glance — which is the whole point of scanning. */}
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-2xs text-text-faint">
                    {deal.deal_id}
                  </td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.vertical}</td>
                  <td className="px-2.5 py-2 text-text-dim">{deal.relationship_type}</td>
                  <Cell value={deal.state} />
                  <Cell value={deal.utility} />
                  <Cell value={deal.beachhead_site} className="max-w-col-wide-min truncate" />
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

/**
 * A context cell. Present values read at `text-dim`, absent ones at
 * `text-faint`.
 *
 * ⚠️ THE DIFFERENCE IS THE HIERARCHY. Twelve columns at one weight is a wall,
 * and the wall is what made this table hard to scan: an em dash carried
 * exactly as much visual weight as a utility name, so a row with three gaps
 * looked as complete as a row with none.
 */
function Cell({ value, className }: { value?: string | null; className?: string }) {
  return (
    <td className={cn('px-2.5 py-2', value ? 'text-text-dim' : 'text-text-faint', className)}>
      {value || '—'}
    </td>
  );
}
