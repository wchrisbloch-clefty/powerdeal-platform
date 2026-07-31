'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Deal, FeedItem } from '@/lib/types';
import { SIGNAL_TYPES } from '@/lib/types';
import Button from '@/components/ui/button';

/**
 * Promote a feed item to an intelligence signal.
 *
 * Pre-filled from the item, then edited and confirmed — never auto-written.
 * The dual meaning is the judgment: deciding that "the SCC approved a rate
 * increase" means "our cost-certainty argument just got easier at Norfolk" is
 * exactly the reasoning a signal log exists to capture, and a model guessing it
 * would fill the log with plausible sentences nobody stands behind.
 *
 * So the fields arrive blank rather than generated. What is pre-filled is only
 * what the item already states.
 */
export default function PromoteToSignal({
  item,
  deals,
  onDone,
}: {
  item: FeedItem;
  deals: Deal[];
  onDone: (message: string | null) => void;
}) {
  const router = useRouter();

  const mapped = item.deal_ids
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  const [signalType, setSignalType] = useState<string>('trigger-event');
  const [dealId, setDealId] = useState<string>(mapped[0]?.id ?? '');
  const [raw, setRaw] = useState(item.synthesis ?? item.title);
  const [accountMeaning, setAccountMeaning] = useState('');
  const [businessMeaning, setBusinessMeaning] = useState('');
  const [soWhat, setSoWhat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!raw.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // intelligence_log has no headline or url column — the signal IS the
        // reading, not the article. Sending them would look like they persist.
        body: JSON.stringify({
          signal_type: signalType,
          source_name: item.source_name ?? 'Feed',
          raw_signal: raw.trim(),
          account_meaning: accountMeaning.trim() || null,
          business_meaning: businessMeaning.trim() || null,
          so_what: soWhat.trim() || null,
          deal_ids: dealId ? [dealId] : [],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not log that signal.');
      }
      router.refresh();
      onDone('Logged to the signal log.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log that signal.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <p className="eyebrow">Promote to signal</p>

      <div className="flex flex-wrap gap-2">
        <select
          value={signalType}
          onChange={(e) => setSignalType(e.target.value)}
          aria-label="Signal type"
          className="h-9 min-w-[9rem] flex-1 rounded-md border border-rule bg-bg-raised px-2 text-xs text-text focus:border-accent-border focus:outline-none"
        >
          {SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          aria-label="Account"
          className="h-9 min-w-[10rem] flex-1 rounded-md border border-rule bg-bg-raised px-2 text-xs text-text focus:border-accent-border focus:outline-none"
        >
          <option value="">No account</option>
          {(mapped.length > 0 ? mapped : deals).map((d) => (
            <option key={d.id} value={d.id}>
              {d.deal_id} · {d.company}
            </option>
          ))}
        </select>
      </div>

      <Field label="What happened" value={raw} onChange={setRaw} rows={2} />

      {/* The two readings, side by side — the same shape they are stored and
          displayed in, so what you write is what the Signals tab shows. */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field
          label="What it means for the account"
          value={accountMeaning}
          onChange={setAccountMeaning}
          placeholder="Concrete, about this customer."
        />
        <Field
          label="What it means for the business"
          value={businessMeaning}
          onChange={setBusinessMeaning}
          placeholder="The thesis that travels to other deals."
        />
      </div>

      <Field
        label="So what — the next move"
        value={soWhat}
        onChange={setSoWhat}
        placeholder="What you will actually do about it."
      />

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving || !raw.trim()}>
          {saving ? 'Logging…' : 'Log signal'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-md border border-rule bg-bg-raised px-2 py-1.5 text-xs leading-relaxed text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none"
      />
    </label>
  );
}
