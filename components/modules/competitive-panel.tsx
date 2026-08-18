'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, FileText, Plus, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import {
  cardControls, gridNameIsGeneric, presenceGrid, type PresenceRow,
} from '@/lib/competitor-catalog';
import { COMPETITOR_TIERS, TIER_LABELS, type CompetitorTier, type Deal, type DealCompetitor } from '@/lib/types';

/**
 * COMPETITIVE PRESENCE — a toggle grid, not a form.
 *
 * The question "who is in this deal?" has a known answer set almost every time,
 * so it is asked as switches over that set with the common case already on. The
 * previous per-competitor form asked a rep to type three competitors before the
 * feature did anything, and a form that costs three text fields before it
 * returns anything is a form that gets used once.
 *
 * SELECTION IS SEPARATE FROM DETAIL. Toggling costs one click and requires
 * nothing else. Posture, what-was-said and what-landed live behind a disclosure
 * on the rows that earn them. Nothing is ever required at toggle time — that
 * separation is what decides whether this gets used at all.
 *
 * The card buttons below are DERIVED from the switches above them, so every
 * deal has two cards available the moment it exists and turning a competitor on
 * produces its button immediately. No second list to maintain, and no way for
 * the two to disagree.
 */
export default function CompetitivePanel({
  deal,
  competitors,
  onGenerate,
  busy = false,
}: {
  deal: Deal;
  competitors: DealCompetitor[];
  onGenerate: (
    task: 'no-decision-card' | 'pricing-defense-card',
    postureKey: string,
    label: string,
  ) => void;
  busy?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => presenceGrid(deal, competitors), [deal, competitors]);
  const cards = useMemo(() => cardControls(deal, competitors), [deal, competitors]);

  const top = rows.filter((r) => r.topLevel);
  const rest = rows.filter((r) => !r.topLevel);
  const restOn = rest.filter((r) => r.on).length;

  /**
   * The disclosure label, DERIVED from what is actually behind it.
   *
   * It was hardcoded "Tier 2 / Tier 3 / integrator" and was wrong twice: it
   * used the retired enum name, which the tier rename removed precisely so one
   * concept would not carry two names, and it advertised a tier that is not in
   * this group at all — tier-1b sits at the top level. A label that names its
   * contents by hand is a label that goes stale the first time the catalog
   * moves, and nothing on the page says so.
   */
  const restTiers = useMemo(
    () => [...new Set(rest.map((r) => r.tier))].map((t) => TIER_LABELS[t] ?? t),
    [rest],
  );

  async function toggle(row: PresenceRow) {
    if (!row.toggleable) return;
    setPending(row.key);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id, key: row.key, on: !row.on }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── The grid ── */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Who is in this deal</p>
          <p className="text-2xs text-text-faint">Click to switch on or off</p>
        </div>

        <ul className="mt-2 divide-y divide-rule-faint rounded-card border border-rule">
          {top.map((row) => (
            <ToggleRow
              key={row.key}
              row={row}
              dealId={deal.id}
              pending={pending === row.key}
              open={openDetail === row.key}
              onToggle={() => toggle(row)}
              onOpen={() => setOpenDetail(openDetail === row.key ? null : row.key)}
              onSaved={() => router.refresh()}
            />
          ))}
        </ul>

        {/* Tier 2 and 3 are situational — known cold, never led with — so they
            stay out of the way until someone says one is in the deal. */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-2 flex min-h-tap lg:min-h-tap-sm w-full items-center gap-1.5 rounded-sm px-1 text-xs text-text-dim hover:text-text"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {restTiers.join(' · ')}
          {restOn > 0 ? (
            <span className="rounded-full bg-accent-bg px-1.5 text-2xs text-accent-dim">
              {restOn} on
            </span>
          ) : null}
        </button>

        {expanded ? (
          <ul className="mt-1 divide-y divide-rule-faint rounded-card border border-rule">
            {rest.map((row) => (
              <ToggleRow
                key={row.key}
                row={row}
                dealId={deal.id}
                pending={pending === row.key}
                open={openDetail === row.key}
                onToggle={() => toggle(row)}
                onOpen={() => setOpenDetail(openDetail === row.key ? null : row.key)}
                onSaved={() => router.refresh()}
              />
            ))}
            <li className="px-3 py-2">
              {adding ? (
                <AddNamed
                  dealId={deal.id}
                  onDone={() => {
                    setAdding(false);
                    router.refresh();
                  }}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex min-h-tap lg:min-h-tap-sm items-center gap-1.5 text-xs text-text-dim hover:text-text"
                >
                  <Plus size={13} /> Add a named competitor
                </button>
              )}
            </li>
          </ul>
        ) : null}

        {gridNameIsGeneric(deal) ? (
          <p className="mt-1.5 text-2xs text-text-faint">
            No single utility on this deal&rsquo;s record
            {deal.utility ? ` (Utility Territory reads “${deal.utility}”)` : ''}, so the grid
            card is titled generically. Naming the utility on the Spine makes it specific.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 rounded-sm border border-danger bg-danger-bg px-2.5 py-2 text-xs text-text">
            {error}
          </p>
        ) : null}
      </div>

      {/* ── The buttons, derived from the switches ── */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Generate a card</p>
          <p className="text-2xs text-text-faint">One per posture</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <Button
              key={c.postureKey}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onGenerate(c.task, c.postureKey, c.label)}
              title={
                c.thin
                  ? 'Nothing recorded against this posture yet — the card will generate from the deal record and name its own gaps.'
                  : undefined
              }
            >
              {c.task === 'no-decision-card' ? <Swords size={13} /> : <FileText size={13} />}
              {c.label}
              {c.thin ? <span className="text-text-faint">·</span> : null}
            </Button>
          ))}
        </div>
        {/*
          Staleness, not count, is the reason these generate on demand. A
          maintained library of one card per posture goes stale the instant a
          posture changes, with nothing on the page saying which is current.
        */}
        <p className="mt-1.5 text-2xs text-text-faint">
          Built when you ask, from the record as it stands today, and date-stamped. Nothing is
          stored, so nothing goes stale.{' '}
          {cards.some((c) => c.thin)
            ? 'A dot marks a posture with nothing recorded against it yet — the card still generates and names what it is missing.'
            : ''}
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  row,
  dealId,
  pending,
  open,
  onToggle,
  onOpen,
  onSaved,
}: {
  row: PresenceRow;
  dealId: string;
  pending: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSaved: () => void;
}) {
  const detailCount = [row.record?.posture, row.record?.what_was_said, row.record?.what_landed]
    .filter(Boolean).length;

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={row.on}
          aria-label={row.label}
          disabled={!row.toggleable || pending}
          onClick={onToggle}
          className={cn(
            'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-fast',
            row.on ? 'border-accent-mark bg-accent-mark' : 'border-rule bg-bg-overlay',
            row.toggleable ? 'cursor-pointer' : 'cursor-default opacity-70',
            pending && 'opacity-50',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-bg transition-all duration-fast',
              row.on ? 'left-[1.15rem]' : 'left-0.5',
            )}
          />
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm', row.on ? 'text-text' : 'text-text-dim')}>
            {row.label}
            {!row.toggleable ? (
              <span className="ml-1.5 text-2xs uppercase tracking-label text-text-faint">
                always
              </span>
            ) : null}
          </p>
          {row.hint ? <p className="text-2xs text-text-faint">{row.hint}</p> : null}
        </div>

        <span className="shrink-0 font-mono text-2xs uppercase tracking-label text-text-faint">
          {row.tier}
        </span>

        {/* Detail is never required at toggle time, and never in the way. */}
        {row.on && row.toggleable ? (
          <button
            type="button"
            onClick={onOpen}
            aria-expanded={open}
            className="shrink-0 text-2xs text-text-dim hover:text-text"
          >
            {detailCount > 0 ? `Detail (${detailCount})` : 'Add detail'}
          </button>
        ) : null}
      </div>

      {open ? <DetailForm dealId={dealId} row={row} onSaved={onSaved} /> : null}
    </li>
  );
}

function DetailForm({
  dealId,
  row,
  onSaved,
}: {
  dealId: string;
  row: PresenceRow;
  onSaved: () => void;
}) {
  const [posture, setPosture] = useState(row.record?.posture ?? '');
  const [said, setSaid] = useState(row.record?.what_was_said ?? '');
  const [landed, setLanded] = useState(row.record?.what_landed ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          key: row.key,
          posture: posture.trim() || null,
          whatWasSaid: said.trim() || null,
          whatLanded: landed.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-sm border border-rule-faint bg-bg-raised p-2.5">
      <Area
        label="What we argue against them here"
        value={posture}
        onChange={setPosture}
        placeholder="Bundled price hides financing cost and cannot be unbundled later."
      />
      <Area
        label="What they, or the buyer relaying them, actually said"
        value={said}
        onChange={setSaid}
      />
      <Area
        label="What landed"
        value={landed}
        onChange={setLanded}
        hint="Which of our arguments actually moved them. This is the half that compounds across deals."
      />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <Button variant="primary" size="sm" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save detail'}
      </Button>
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1 block">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-rule bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:border-accent-mark focus:outline-none"
      />
      {hint ? <p className="mt-0.5 text-2xs text-text-faint">{hint}</p> : null}
    </div>
  );
}

function AddNamed({
  dealId,
  onDone,
  onCancel,
}: {
  dealId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<CompetitorTier>('tier-1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, competitor: name.trim(), tier }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* The catalog cannot hold "Wärtsilä via Burns & McDonnell", and that
          phrase is the part of the answer worth having. */}
      <input
        type="text"
        value={name}
        autoFocus
        placeholder="Wärtsilä via Burns &amp; McDonnell"
        onChange={(e) => setName(e.target.value)}
        className="min-h-tap lg:min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-mark focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {COMPETITOR_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn(
              'min-h-tap lg:min-h-tap-sm rounded-sm border px-2 text-2xs transition-colors duration-fast',
              tier === t
                ? 'border-accent-mark bg-accent-bg text-accent-dim'
                : 'border-rule text-text-dim hover:text-text',
            )}
          >
            {TIER_LABELS[t]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
