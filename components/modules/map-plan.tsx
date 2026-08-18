'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, EyeOff, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MILESTONE_STATUSES,
  applySlip,
  championSignal,
  championSignalLabel,
  daysBetween,
  energizeDate,
  inDateOrder,
  ownerOf,
  planAnnotations,
  propagate,
  toIso,
} from '@/lib/map/schedule';
import { exportWarnings, withheldFrom } from '@/lib/annotations';
import { mapToMarkdown } from '@/lib/map/export';
import type { MapPlan, Milestone, MilestoneStatus } from '@/lib/map/schedule';

/**
 * MAP v2 — live mode.
 *
 * The slip preview is the load-bearing interaction. Changing a date shows what
 * moves downstream and what it does to the energize date BEFORE the change is
 * committed, which is what turns the document from our timeline into their
 * problem. A plan that silently reshuffles is a plan nobody trusts.
 */
export default function MapPlanPanel({
  dealId,
  company,
  dealCode,
  initial,
  businessCaseExists,
  criticalEvent,
  criticalEventDate,
}: {
  dealId: string;
  company: string;
  dealCode: string;
  initial: MapPlan;
  businessCaseExists: boolean;
  criticalEvent?: string | null;
  criticalEventDate?: string | null;
}) {
  const [plan, setPlan] = useState<MapPlan>(initial);
  const [pending, setPending] = useState<{ id: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = toIso(Date.now());
  // The app is the internal surface, so it sees everything.
  const notes = useMemo(() => planAnnotations(plan, today), [plan, today]);
  // ...and is told which of those the export will withhold, so the operator is
  // never surprised by what the champion does or does not receive.
  const withheld = useMemo(() => new Set(withheldFrom(notes, 'external').map((n) => n.id)), [notes]);
  // Withholding the MESSAGE does not hide the DATA. These are the defects a
  // reader can still see in the exported table, so they get a notice at the
  // point of export rather than only in the list above.
  const preExport = useMemo(() => exportWarnings(notes), [notes]);
  // Derived, never stored — the header and the Energize row are the same
  // number by construction. See energizeDate().
  const energize = energizeDate(plan);
  // Read order is chronological; the dependency graph stays in its own column.
  const rows = useMemo(() => inDateOrder(plan.milestones), [plan.milestones]);
  const signal = championSignal(plan);

  // Previewed, not applied. The user sees the blast radius and then decides.
  const preview = useMemo(
    () => (pending ? propagate(plan, pending.id, pending.date, today) : null),
    [plan, pending, today],
  );

  function commit() {
    if (!pending) return;
    setPlan((p) => applySlip(p, pending.id, pending.date));
    setPending(null);
  }

  function patch(id: string, fields: Partial<Milestone>) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => (m.id === id ? { ...m, ...fields } : m)),
    }));
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, plan }),
      });
      const json = await res.json();
      setNotice(res.ok ? 'Saved.' : `Save failed: ${json.error ?? res.status}`);
    } catch (err) {
      setNotice(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Export mode. Renders the CURRENT on-screen plan, including unsaved edits —
   * exporting the last saved version while the user is looking at a changed one
   * would hand them a document that contradicts their screen.
   */
  async function exportDocx() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          action: 'map',
          format: 'docx',
          title: `${company} — Mutual action plan`,
          content: mapToMarkdown(plan, {
            company,
            dealId: dealCode,
            today,
            criticalEvent,
            criticalEventDate,
          }),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setNotice(json.error ?? `Export failed (${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dealCode}-map.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Guidance, never blocking — the MAP generates and edits regardless. */}
      {!businessCaseExists ? (
        <p className="rounded-card border border-rule bg-bg-raised px-3 py-2 text-xs text-text-dim">
          No business case saved for this deal yet. A MAP works without one; it lands harder
          with one, because the &ldquo;why&rdquo; is what gets the dates taken seriously.
        </p>
      ) : null}

      {/* Absence is stated, not omitted — a MAP with no forcing function is a
          schedule, and the document says so rather than looking complete. */}
      {criticalEvent?.trim() ? (
        <div className="rounded-card border border-accent-border bg-accent-bg px-3.5 py-2.5">
          <p className="eyebrow">Critical event</p>
          <p className="mt-1 text-sm text-text">
            {criticalEvent}
            {criticalEventDate ? (
              <span className="ml-1 font-mono text-xs text-text-dim">· {criticalEventDate}</span>
            ) : (
              <span className="ml-1 text-xs text-text-dim">· no date on record</span>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-card border border-warning bg-bg-raised px-3.5 py-2.5">
          <p className="eyebrow">Critical event</p>
          <p className="mt-1 text-sm text-text">
            None on record. These dates are a sequence, not a deadline — nothing here forces a
            decision. This is also what caps the deal&rsquo;s health at 6.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Target energize</p>
          <p className="font-mono text-xl text-text tabular-nums">
            {energize ?? '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Champion</p>
          <p className="text-xs text-text-dim">{championSignalLabel(signal)}</p>
        </div>
      </div>

      {notes.length > 0 ? (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li
              key={n.id}
              className={cn(
                'flex items-start gap-2 rounded-card border px-3 py-2 text-xs text-text',
                n.severity === 'error'
                  ? 'border-danger bg-danger-bg'
                  : 'border-warning bg-bg-raised',
              )}
            >
              {n.severity === 'error' ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              ) : (
                <EyeOff size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              )}
              <span>
                <span className="font-medium">{n.title}</span> — {n.detail}
                {withheld.has(n.id) ? (
                  <span className="ml-1 font-mono text-2xs uppercase tracking-label text-text-faint">
                    · not in the export
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── Slip preview ── */}
      {preview ? (
        <div className="rounded-card border border-warning bg-bg-raised p-3">
          <p className="eyebrow">If this date moves</p>
          {preview.error ? (
            <p className="mt-1 text-xs text-danger">{preview.error}</p>
          ) : (
            <>
              {preview.shifted.length === 0 ? (
                <p className="mt-1 text-xs text-text-dim">
                  Nothing downstream moves — this milestone has float.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {preview.shifted.map((s) => (
                    <li key={s.id} className="font-mono text-2xs text-text-dim tabular-nums">
                      {s.label}: {s.from ?? '—'} → {s.to}
                    </li>
                  ))}
                </ul>
              )}
              <p
                className={cn(
                  'mt-2 text-xs',
                  preview.energizeShiftDays && preview.energizeShiftDays > 0
                    ? 'text-danger'
                    : 'text-text-dim',
                )}
              >
                Energize:{' '}
                {preview.energizeShiftDays === null
                  ? 'no target set'
                  : preview.energizeShiftDays === 0
                    ? 'unchanged — absorbed by float'
                    : `slips ${preview.energizeShiftDays} days to ${preview.newEnergizeDate}`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={commit}
                  className="min-h-tap lg:min-h-tap-sm rounded-sm border border-accent-mark bg-accent-bg px-2.5 text-xs text-accent-dim"
                >
                  Apply
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="min-h-tap lg:min-h-tap-sm rounded-sm border border-rule px-2.5 text-xs text-text-dim"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ── Milestones ── */}
      <ul className="space-y-2">
        {rows.map((m) => {
          const slipDays = m.date ? daysBetween(today, m.date) : null;
          return (
            <li
              key={m.id}
              className={cn(
                'rounded-card border p-2.5',
                m.status === 'done'
                  ? 'border-rule-faint opacity-70'
                  : m.status === 'blocked'
                    ? 'border-danger'
                    : 'border-rule',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-col-wide-min flex-1 text-sm text-text">{m.label}</span>

                <input
                  type="text"
                  aria-label={`${m.label} owner`}
                  placeholder={ownerOf(m)}
                  value={m.owner ?? ''}
                  onChange={(e) => patch(m.id, { owner: e.target.value || null })}
                  className="min-h-tap lg:min-h-tap-sm w-28 rounded-sm border border-rule bg-bg px-1.5 text-xs text-text focus:border-accent-mark focus:outline-none"
                />

                <input
                  type="date"
                  aria-label={`${m.label} date`}
                  value={m.date ?? ''}
                  onChange={(e) => setPending({ id: m.id, date: e.target.value })}
                  className="min-h-tap lg:min-h-tap-sm rounded-sm border border-rule bg-bg px-1.5 font-mono text-xs text-text focus:border-accent-mark focus:outline-none"
                />

                <select
                  aria-label={`${m.label} status`}
                  value={m.status}
                  onChange={(e) => patch(m.id, { status: e.target.value as MilestoneStatus })}
                  className="min-h-tap lg:min-h-tap-sm rounded-sm border border-rule bg-bg px-1.5 text-xs text-text focus:border-accent-mark focus:outline-none"
                >
                  {MILESTONE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {m.dependsOn.length > 0 || slipDays !== null ? (
                <p className="mt-1 font-mono text-2xs text-text-faint">
                  {m.dependsOn.length > 0 ? `after ${m.dependsOn.join(', ')}` : ''}
                  {m.dependsOn.length > 0 && slipDays !== null ? ' · ' : ''}
                  {slipDays !== null && m.status !== 'done'
                    ? slipDays < 0
                      ? `${Math.abs(slipDays)}d overdue`
                      : `in ${slipDays}d`
                    : ''}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {preExport.length > 0 ? (
        <div className="rounded-card border border-warning bg-bg-raised px-3 py-2">
          <p className="flex items-start gap-2 text-xs text-text">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span>
              This plan carries a record defect that will be visible in the exported document
              — correct it before sending.{' '}
              <span className="text-text-dim">
                The warning text is withheld from the export, but the rows it describes are
                not: {preExport.map((n) => n.title).join(', ')}.
              </span>
            </span>
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex min-h-tap lg:min-h-tap-sm items-center gap-1.5 rounded-sm border border-rule px-2.5 text-xs text-text hover:border-accent-mark disabled:opacity-50"
        >
          <Save size={13} strokeWidth={1.75} aria-hidden />
          {busy ? 'Working…' : 'Save plan'}
        </button>
        <button
          onClick={exportDocx}
          disabled={busy}
          className="inline-flex min-h-tap lg:min-h-tap-sm items-center gap-1.5 rounded-sm border border-rule px-2.5 text-xs text-text hover:border-accent-mark disabled:opacity-50"
        >
          <Download size={13} strokeWidth={1.75} aria-hidden />
          Export DOCX
        </button>
        {notice ? (
          <span role="status" className="text-xs text-text-dim">
            {notice}
          </span>
        ) : null}
      </div>
    </div>
  );
}
