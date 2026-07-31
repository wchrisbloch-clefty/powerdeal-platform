'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A company that isn't in the book yet, with one click to put it there.
 *
 * Shared by the coverage-gap block ("named in coverage you don't follow") and
 * the entity pages ("named alongside SDG&E"). Both answer the same origination
 * question, so they add a deal the same way — and, more importantly, they add it
 * with the same restraint about what is actually known.
 */

export interface PeerLike {
  name: string;
  mentions: number;
  /** Evidence, shown on hover. */
  headlines: string[];
}

export default function PeerChip({ peer }: { peer: PeerLike }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function addToPipeline() {
    if (busy || added) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: peer.name,
          // Everything else is left blank on purpose. This is an origination
          // lead, not a qualified deal — guessing a vertical or a stage here
          // would put unearned confidence in the pipeline.
          vertical: 'Other',
          relationship_type: 'Direct',
          stage: 'Prospecting',
        }),
      });
      if (res.ok) setAdded(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={addToPipeline}
      disabled={added || busy}
      title={peer.headlines.slice(0, 3).join('\n')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors',
        added
          ? 'border-accent-border bg-accent-bg text-accent-dim'
          : failed
            ? 'border-danger text-danger'
            : 'border-rule text-text-dim hover:border-accent-border hover:text-text',
      )}
    >
      {added ? <Check size={11} aria-hidden /> : <Plus size={11} aria-hidden />}
      {peer.name}
      <span className="font-mono text-micro opacity-60">{peer.mentions}</span>
    </button>
  );
}
