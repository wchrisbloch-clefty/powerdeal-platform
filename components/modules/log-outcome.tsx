'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Quote, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import { OUTCOME_TYPES, type OutcomeType } from '@/lib/types';

/**
 * LOG OUTCOME — capture the close.
 *
 * The verbatim is the point of this form, so it is the largest field and the
 * only one with a placeholder written as an example rather than an instruction.
 * Everything else here already existed on win_loss_log and was never once
 * written to; the buyer's own sentence is what makes the record worth keeping.
 *
 * Setting the stage is part of the SAME write, server-side, derived from the
 * outcome. There is no stage control here on purpose: a dropdown would let the
 * outcome and the stage disagree one field apart, which is exactly what this
 * flow exists to prevent.
 */
export default function LogOutcome({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('No-Decision');
  const [buyerVerbatim, setBuyerVerbatim] = useState('');
  const [reason, setReason] = useState('');
  const [lesson, setLesson] = useState('');
  const [competitorWon, setCompetitorWon] = useState('');
  const [revisitTrigger, setRevisitTrigger] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terminalStage = outcomeType === 'Won' ? 'Closed-Won' : 'Archived';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/win-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          outcomeType,
          buyerVerbatim: buyerVerbatim.trim() || undefined,
          reason: reason.trim() || undefined,
          lesson: lesson.trim() || undefined,
          competitorWon: competitorWon.trim() || undefined,
          revisitTrigger: revisitTrigger.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Log outcome for ${company}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg-overlay/80 p-4 sm:p-8"
    >
      <div className="w-full max-w-xl rounded-lg border border-rule bg-bg shadow-overlay">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <div>
            <p className="eyebrow">Log outcome</p>
            <p className="text-sm text-text">{company}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-tap-sm w-tap-sm items-center justify-center rounded-sm text-text-dim hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* ── Outcome ── */}
          <div>
            <p className="eyebrow mb-1.5">Outcome</p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOME_TYPES.map((o) => (
                <button
                  key={o}
                  onClick={() => setOutcomeType(o)}
                  className={cn(
                    'min-h-tap-sm rounded-sm border px-2.5 text-xs transition-colors duration-fast',
                    outcomeType === o
                      ? 'border-accent bg-accent-bg text-accent-dim'
                      : 'border-rule text-text-dim hover:text-text',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
            {/* Stated before committing. The stage is not a choice, and the
                user should not discover what happened to the deal afterwards. */}
            <p className="mt-1.5 text-2xs text-text-faint">
              This closes the deal and sets its stage to{' '}
              <span className="font-mono text-text-dim">{terminalStage}</span> in the same write.
            </p>
          </div>

          {/* ── The verbatim ── */}
          <div>
            <label htmlFor="verbatim" className="eyebrow mb-1 flex items-center gap-1.5">
              <Quote size={11} aria-hidden />
              What they actually said
            </label>
            <textarea
              id="verbatim"
              rows={4}
              value={buyerVerbatim}
              onChange={(e) => setBuyerVerbatim(e.target.value)}
              placeholder="&ldquo;We agreed it was better but nobody would own the capital this year.&rdquo;"
              className="w-full rounded-sm border border-rule bg-bg px-2.5 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-1 text-2xs text-text-faint">
              Their words, not a summary. A buyer&rsquo;s own sentence about why they did not
              buy carries weight nothing we write about ourselves ever will — and it compounds
              across closes.
            </p>
          </div>

          <Field label="Why, in your words" value={reason} onChange={setReason} />
          <Field label="Lesson" value={lesson} onChange={setLesson} />
          {outcomeType === 'Competitive' ? (
            <Field label="Lost to" value={competitorWon} onChange={setCompetitorWon} />
          ) : null}
          <Field
            label="Revisit trigger"
            value={revisitTrigger}
            onChange={setRevisitTrigger}
            hint="What would make this worth reopening."
          />

          {error ? (
            <p role="alert" className="rounded-sm border border-danger bg-danger-bg px-2.5 py-2 text-xs text-text">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-rule px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? 'Closing…' : `Close as ${outcomeType}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1 block">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent focus:outline-none"
      />
      {hint ? <p className="mt-1 text-2xs text-text-faint">{hint}</p> : null}
    </div>
  );
}
