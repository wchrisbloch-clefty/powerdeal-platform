'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { VERTICALS, RELATIONSHIP_TYPES, DEAL_STAGES } from '@/lib/types';
import { nextDealId } from '@/lib/deals';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';

/**
 * Quick-add panel.
 *
 * Minimal on purpose — company and vertical are the only required fields.
 * Everything else is filled in as the deal is worked. A long creation form is
 * the fastest way to make people stop logging deals at all.
 */
export default function DealQuickAdd({
  existing,
  onClose,
}: {
  existing: Deal[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [company, setCompany] = useState('');
  const [vertical, setVertical] = useState<string>(VERTICALS[0]);
  const [relationshipType, setRelationshipType] = useState<string>('Direct');
  const [state, setState] = useState('');
  const [utility, setUtility] = useState('');
  const [stage, setStage] = useState<string>('Prospecting');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewId = nextDealId(vertical, existing);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim(),
          vertical,
          relationship_type: relationshipType,
          state: state.trim().toUpperCase() || null,
          utility: utility.trim() || null,
          stage,
          champion: contact.trim() || null,
        }),
      });

      const body = (await res.json()) as { deal?: Deal; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Create failed (${res.status})`);

      onClose();
      if (body.deal?.id) router.push(`/app/pipeline/${body.deal.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the deal.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-card border border-rule bg-bg p-5 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="quick-add-title" className="font-display text-lg text-text">
              Add deal
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-text-faint">
              Will be created as {previewId}
            </p>
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
          <Field label="Company" required>
            <input
              required
              autoFocus
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Chemical"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vertical">
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className={inputClass}
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>

            <Field label="Relationship">
              <select
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value)}
                className={inputClass}
              >
                {RELATIONSHIP_TYPES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="State">
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="TX"
                maxLength={2}
                className={cn(inputClass, 'uppercase')}
              />
            </Field>

            <Field label="Stage">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={inputClass}
              >
                {DEAL_STAGES.filter((s) => s !== 'Archived').map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Utility">
            <input
              value={utility}
              onChange={(e) => setUtility(e.target.value)}
              placeholder="CenterPoint"
              className={inputClass}
            />
          </Field>

          <Field label="First contact" hint="Optional — recorded as champion">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Name"
              className={inputClass}
            />
          </Field>

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
              disabled={saving || !company.trim()}
            >
              {saving ? 'Creating…' : 'Create deal'}
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

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">
        {label}
        {required ? ' *' : ''}
        {hint ? <span className="ml-1.5 normal-case tracking-normal">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
