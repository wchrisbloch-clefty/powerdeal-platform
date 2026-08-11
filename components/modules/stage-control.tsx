'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import { StagePill } from '@/components/ui/badge';
import { evaluateMove, stageOptions } from '@/lib/stage';
import type { Deal, DealStage } from '@/lib/types';

/**
 * MOVE A DEAL.
 *
 * The application could close a deal and could not advance one. Four features
 * ran on the frozen field: stage momentum in the health score, the stalled-30
 * and stalled-60 flags, and `isAtRisk`. Every one of them was reading "days
 * since created" while saying "days in stage".
 *
 * The consequences are stated BEFORE the write, not discovered after it. That
 * is the same decision as the outcome dialog, which tells you which terminal
 * stage it is about to set before you commit — a stage change is not reversible
 * without leaving a second transition row behind, so the reader has to know
 * what it does while they can still not do it.
 */
export default function StageControl({ deal }: { deal: Deal }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<DealStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = stageOptions(deal.stage as DealStage);
  const verdict = target ? evaluateMove(deal, target) : null;

  async function commit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      // A plain PATCH on stage. The deals_stage_transition trigger writes the
      // history row and resets days_in_stage — inserting a transition here
      // would double-write.
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setOpen(false);
      setTarget(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ChevronRight size={14} /> Move stage
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Move ${deal.company}`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg-overlay/80 p-4 sm:p-8"
        >
          <div className="w-full max-w-lg rounded-lg border border-rule bg-bg shadow-overlay">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <div>
                <p className="eyebrow">Move stage</p>
                <p className="flex items-center gap-1.5 text-sm text-text">
                  {deal.company}
                  <StagePill stage={deal.stage} />
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setTarget(null);
                }}
                aria-label="Close"
                className="flex h-tap-sm w-tap-sm items-center justify-center rounded-sm text-text-dim hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <p className="eyebrow mb-1.5">Move to</p>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setTarget(s)}
                      className={cn(
                        'min-h-tap-sm rounded-sm border px-2.5 text-xs transition-colors duration-fast',
                        target === s
                          ? 'border-accent bg-accent-bg text-accent-dim'
                          : 'border-rule text-text-dim hover:text-text',
                      )}
                    >
                      {s}
                      {/* The immediate next stage leads the list, because
                          advancing one step is what almost every move is. */}
                      {i === 0 ? <span className="ml-1 text-text-faint">next</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {verdict ? (
                <ul className="space-y-1.5">
                  {verdict.consequences.map((c) => (
                    <li
                      key={c.key}
                      className={cn(
                        'flex gap-1.5 rounded-sm border px-2.5 py-2 text-xs',
                        c.severity === 'warn'
                          ? 'border-danger bg-danger-bg text-text'
                          : 'border-rule bg-bg-raised text-text-dim',
                      )}
                    >
                      {c.severity === 'warn' ? (
                        <AlertTriangle size={13} className="mt-px shrink-0 text-danger" aria-hidden />
                      ) : null}
                      {c.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-faint">
                  Pick a stage to see what the move does before it happens.
                </p>
              )}

              {error ? (
                <p role="alert" className="rounded-sm border border-danger bg-danger-bg px-2.5 py-2 text-xs text-text">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-rule px-4 py-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !verdict?.allowed}
                onClick={commit}
              >
                {busy ? 'Moving…' : target ? `Move to ${target}` : 'Move'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
