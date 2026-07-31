'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Loader2, X } from 'lucide-react';
import type { Deal, FeedItem, SourceTier } from '@/lib/types';
import { relativeTime, cn } from '@/lib/utils';
import { entitiesIn } from '@/lib/engine/entities';
import { platformOf, PLATFORM_LABELS } from '@/lib/platforms';
import ProvenanceChip, { ConfidenceRule } from '@/components/ui/provenance-chip';
import { EntityChip } from '@/components/ui/entity-link';
import Badge from '@/components/ui/badge';

interface Coverage {
  title: string;
  source: string;
  url: string;
  tier: SourceTier;
  desc?: string;
}

interface KeyFacts {
  facts: string[];
  thin: boolean;
  note: string | null;
  cached?: boolean;
}

/**
 * The depth layer — "Dive deeper". Ported from The Hub's DetailPanel, with the
 * deal-aware blocks it does not have.
 *
 * Right-side panel on desktop and iPad, bottom sheet on mobile. Esc, scrim and
 * × all close it, and body scroll locks while it is open — a panel you can
 * scroll the page behind feels broken on touch.
 */
export default function DetailPanel({
  item,
  deals,
  onClose,
  actions,
}: {
  item: FeedItem;
  deals: Deal[];
  onClose: () => void;
  /** The same action rail as the card, repeated at the bottom. */
  actions?: React.ReactNode;
}) {
  const [coverage, setCoverage] = useState<Coverage[] | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);
  const [keyFacts, setKeyFacts] = useState<KeyFacts | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [loadingFacts, setLoadingFacts] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const hits = item.deal_ids
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  const entities = entitiesIn(item, deals, 8);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Full Coverage — what other outlets say about the same story.
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/coverage?q=${encodeURIComponent(item.title)}`, { signal: c.signal })
      .then((r) => r.json())
      .then((d: { results?: Coverage[] }) => setCoverage(d.results ?? []))
      .catch(() => setCoverage([]))
      .finally(() => setLoadingCoverage(false));
    return () => c.abort();
  }, [item.title]);

  // Key facts — generated on dive-deeper only, never eagerly across the feed.
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/key-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: c.signal,
      body: JSON.stringify({
        itemKey: item.url_hash ?? item.id,
        title: item.title,
        url: item.url ?? undefined,
        summary: item.synthesis ?? undefined,
        source: item.source_name ?? undefined,
        dealIds: item.deal_ids,
      }),
    })
      .then(async (r) => {
        const body = (await r.json()) as KeyFacts & { error?: string };
        if (!r.ok) throw new Error(body.error ?? 'Key facts failed.');
        setKeyFacts(body);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setFactsError(err.message);
      })
      .finally(() => setLoadingFacts(false));
    return () => c.abort();
  }, [item.id, item.title, item.url, item.url_hash, item.synthesis, item.source_name, item.deal_ids]);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — nothing useful to say about it */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/60"
      onClick={onClose}
role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Item detail"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-rule bg-bg',
          // Bottom sheet below md.
          'max-md:mt-auto max-md:h-[85vh] max-md:max-w-full max-md:rounded-t-card max-md:border-l-0 max-md:border-t',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-bg px-4 py-3">
          <p className="eyebrow">Dive deeper</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text-dim hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip tier={item.tier} />
            <Badge tone="neutral">{PLATFORM_LABELS[platformOf(item)]}</Badge>
            {item.source_name ? (
              <span className="truncate text-xs text-text-dim">{item.source_name}</span>
            ) : null}
            <span className="ml-auto text-xs text-text-faint">
              {relativeTime(item.published_at ?? item.cached_at)}
            </span>
          </div>

          <h2 className="mt-2.5 font-display text-lg leading-snug text-text">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {item.title}
                <ExternalLink size={12} className="ml-1 inline align-baseline opacity-50" />
              </a>
            ) : (
              item.title
            )}
          </h2>

          {item.synthesis ? (
            <p className="mt-2.5 text-sm leading-relaxed text-text-dim">{item.synthesis}</p>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <ConfidenceRule confidence={item.confidence} className="flex-1" />
            <span className="shrink-0 font-mono text-[11px] text-text-faint">
              {Math.round(item.confidence * 100)}%
            </span>
          </div>

          {/* Why this grade — the reasoning behind the tier. */}
          <div className="mt-3 rounded-card border border-rule p-3">
            <p className="eyebrow mb-1">Why this grade</p>
            <p className="text-sm text-text-dim">{tierReasoning(item)}</p>
          </div>

          {/* ── AI Key Facts ── */}
          <section className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="eyebrow">Key facts</span>
              <Badge tone="neutral">AI</Badge>
              {/* The facts inherit the ITEM's tier, never a higher one. A
                  well-written synthesis of an inferred source is still
                  inferred. */}
              <ProvenanceChip tier={item.tier} />
              {keyFacts?.facts.length ? (
                <button
                  type="button"
                  onClick={() => copy(keyFacts.facts.map((f) => `• ${f}`).join('\n'), 'all')}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-dim hover:text-text"
                >
                  {copied === 'all' ? <Check size={11} /> : <Copy size={11} />}
                  {copied === 'all' ? 'Copied' : 'Copy all'}
                </button>
              ) : null}
            </div>

            {loadingFacts ? (
              <p className="flex items-center gap-2 text-sm text-text-dim">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Reading the article…
              </p>
            ) : factsError ? (
              <p className="text-sm text-text-dim">{factsError}</p>
            ) : keyFacts?.facts.length ? (
              <>
                {keyFacts.note ? (
                  <p className="mb-2 rounded-md border border-rule bg-bg-raised px-2.5 py-1.5 text-xs text-text-dim">
                    {keyFacts.note}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {keyFacts.facts.map((fact, i) => (
                    <li key={i} className="group flex items-start gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="flex-1 text-sm leading-relaxed text-text-dim">{fact}</span>
                      <button
                        type="button"
                        onClick={() => copy(fact, `f${i}`)}
                        aria-label="Copy this fact"
                        className="shrink-0 text-text-faint opacity-0 transition-opacity hover:text-text focus:opacity-100 group-hover:opacity-100"
                      >
                        {copied === `f${i}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-text-dim">
                Nothing usable could be drawn from this one.
              </p>
            )}
          </section>

          {/* ── Deal impact ── */}
          {hits.length > 0 && (
            <section className="mt-5">
              <p className="eyebrow mb-2">Deal impact</p>
              <ul className="flex flex-col gap-2">
                {hits.map((deal) => (
                  <li key={deal.id} className="rounded-card border border-rule bg-bg-raised p-3">
                    <Link
                      href={`/app/pipeline/${deal.id}`}
                      className="text-sm text-text underline decoration-rule underline-offset-2 hover:decoration-accent"
                    >
                      {deal.deal_id} · {deal.company}
                    </Link>
                    <p className="mt-0.5 text-xs text-text-dim">
                      {deal.stage}
                      {deal.utility ? ` · ${deal.utility}` : ''}
                      {deal.state ? ` · ${deal.state}` : ''}
                    </p>
                    {item.action ? (
                      <p className="mt-1.5 text-sm italic text-accent-dim">→ {item.action}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Full Coverage ── */}
          <section className="mt-5 border-t border-rule pt-4">
            <p className="eyebrow mb-2">
              Across the web{coverage ? ` · ${coverage.length}` : ''}
            </p>
            <p className="mb-2.5 text-xs text-text-dim">
              Independently graded. Where these disagree with each other is the
              interesting part — that is a question to walk into a meeting with.
            </p>
            {loadingCoverage ? (
              <p className="flex items-center gap-2 text-sm text-text-dim">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Finding more coverage…
              </p>
            ) : coverage && coverage.length > 0 ? (
              <ul className="flex flex-col gap-2.5">
                {coverage.map((c, i) => (
                  <li key={`${c.url}-${i}`}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 text-sm"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--prov-${c.tier})` }}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="text-text group-hover:text-accent-dim">{c.title}</span>
                        <span className="mt-0.5 block text-xs text-text-dim">{c.source}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-dim">No wider coverage found.</p>
            )}
          </section>

          {entities.length > 0 && (
            <section className="mt-5 border-t border-rule pt-4">
              <p className="eyebrow mb-2">Entities</p>
              <div className="flex flex-wrap gap-1.5">
                {entities.map((e) => (
                  <EntityChip key={e.name} entity={e} />
                ))}
              </div>
            </section>
          )}

          {/* Action rail repeated at the bottom, so a reader who has scrolled
              the whole panel does not have to scroll back up to act. */}
          {actions ? (
            <section className="mt-5 border-t border-rule pt-4">{actions}</section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/**
 * Why an item carries the grade it does.
 *
 * Reconstructed from what the row already records rather than stored: the
 * classifier's reason is not persisted, and adding a column to carry a sentence
 * the reader can be told anyway is not worth a migration.
 */
function tierReasoning(item: FeedItem): string {
  const source = item.source_name ?? 'this source';
  switch (item.tier) {
    case 'verified':
      return `Primary source — ${source} publishes filings, dockets or data directly, so this is on the record rather than reported second-hand.`;
    case 'reported':
      return `Trade press reporting on a primary source. ${source} is credible on this beat, but the underlying document is one step away — worth citing, worth checking before quoting a figure.`;
    default:
      return `Aggregator, social, discovery net, or speculative framing. ${source} is a lead, not evidence. Corroborate before this goes anywhere near a customer.`;
  }
}
