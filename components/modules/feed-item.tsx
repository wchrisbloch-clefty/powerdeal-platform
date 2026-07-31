'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ExternalLink, Zap, UserPlus, Clock, X,
  Maximize2, BookOpenText, MessagesSquare, Check, Send, FileText, Loader2,
} from 'lucide-react';
import type { FeedItem as FeedItemType, Deal } from '@/lib/types';
import type { ItemState } from '@/lib/feed-state';
import { relativeTime, cn } from '@/lib/utils';
import { categoryLabel, getActiveVertical } from '@/lib/active-vertical';
import { entitiesIn } from '@/lib/engine/entities';
import ProvenanceChip, { ConfidenceRule } from '@/components/ui/provenance-chip';
import { EntityChip } from '@/components/ui/entity-link';
import Badge from '@/components/ui/badge';

const ARRIVAL_LABELS: Record<string, string> = {
  rss: 'RSS',
  youtube: 'YouTube',
  reddit: 'Reddit',
  share: 'Shared',
  manual: 'Manual',
  seed: 'Seed',
};

/**
 * A single feed item, with The Hub's two-row action rail ported on.
 *
 * Reading order is deliberate and unchanged: provenance first (can I trust
 * this?), then the headline, then the synthesis, then who it hits, then what
 * to do. A reader scanning at speed should be able to stop after the account
 * mapping line.
 *
 * The rails come from The Hub's ActionableItem, split as asked:
 *   · Primary — Act on it / Assign / Snooze / Not for me. These change the
 *     state of the WORK.
 *   · Secondary — Dive deeper / Explore / Ask / Dismiss. These change what the
 *     READER sees. Keeping the two visually distinct matters: mixing "I
 *     handled this" with "hide this" is how triage state stops meaning
 *     anything a week later.
 *
 * "Act on it" is PowerDeal-specific and only appears when the item maps to a
 * deal, because both of its outcomes need one — log a signal against the
 * account, or draft outreach for it. An unmapped item has nothing to act on.
 */
export default function FeedItemCard({
  item,
  deals,
  state,
  onStateChange,
  lazySummary = false,
}: {
  item: FeedItemType;
  deals: Deal[];
  state?: ItemState;
  onStateChange?: (id: string, state: ItemState | null) => void;
  /**
   * True for items below the feed's eager window: they carry a raw feed snippet
   * and get their real AI summary and outreach hook from /api/action the first
   * time the reader opens them.
   */
  lazySummary?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [actMenu, setActMenu] = useState(false);
  const [assignMenu, setAssignMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const vertical = getActiveVertical();

  // Filled in by the lazy fetch; falls back to whatever the item arrived with.
  const [lazy, setLazy] = useState<{ synthesis: string | null; action: string | null } | null>(null);
  const [lazyBusy, setLazyBusy] = useState(false);
  const [lazyDone, setLazyDone] = useState(false);

  const synthesis = lazy?.synthesis ?? item.synthesis;
  const action = lazy?.action ?? item.action;

  const hits = item.deal_ids
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  // Entities named in this item — every one links to its page, so a card is a
  // way into "what else is happening with SDG&E", not just this one story.
  const entities = useMemo(() => entitiesIn(item, deals), [item, deals]);

  /**
   * Upgrade the snippet to a real summary. Fires once, on first open, and only
   * for items the feed did not already summarize eagerly.
   */
  async function loadSummary() {
    if (!lazySummary || lazyDone || lazyBusy) return;
    setLazyBusy(true);
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          url: item.url ?? undefined,
          body: item.synthesis ?? undefined,
          source: item.source_name ?? undefined,
          category: item.category ?? undefined,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { synthesis?: string | null; action?: string | null };
        setLazy({ synthesis: body.synthesis ?? null, action: body.action ?? null });
      }
    } catch {
      // Keep the snippet. A failed upgrade is invisible rather than destructive.
    } finally {
      setLazyBusy(false);
      setLazyDone(true);
    }
  }

  function open(next: boolean) {
    setExpanded(next);
    if (next) void loadSummary();
  }

  async function mark(next: ItemState | null, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await fetch('/api/feed/item-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, state: next, ...extra }),
      });
      onStateChange?.(item.id, next);
    } catch {
      setNote('Could not save that.');
    } finally {
      setBusy(false);
      setActMenu(false);
      setAssignMenu(false);
    }
  }

  /** Log the item as an intelligence signal against a deal. */
  async function logSignal(deal: Deal) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'trigger-event',
          source_name: item.source_name ?? 'Feed',
          source_tier: item.tier,
          headline: item.title.slice(0, 300),
          detail: synthesis ?? null,
          url: item.url,
          deal_ids: [deal.id],
        }),
      });
      if (!res.ok) throw new Error('signal failed');
      setNote(`Logged to ${deal.company}.`);
      await mark('acted', { dealId: deal.id });
      router.refresh();
    } catch {
      setNote('Could not log that signal.');
      setBusy(false);
    }
  }

  /** Hand off to the deal page with the outreach task pre-armed. */
  function draftOutreach(deal: Deal) {
    void mark('acted', { dealId: deal.id });
    router.push(`/app/pipeline/${deal.id}?ai=outreach`);
  }

  // Triaged items collapse to one line with an Undo. Removing them outright
  // would make the action feel like a delete, and there would be no way back.
  if (state) {
    const label =
      state === 'snoozed' ? 'Snoozed' :
      state === 'not-for-me' ? 'Not for me' :
      state === 'assigned' ? 'Assigned' : 'Acted on';
    return (
      <article className="flex items-center justify-between rounded-card border border-rule bg-bg-raised px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-text-dim">
          <span className="eyebrow mr-2">{label}</span>
          {item.title}
        </span>
        <button
          type="button"
          onClick={() => mark(null)}
          disabled={busy}
          className="ml-3 shrink-0 text-xs text-accent-dim underline underline-offset-2"
        >
          Undo
        </button>
      </article>
    );
  }

  return (
    <article
      className={cn(
        'rounded-card border bg-bg-raised p-3.5 transition-colors',
        item.breaking ? 'border-accent-border' : 'border-rule',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceChip tier={item.tier} />
        {item.source_name ? (
          <span className="truncate text-xs text-text-dim">{item.source_name}</span>
        ) : null}
        {item.byline ? (
          <span className="truncate text-xs text-text-faint">· {item.byline}</span>
        ) : null}
        {item.category ? (
          <span className="text-xs text-text-faint">
            · {categoryLabel(vertical, item.category)}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          {item.arrival !== 'rss' ? (
            <Badge tone="neutral">{ARRIVAL_LABELS[item.arrival] ?? item.arrival}</Badge>
          ) : null}
          <span className="whitespace-nowrap text-xs text-text-faint">
            {relativeTime(item.published_at ?? item.cached_at)}
          </span>
        </span>
      </div>

      <h3 className="mt-2 font-display text-[15px] leading-snug text-text">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {item.title}
            <ExternalLink size={11} className="ml-1 inline align-baseline opacity-50" />
          </a>
        ) : (
          item.title
        )}
      </h3>

      {/* Confidence as a bar AND a number — the bar is scannable, the number
          is what you quote when someone asks how sure you are. */}
      <div className="my-2.5 flex items-center gap-2">
        <ConfidenceRule confidence={item.confidence} className="flex-1" />
        <span className="shrink-0 font-mono text-[11px] text-text-faint">
          {Math.round(item.confidence * 100)}%
        </span>
      </div>

      {synthesis ? (
        <p className={cn('text-sm leading-relaxed text-text-dim', !expanded && 'line-clamp-3')}>
          {synthesis}
        </p>
      ) : null}

      {lazyBusy ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-faint">
          <Loader2 size={11} className="animate-spin" aria-hidden />
          Summarizing…
        </p>
      ) : null}

      {entities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entities.map((e) => (
            <EntityChip key={e.name} entity={e} />
          ))}
        </div>
      )}

      {/* Account mapping — the line that turns news into a call list. */}
      {hits.length > 0 && (
        <p className="mt-2.5 text-sm text-text-dim">
          <span className="eyebrow mr-1.5">Hits</span>
          {hits.map((d, i) => (
            <span key={d.id}>
              {i > 0 ? ', ' : ''}
              <Link
                href={`/app/pipeline/${d.id}`}
                className="text-text underline decoration-rule underline-offset-2 hover:decoration-accent"
              >
                {d.company}
              </Link>
            </span>
          ))}
        </p>
      )}

      {action ? (
        <p className="mt-2 text-sm italic text-accent-dim">→ {action}</p>
      ) : null}

      {/* ── Primary rail: what happens to the work ── */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-rule pt-2.5">
        {hits.length > 0 ? (
          <>
            <RailButton
              icon={Zap}
              label="Act on it"
              accent
              disabled={busy}
              onClick={() => setActMenu((v) => !v)}
            />
            <RailButton
              icon={UserPlus}
              label="Assign"
              disabled={busy}
              onClick={() => setAssignMenu((v) => !v)}
            />
          </>
        ) : null}
        <RailButton
          icon={Clock}
          label="Snooze"
          disabled={busy}
          onClick={() => mark('snoozed', { hours: 24 })}
        />
        <RailButton
          icon={X}
          label="Not for me"
          disabled={busy}
          onClick={() => mark('not-for-me')}
        />
      </div>

      {/* Act on it → the two things a signal can become. */}
      {actMenu && hits.length > 0 && (
        <div className="mt-2 rounded-md border border-rule bg-bg p-2">
          <p className="eyebrow mb-1.5">Act on it</p>
          <div className="flex flex-col gap-1.5">
            {hits.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-text-dim">{d.company}</span>
                <MenuButton icon={FileText} label="Log as signal" onClick={() => logSignal(d)} />
                <MenuButton icon={Send} label="Draft outreach" onClick={() => draftOutreach(d)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {assignMenu && hits.length > 0 && (
        <div className="mt-2 rounded-md border border-rule bg-bg p-2">
          <p className="eyebrow mb-1.5">Assign to deal</p>
          <div className="flex flex-wrap gap-1.5">
            {hits.map((d) => (
              <MenuButton
                key={d.id}
                icon={Check}
                label={d.company}
                onClick={() => mark('assigned', { dealId: d.id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Secondary rail: what the reader sees ── */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <RailButton icon={Maximize2} label="Dive deeper" onClick={() => open(!expanded)} />
        {item.url ? (
          <RailButton
            icon={BookOpenText}
            label="Explore"
            onClick={() => window.open(item.url ?? '', '_blank', 'noopener,noreferrer')}
          />
        ) : null}
        <RailButton
          icon={MessagesSquare}
          label="Ask"
          onClick={() => {
            // Grounded through the URL, which is what /app/chat actually reads.
            // This used to stash context in sessionStorage that nothing ever
            // picked up, so the button opened a cold chat every time.
            const params = new URLSearchParams({ about: item.title });
            if (hits[0]) params.set('deal', hits[0].id);
            router.push(`/app/chat?${params.toString()}`);
          }}
        />
        <RailButton icon={X} label="Dismiss" disabled={busy} onClick={() => mark('not-for-me')} />
      </div>

      {note ? <p className="mt-2 text-xs text-text-dim">{note}</p> : null}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-rule pt-3 text-xs text-text-dim">
          {item.byline ? <p>By {item.byline}</p> : null}
          {item.vertical_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.vertical_tags.map((t) => (
                <Badge key={t} tone="neutral">{t}</Badge>
              ))}
            </div>
          )}
          <p>
            Confidence {Math.round(item.confidence * 100)}% · action graded {item.action_tier}
          </p>
        </div>
      )}

      {!expanded && ((synthesis && synthesis.length > 200) || item.byline || lazySummary) ? (
        <button
          type="button"
          onClick={() => open(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-text-dim hover:text-text"
        >
          More
          <ChevronDown size={12} />
        </button>
      ) : null}
    </article>
  );
}

function RailButton({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
}: {
  icon: typeof Zap;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-bg-overlay disabled:opacity-40',
        accent ? 'text-text' : 'text-text-dim hover:text-text',
      )}
    >
      <Icon size={13} className={accent ? 'text-accent' : undefined} aria-hidden />
      {label}
    </button>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Zap;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded border border-rule px-2 py-1 text-xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
    >
      <Icon size={11} aria-hidden />
      {label}
    </button>
  );
}
