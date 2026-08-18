'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import {
  MARKET_STRUCTURE_LABELS, SERVICE_MODEL_LABELS, UTILITY_TYPE_LABELS,
  type UtilityContext,
} from '@/lib/utility/model';
import type { Deal } from '@/lib/types';

/**
 * THE UTILITY LAYER, as four levels that degrade rather than block.
 *
 * Each level sharpens the argument and none gates the one below it. A deal that
 * only knows its state still gets Level 0 — regulated, deregulated or hybrid —
 * which is enough to know whether "your rate escalates" is even the right
 * sentence. What is missing is NAMED, in the same panel, so the next question
 * is visible instead of being something to remember to ask.
 *
 * The two structural risks are not buried here. They are merged into the deal's
 * own risk flags at the top of the page, because a co-op all-requirements
 * contract is a NO-GO candidate and a panel three tabs in would make it late by
 * construction.
 */
export default function UtilityPanel({
  deal,
  utility,
}: {
  deal: Deal;
  utility: UtilityContext | null;
}) {
  const [answering, setAnswering] = useState(false);
  if (!utility) {
    return (
      <p className="text-sm text-text-dim">
        The utility layer could not be resolved. Level 0 answers from a two-letter state
        code alone, so this is a lookup failure rather than a gap in the record.
      </p>
    );
  }

  const levels: { n: 0 | 1 | 2 | 3; label: string; value: string | null }[] = [
    {
      n: 0,
      label: 'State market structure',
      value: utility.marketStructure
        ? MARKET_STRUCTURE_LABELS[utility.marketStructure]
        : null,
    },
    {
      n: 1,
      label: 'Utility, typed',
      value: utility.utilityType
        ? `${utility.utilityName} — ${UTILITY_TYPE_LABELS[utility.utilityType]}`
        : utility.utilityName
          ? `${utility.utilityName} — not typed`
          : null,
    },
    {
      n: 2,
      label: 'Service model',
      value: utility.serviceModel ? SERVICE_MODEL_LABELS[utility.serviceModel] : null,
    },
    {
      n: 3,
      label: 'Tariff',
      value:
        utility.risks.find((r) => r.key === 'standby-departing-load')?.answered
          ? 'Standby and departing-load terms on record'
          : null,
    },
  ];

  const open = utility.risks.filter((r) => !r.answered);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow flex items-center gap-1.5">
            <Layers size={11} aria-hidden /> Utility structure
          </p>
          <p className="text-2xs text-text-faint">
            Level {utility.level} of 3
            {utility.state ? ` · ${utility.state}` : ''}
          </p>
        </div>

        <ol className="mt-2 divide-y divide-rule-faint rounded-card border border-rule">
          {levels.map((l) => (
            <li key={l.n} className="flex items-start gap-3 px-3 py-2">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-2xs',
                  l.value
                    ? 'bg-accent-bg text-accent-dim'
                    : 'border border-rule text-text-faint',
                )}
              >
                {l.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{l.label}</p>
                <p className={cn('text-sm', l.value ? 'text-text' : 'text-text-faint')}>
                  {/* An unanswered level is a named next question, never a
                      blocked surface. Everything above it still renders. */}
                  {l.value ?? '— not established —'}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {utility.marketStructureNote ? (
          <p className="mt-1.5 text-2xs text-text-faint">{utility.marketStructureNote}</p>
        ) : null}

        {utility.serviceModel === 'wires-only' ? (
          <p className="mt-1.5 rounded-sm border border-rule bg-bg-raised px-2.5 py-2 text-xs text-text-dim">
            Wires-only: the bill splits. Delivery is regulated and barely moves; energy is
            competitive and BTM displaces it. An all-in $/MWh is a number this buyer does not
            recognise on their own bill.
          </p>
        ) : null}
      </div>

      {/* ── Structural risks, stated where they can still change the plan ── */}
      {open.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">Open structural risk</p>
          <ul className="space-y-2">
            {open.map((r) => (
              <li
                key={r.key}
                className={cn(
                  'rounded-card border px-3 py-2.5',
                  r.severity === 'no-go-candidate'
                    ? 'border-danger bg-danger-bg'
                    : 'border-rule bg-bg-raised',
                )}
              >
                <p className="flex items-center gap-1.5 text-sm text-text">
                  {r.severity === 'no-go-candidate' ? (
                    <AlertTriangle size={13} className="shrink-0 text-danger" aria-hidden />
                  ) : null}
                  {r.label}
                  <span className="ml-auto shrink-0 font-mono text-2xs text-text-faint">
                    level {r.level}
                  </span>
                </p>
                <p className="mt-1 text-xs text-text-dim">{r.detail}</p>
                {/* The question, not just the risk. A flag with no question
                    attached is something to worry about rather than something
                    to do. */}
                <p className="mt-1.5 text-xs text-text">
                  <span className="eyebrow mr-1.5">Ask</span>
                  {r.question}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Answering Level 3 ──
          The card names the standby gap on every pricing defense, and until
          this existed there was no way to close it — a gap the product raises
          and gives you no means to answer is a nag, not a workflow. */}
      {utility.utilityName && !answering ? (
        <Button variant="secondary" size="sm" onClick={() => setAnswering(true)}>
          {utility.level >= 3 ? 'Update the tariff terms' : 'Answer the standby question'}
        </Button>
      ) : null}
      {answering && utility.utilityName ? (
        <TariffForm
          utility={utility}
          onDone={() => setAnswering(false)}
        />
      ) : null}
      {!utility.utilityName ? (
        <p className="text-2xs text-text-faint">
          Level 3 needs a named utility — a standby schedule belongs to a specific tariff
          book. Name the beachhead&rsquo;s utility first.
        </p>
      ) : null}

      {utility.gaps.length > 0 ? (
        <div>
          <p className="eyebrow mb-1.5">What would sharpen this</p>
          <ul className="space-y-1">
            {utility.gaps.map((g) => (
              <li key={g} className="text-xs text-text-dim">
                — {g}
              </li>
            ))}
          </ul>
          {/* Named so the fix is obvious, since site-level territory is the one
              input the resolver prefers and nothing else populates it. */}
          {!deal.beachhead_utility && deal.beachhead_site ? (
            <p className="mt-1.5 text-2xs text-text-faint">
              The beachhead site ({deal.beachhead_site}) has no utility on record. Site-level
              territory wins over the account-level field — on a national account those are
              routinely different utilities.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Record what the tariff actually says.
 *
 * FREE TEXT, not a number. A standby charge is a rate SCHEDULE with a
 * structure — demand-based, ratcheted, seasonal, sometimes waived below a
 * threshold — and squeezing it into a $/kW-month field would produce a figure
 * that looks like a measurement and is a summary of one. The card quotes what
 * is written here, so what is written here has to be quotable.
 *
 * Empty stays empty. Saving a blank form leaves the gap open rather than
 * recording "checked, nothing found", because those are different facts and
 * only one of them is true.
 */
function TariffForm({
  utility,
  onDone,
}: {
  utility: UtilityContext;
  onDone: () => void;
}) {
  const router = useRouter();
  const [standby, setStandby] = useState('');
  const [departing, setDeparting] = useState('');
  const [exitFee, setExitFee] = useState('');
  const [minimumTake, setMinimumTake] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/utility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: (utility.utilityName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: utility.utilityName,
          state: utility.state ?? '',
          type: utility.utilityType ?? 'iou',
          serviceModel: utility.serviceModel,
          standbyTariff: standby.trim() || null,
          departingLoadCharge: departing.trim() || null,
          exitFee: exitFee.trim() || null,
          minimumTake: minimumTake.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      onDone();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-card border border-rule bg-bg-raised p-3">
      <p className="eyebrow">Level 3 — {utility.utilityName}</p>
      <p className="text-2xs text-text-faint">
        What the tariff says, in its own terms. The pricing defense card quotes this, so a
        schedule name and the structure beat a single number.
      </p>
      <Field
        label="Standby rate schedule"
        value={standby}
        onChange={setStandby}
        placeholder="Schedule S — demand-based standby, ratcheted on the 12-month peak, applies above 500 kW of onsite generation."
      />
      <Field label="Departing-load charge" value={departing} onChange={setDeparting} />
      <Field label="Exit fee" value={exitFee} onChange={setExitFee} />
      <Field label="Minimum-take provision" value={minimumTake} onChange={setMinimumTake} />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-2xs text-text-faint">
        This is a fact about the utility, not about this deal — it applies to every deal in
        the territory once recorded.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = `tariff-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
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
    </div>
  );
}
