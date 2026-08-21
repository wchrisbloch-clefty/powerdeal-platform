'use client';

import { useState } from 'react';
import { Loader2, Send, Check, AlertTriangle } from 'lucide-react';
import type { Deal } from '@/lib/types';
import type { Proposal } from '@/lib/capture/proposal';
import { fieldFor } from '@/lib/capture/fields';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * SAY IT ONCE. THE SIGNAL IS SAFE BEFORE ANYTHING IS PROPOSED.
 * ═══════════════════════════════════════════════════════════════
 *
 * One box, one send, one account picker. Everything else on this surface is a
 * response to what came back.
 *
 * ══ THE ORDER IS THE DESIGN ══
 *
 * The sentence reaches `intelligence_log` before a model sees it. So the
 * confirmation of the SAVE and the arrival of PROPOSALS are two separate
 * statements on screen, and the first does not depend on the second. A reader
 * who closes the app at a green light has still captured the fact.
 *
 * ⚠️ NOTHING IS AUTO-APPLIED, AND THERE IS NO "CONFIRM ALL". A button that
 * applies four proposals at once is a button pressed without reading, and
 * reading is the entire safeguard — a misparsed champion scores a MEDDPICC
 * point and lifts a health number, and afterwards it is indistinguishable from
 * a fact somebody checked.
 *
 * ⚠️ EVERY PROPOSAL SHOWS THE PHRASE IT CAME FROM. "Champion: Trevor Reitsma"
 * is a claim; "Champion: Trevor Reitsma — from 'Trevor is the one pushing this
 * internally'" is a claim you can check in two seconds from a car park. The
 * validator refuses any proposal that arrives without one.
 *
 * ══ NON-GATING THROUGHOUT ══
 *
 * A signal that maps to nothing is still a signal, and the surface says so
 * rather than looking like it failed. No deal selected is legitimate — an
 * unattached signal is a real thing, and forcing an account choice at the
 * moment of capture is the friction this exists to remove.
 */

interface Refusal {
  field: string;
  reason: string;
}

interface CaptureResponse {
  signal?: { id: string; logged_at: string };
  proposals?: Proposal[];
  refused?: Refusal[];
  note?: string;
  error?: string;
}

interface Applied {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
  changed: boolean;
  note: string;
}

export default function FactLog({ deals }: { deals: Deal[] }) {
  const [text, setText] = useState('');
  const [dealId, setDealId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, Applied>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<Record<string, string>>({});
  /** Edited values, keyed by field. A correction is the common case. */
  const [edited, setEdited] = useState<Record<string, string>>({});

  async function send() {
    const said = text.trim();
    if (!said || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    setApplied({});
    setApplyError({});
    setEdited({});

    try {
      const res = await fetch('/api/capture/fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: said, deal_ids: dealId ? [dealId] : [] }),
      });
      const body = (await res.json()) as CaptureResponse;
      if (!res.ok) {
        setError(body.error ?? `The capture failed (${res.status}).`);
        return;
      }
      setResult(body);
      // ⚠️ THE BOX EMPTIES ONLY ONCE THE SIGNAL IS CONFIRMED SAVED. Clearing it
      // on send would lose the sentence on any failure, which is the one thing
      // this surface exists to prevent.
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function confirm(p: Proposal) {
    if (!dealId) return;
    const value = edited[p.field] ?? p.value;
    setApplying(p.field);
    setApplyError((e) => ({ ...e, [p.field]: '' }));
    try {
      const res = await fetch('/api/capture/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealId,
          field: p.field,
          value,
          signal_id: result?.signal?.id ?? null,
        }),
      });
      const body = (await res.json()) as Applied & { error?: string };
      if (!res.ok) {
        setApplyError((e) => ({ ...e, [p.field]: body.error ?? `Failed (${res.status}).` }));
        return;
      }
      setApplied((a) => ({ ...a, [p.field]: body }));
    } catch (err) {
      setApplyError((e) => ({ ...e, [p.field]: (err as Error).message }));
    } finally {
      setApplying(null);
    }
  }

  const proposals = result?.proposals ?? [];
  const refused = result?.refused ?? [];

  return (
    <div className="space-y-rhythm-block">
      {/* ── The box. Big, first, and the only thing above the fold. ── */}
      <div className="rounded-card border border-rule bg-bg-raised p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send();
          }}
          rows={4}
          /* Dictation is the expected input. Nothing here asks for structure. */
          placeholder="Say what you learned. One sentence is enough."
          className="w-full resize-none bg-transparent text-base text-text placeholder:text-text-faint focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule-faint pt-2">
          <label className="sr-only" htmlFor="fact-log-deal">
            Which account
          </label>
          <select
            id="fact-log-deal"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="h-tap min-w-0 flex-1 rounded-md border border-rule bg-bg px-2 text-sm text-text focus:border-accent-border focus:outline-none lg:h-9"
          >
            {/* ⚠️ NOT REQUIRED. An unattached signal is a real thing, and making
                the account a gate at the moment of capture is exactly the
                friction this surface exists to remove. It only limits what can
                be CONFIRMED, which is said below rather than enforced here. */}
            <option value="">No account — log it anyway</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            className="inline-flex min-h-tap items-center gap-1.5 rounded-md border border-rule px-3 text-sm text-text-dim disabled:opacity-40 hover:text-text lg:min-h-0 lg:h-9"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Send size={14} aria-hidden />
            )}
            Log it
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
          {/* The sentence is still in the box. Said explicitly, because the
              reader's next move is to decide whether to retype it. */}
          {error} Nothing was saved — the text is still in the box.
        </p>
      ) : null}

      {result?.signal ? (
        <div className="space-y-rhythm-block">
          {/* ── 1. THE SAVE, ON ITS OWN LINE ── */}
          <p className="flex items-start gap-2 rounded-card border border-success/40 bg-success-bg px-3.5 py-2.5 text-sm text-text">
            <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="max-w-measure">{result.note}</span>
          </p>

          {/* ── 2. THE PROPOSALS, one at a time, each quoting its source ── */}
          {proposals.length > 0 ? (
            <div className="space-y-2">
              <p className="eyebrow">Proposed — nothing is written until you confirm</p>
              {!dealId ? (
                <p className="rounded-card border border-gap-rule border-dotted px-3 py-2 text-2xs text-text-dim">
                  These need an account before they can be written. The signal is
                  saved either way — pick one above and log it again, or confirm
                  from the deal later.
                </p>
              ) : null}
              {proposals.map((p) => (
                <ProposalRow
                  key={p.field}
                  proposal={p}
                  value={edited[p.field] ?? p.value}
                  onEdit={(v) => setEdited((e) => ({ ...e, [p.field]: v }))}
                  onConfirm={() => void confirm(p)}
                  busy={applying === p.field}
                  applied={applied[p.field]}
                  error={applyError[p.field]}
                  canConfirm={Boolean(dealId)}
                />
              ))}
            </div>
          ) : null}

          {/* ── 3. WHAT WAS REFUSED, named rather than dropped ── */}
          {refused.length > 0 ? (
            <div className="rounded-card border border-warning/40 bg-warning/5 px-3.5 py-2.5">
              <p className="text-2xs text-text">
                Not offered — each of these was read and refused:
              </p>
              <ul className="mt-1 space-y-1">
                {refused.map((r, i) => (
                  <li key={i} className="max-w-measure text-2xs text-text-dim">
                    <span className="font-mono text-text">{r.field}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProposalRow({
  proposal,
  value,
  onEdit,
  onConfirm,
  busy,
  applied,
  error,
  canConfirm,
}: {
  proposal: Proposal;
  value: string;
  onEdit: (v: string) => void;
  onConfirm: () => void;
  busy: boolean;
  applied?: Applied;
  error?: string;
  canConfirm: boolean;
}) {
  const spec = fieldFor(proposal.field);

  return (
    <div
      className={cn(
        'rounded-card border px-3 py-2.5',
        applied ? 'border-success/40 bg-success-bg' : 'border-rule bg-bg-raised',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-text">{spec?.label ?? proposal.field}</p>
        {/* ⚠️ WHAT CONFIRMING MOVES, BEFORE IT IS CONFIRMED. A champion is worth
            a point and a health step; a beachhead site is worth neither. A
            reader deciding in a car park should not have to know the scoring
            model to know what they are about to change. */}
        <p className="text-2xs text-text-faint">{spec?.moves}</p>
      </div>

      {/* ⚠️ THE PHRASE. This is the safeguard, not decoration — it is what makes
          confirming a check rather than an act of trust. */}
      <p className="mt-1 max-w-measure border-l-2 border-gap-rule pl-2 text-2xs italic text-text-dim">
        “{proposal.phrase}”
      </p>

      {applied ? (
        <p className="mt-2 flex items-start gap-1.5 text-2xs text-text">
          <Check size={12} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <span className="max-w-measure">{applied.note}</span>
        </p>
      ) : (
        <>
          {/* Editable, because correcting is the common case and retyping the
              whole sentence to fix one word is what stops people correcting. */}
          <input
            value={value}
            onChange={(e) => onEdit(e.target.value)}
            aria-label={`Value for ${spec?.label ?? proposal.field}`}
            className="mt-2 h-tap w-full rounded-md border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent-border focus:outline-none lg:h-9"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !value.trim() || !canConfirm}
              className="inline-flex min-h-tap items-center gap-1.5 rounded-md border border-rule px-3 text-sm text-text-dim disabled:opacity-40 hover:text-text lg:min-h-0 lg:h-9"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Check size={13} aria-hidden />
              )}
              Confirm
            </button>
            {/* No "reject" control: not confirming IS rejecting, and a button
                that records a refusal would be a second thing to press. */}
          </div>
        </>
      )}

      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span className="max-w-measure">{error}</span>
        </p>
      ) : null}
    </div>
  );
}
