'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { SIGNAL_TYPES } from '@/lib/types';
import Button from '@/components/ui/button';

/**
 * Signal capture. Deliberately three fields — what happened, what type, and
 * the so-what. Anything longer and signals stop getting logged, which is the
 * failure mode that quietly empties the Intelligence Log.
 */
export default function SignalCapture({
  deal,
  onClose,
}: {
  deal: Deal;
  onClose: () => void;
}) {
  const router = useRouter();
  const [signalType, setSignalType] = useState<string>('pain');
  const [raw, setRaw] = useState('');
  const [soWhat, setSoWhat] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!raw.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: signalType,
          raw_signal: raw.trim(),
          so_what: soWhat.trim() || null,
          source_name: source.trim() || null,
          deal_ids: [deal.id],
        }),
      });

      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the signal.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-card border border-rule bg-bg p-5 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="signal-title" className="font-display text-lg text-text">
              Log a signal
            </h2>
            <p className="mt-0.5 text-xs text-text-dim">{deal.company}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-text-dim hover:bg-bg-raised hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="eyebrow mb-1 block">Type</span>
            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value)}
              className={inputClass}
            >
              {SIGNAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">What happened *</span>
            <textarea
              required
              autoFocus
              rows={3}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="What was said, seen, or filed. Quote it if you can."
              className={`${inputClass} h-auto resize-y py-2`}
            />
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">
              So what<span className="ml-1.5 normal-case tracking-normal">— the action it forces</span>
            </span>
            <textarea
              rows={2}
              value={soWhat}
              onChange={(e) => setSoWhat(e.target.value)}
              placeholder="What this changes about how we work the deal."
              className={`${inputClass} h-auto resize-y py-2`}
            />
          </label>

          <label className="block">
            <span className="eyebrow mb-1 block">Source</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Call with plant GM, 10-K, trade press…"
              className={inputClass}
            />
          </label>

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={saving || !raw.trim()}
            >
              {saving ? 'Saving…' : 'Log signal'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'h-9 w-full rounded-md border border-rule bg-bg-raised px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none';
