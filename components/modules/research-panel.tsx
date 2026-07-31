'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import type { Deal, FeedItem } from '@/lib/types';
import type { ResearchRun } from '@/lib/research';
import { formatDate, cn } from '@/lib/utils';
import { PLATFORM_LABELS } from '@/lib/platforms';
import FeedItemCard from './feed-item';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';

/**
 * RESEARCH — ingested last30days runs, grouped by query and date.
 *
 * The one visual rule that carries weight here: the ENGAGEMENT chip is shaped
 * deliberately unlike the tier badge. Different shape, muted, no border colour
 * that could read as a grade. They sit near each other and mean opposite kinds
 * of thing — one is how many people saw it, the other is how much you should
 * believe it — and a reader who confuses the two will put a viral Reddit post
 * in front of a customer as fact.
 */
export default function ResearchPanel({
  runs,
  itemsByKey,
  deals,
}: {
  runs: ResearchRun[];
  itemsByKey: Record<string, FeedItem>;
  deals: Deal[];
}) {
  const [open, setOpen] = useState<string | null>(runs[0]?.generatedAt ?? null);

  return (
    <div className="space-y-4">
      {runs.length === 0 ? <EmptyResearch /> : null}

      {runs.map((run) => {
        const isOpen = open === run.generatedAt;
        const items = run.itemKeys.map((k) => itemsByKey[k]).filter(Boolean);

        return (
          <section key={run.generatedAt} className="rounded-card border border-rule bg-bg-raised">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : run.generatedAt)}
              aria-expanded={isOpen}
              className="flex min-h-tap w-full items-start gap-2.5 p-4 text-left xl:min-h-0"
            >
              {isOpen ? (
                <ChevronDown size={15} className="mt-0.5 shrink-0 text-text-dim" aria-hidden />
              ) : (
                <ChevronRight size={15} className="mt-0.5 shrink-0 text-text-dim" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base text-text">{run.query}</span>
                <span className="mt-0.5 block text-xs text-text-dim">
                  {run.windowDays}-day window · run {formatDate(run.generatedAt)} ·{' '}
                  <span className="font-mono">{run.itemCount}</span> items
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {run.platforms.map((p) => (
                    <Badge key={p} tone="neutral">
                      {PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? p}
                    </Badge>
                  ))}
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-rule p-4">
                {items.length === 0 ? (
                  <p className="text-sm text-text-dim">
                    This run&rsquo;s items are no longer in the feed store.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {items.map((item) => {
                      const key = item.url_hash ?? item.id;
                      const engagement = run.engagement[key];
                      return (
                        <div key={item.id}>
                          {engagement ? (
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <EngagementChip label={engagement.label} comments={engagement.comments} />
                              <span className="text-2xs text-text-faint">
                                reach, not accuracy — the tier badge on the card is the
                                trust signal
                              </span>
                            </div>
                          ) : null}
                          <FeedItemCard item={item} deals={deals} lazySummary />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      <PasteFallback />
    </div>
  );
}

/**
 * Engagement, rendered so it cannot be mistaken for provenance.
 *
 * The tier badge is a hard-edged rectangle with a tier colour. This is a soft
 * pill, muted, monospace, no colour of its own. The difference is the point.
 */
function EngagementChip({ label, comments }: { label: string; comments?: number }) {
  return (
    <span
      title="Engagement from the source platform. Not a trust signal."
      className="inline-flex items-center gap-1 rounded-full bg-bg-overlay px-2 py-0.5 font-mono text-2xs text-text-faint"
    >
      {label}
      {comments ? ` · ${comments} comments` : ''}
    </span>
  );
}

function EmptyResearch() {
  return (
    <div className="rounded-card border border-dashed border-rule p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <FlaskConical size={14} className="text-accent" aria-hidden />
        <span className="eyebrow">No research ingested yet</span>
      </div>
      <p className="mb-3 text-sm text-text-dim">
        last30days runs on your machine — it reads browser cookies and shells out
        to yt-dlp, neither of which exists in a serverless function. So PowerDeal
        does not run it; you run it locally and POST the JSON here, and PowerDeal
        re-grades everything with its own classifier on arrival.
      </p>
      <pre className="scrollbar-thin overflow-x-auto rounded-md border border-rule bg-bg p-3 font-mono text-2xs leading-relaxed text-text-dim">
{`# one-time
/plugin marketplace add mvanhorn/last30days-skill

# per account
python3 skills/last30days/scripts/last30days.py "Westlake Corporation" \\
  --emit=json > westlake.json

curl -X POST "https://powerdeal-platform.vercel.app/api/ingest/last30days?token=$INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data @westlake.json`}
      </pre>
    </div>
  );
}

/** For when pasting output beats configuring a token and curl. */
function PasteFallback() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const parsed = JSON.parse(json) as unknown;
      const res = await fetch(
        `/api/ingest/last30days${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        ingested?: number;
        stored?: number;
        accountsHit?: string[];
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Ingest failed (${res.status})`);
      setResult(
        `Ingested ${body.ingested ?? 0}, stored ${body.stored ?? 0}` +
          (body.accountsHit?.length ? ` · accounts hit: ${body.accountsHit.join(', ')}` : ''),
      );
      setJson('');
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Could not ingest that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-rule bg-bg-raised p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-tap w-full items-center gap-2 text-left xl:min-h-0"
      >
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="eyebrow">Paste JSON instead</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="INGEST_TOKEN"
            type="password"
            className="h-tap xl:h-9 w-full max-w-xs rounded-md border border-rule bg-bg px-2 text-xs text-text focus:border-accent-border focus:outline-none"
          />
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={8}
            placeholder='{"schema_version":"1.0","query":"...","results":[...]}'
            className={cn(
              'w-full resize-y rounded-md border border-rule bg-bg px-2 py-1.5',
              'font-mono text-2xs leading-relaxed text-text placeholder:text-text-faint',
              'focus:border-accent-border focus:outline-none',
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={busy || !json.trim()}
            >
              {busy ? 'Ingesting…' : 'Ingest'}
            </Button>
            {result ? <span className="text-xs text-text-dim">{result}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
