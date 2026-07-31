'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ExternalLink, Zap, Clock, X, Maximize2, MessagesSquare,
  Check, FileText, Loader2, Bookmark, Share2, Undo2,
} from 'lucide-react';
import type { FeedItem as FeedItemType, Deal } from '@/lib/types';
import type { ItemState } from '@/lib/feed-state';
import { relativeTime, cn } from '@/lib/utils';
import { categoryLabel, getActiveVertical } from '@/lib/active-vertical';
import { entitiesIn } from '@/lib/engine/entities';
import { PLATFORM_LABELS, platformOf } from '@/lib/platforms';
import { setAskContext } from '@/lib/ask-context';
import { useSwipeDismiss } from '@/lib/use-swipe';
import ProvenanceChip, { ConfidenceRule } from '@/components/ui/provenance-chip';
import { EntityChip } from '@/components/ui/entity-link';
import Badge from '@/components/ui/badge';
import DetailPanel from './detail-panel';
import PromoteToSignal from './promote-to-signal';

const ARRIVAL_LABELS: Record<string, string> = {
  rss: 'RSS',
  youtube: 'YouTube',
  reddit: 'Reddit',
  share: 'Shared',
  manual: 'Manual',
  seed: 'Seed',
};

/**
 * A single feed item, with the depth layer's action rail.
 *
 * Reading order is deliberate and unchanged: provenance first (can I trust
 * this?), then the headline, then the synthesis, then who it hits, then what to
 * do. A reader scanning at speed should be able to stop after the account
 * mapping line.
 *
 * The rail is seven actions and they are grouped by what they change:
 *   · Dive deeper / Ask / Share — change what the READER sees or knows.
 *   · Save to deal / Promote to signal / Add to brief — change the WORK. Each
 *     writes somewhere a rep will find it later without having to remember.
 *   · Dismiss — removes it, with a reason and an undo.
 *
 * Swipe-to-dismiss on touch claims the X axis only; vertical scroll stays with
 * the browser, because a feed that eats your scroll is unusable one-handed.
 */
export default function FeedItemCard({
  item,
  deals,
  state,
  onStateChange,
  onDismissed,
  lazySummary = false,
}: {
  item: FeedItemType;
  deals: Deal[];
  state?: ItemState;
  onStateChange?: (id: string, state: ItemState | null) => void;
  /** Lets the feed drop the card and offer an Undo. */
  onDismissed?: (id: string, reason: string | null) => void;
  /**
   * True for items below the feed's eager window: they carry a raw feed snippet
   * and get their real AI summary and outreach hook from /api/action the first
   * time the reader opens them.
   */
  lazySummary?: boolean;
}) {
  const router = useRouter();
  const vertical = getActiveVertical();

  const [detail, setDetail] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saveMenu, setSaveMenu] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [inBrief, setInBrief] = useState(false);
  const [saved, setSaved] = useState(false);

  const [lazy, setLazy] = useState<{ synthesis: string | null; action: string | null } | null>(null);
  const [lazyBusy, setLazyBusy] = useState(false);
  const [lazyDone, setLazyDone] = useState(false);

  const synthesis = lazy?.synthesis ?? item.synthesis;
  const action = lazy?.action ?? item.action;
  const itemKey = item.url_hash ?? item.id;

  const hits = item.deal_ids
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

  const entities = useMemo(() => entitiesIn(item, deals), [item, deals]);

  const swipe = useSwipeDismiss(() => void dismiss(null));

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

  function openDetail() {
    setDetail(true);
    void loadSummary();
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
    }
  }

  /** Dismiss with an optional reason, and hand the feed an undo. */
  async function dismiss(reason: string | null) {
    setBusy(true);
    try {
      await fetch('/api/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemKey, reason }),
      });
      onDismissed?.(itemKey, reason);
    } catch {
      setNote('Could not dismiss that.');
    } finally {
      setBusy(false);
    }
  }

  /** Attach to a deal — the account's Research section, not a personal vault. */
  async function saveToDeal(deal: Deal) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          url: item.url,
          source: item.source_name,
          tier: item.tier,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaved(true);
      setNote(`Saved to ${deal.company}.`);
    } catch {
      setNote('Could not save that to the deal.');
    } finally {
      setBusy(false);
      setSaveMenu(false);
    }
  }

  /** Flag for the next brief, plan or MAP generated for this account. */
  async function addToBrief() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/brief-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemKey,
          title: item.title,
          url: item.url,
          source: item.source_name,
          tier: item.tier,
          synthesis,
          dealId: hits[0]?.id ?? null,
          remove: inBrief,
        }),
      });
      if (!res.ok) throw new Error('queue failed');
      setInBrief((v) => !v);
      setNote(inBrief ? 'Removed from the brief queue.' : 'Added — it will appear in Forge.');
    } catch {
      setNote('Could not update the brief queue.');
    } finally {
      setBusy(false);
    }
  }

  /** Carry the item AND its account into chat, in methodology. */
  function ask() {
    setAskContext({
      title: item.title,
      synthesis,
      source: item.source_name,
      url: item.url,
      tier: item.tier,
      dealId: hits[0]?.id ?? null,
      dealLabel: hits[0] ? `${hits[0].deal_id} — ${hits[0].company}` : null,
    });
    const params = new URLSearchParams({ about: item.title });
    if (hits[0]) params.set('deal', hits[0].id);
    router.push(`/app/chat?${params.toString()}`);
  }

  async function share() {
    const url = item.url ?? window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote('Link copied.');
      }
    } catch {
      // A cancelled share sheet is not an error.
    }
  }

  // Triaged items collapse to one line with an Undo. Removing them outright
  // would make the action feel like a delete, with no way back.
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
          className="ml-3 inline-flex h-11 shrink-0 items-center text-xs text-accent-dim underline underline-offset-2"
        >
          Undo
        </button>
      </article>
    );
  }

  const rail = (
    <div className="flex flex-wrap items-center gap-1">
      <RailButton icon={Maximize2} label="Dive deeper" onClick={openDetail} />
      <RailButton icon={MessagesSquare} label="Ask" onClick={ask} />
      <RailButton
        icon={Bookmark}
        label={saved ? 'Saved' : 'Save to deal'}
        accent={saved}
        disabled={busy}
        onClick={() => {
          // Exactly one mapped deal is unambiguous — save straight to it.
          if (hits.length === 1) void saveToDeal(hits[0]);
          else setSaveMenu((v) => !v);
        }}
      />
      <RailButton
        icon={Zap}
        label="Promote to signal"
        disabled={busy}
        onClick={() => setPromoting((v) => !v)}
      />
      <RailButton
        icon={FileText}
        label={inBrief ? 'In brief' : 'Add to brief'}
        accent={inBrief}
        disabled={busy}
        onClick={addToBrief}
      />
      <RailButton icon={Share2} label="Share" onClick={share} />
      <RailButton icon={X} label="Dismiss" disabled={busy} onClick={() => void dismiss(null)} />
    </div>
  );

  return (
    <>
      <article
        {...swipe.handlers}
        style={{
          transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.settling ? 'transform 160ms ease-out' : undefined,
          touchAction: 'pan-y',
        }}
        className={cn(
          'rounded-card border bg-bg-raised p-3.5 transition-colors',
          item.breaking ? 'border-accent-border' : 'border-rule',
          swipe.armed && 'border-danger',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip tier={item.tier} />
          {/* Provenance and channel are different questions — how much to trust
              it, and where it came from — so both are readable at a glance. */}
          <Badge tone="neutral">{PLATFORM_LABELS[platformOf(item)]}</Badge>
          {item.source_name ? (
            <span className="truncate text-xs text-text-dim">{item.source_name}</span>
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

        <h3 className="mt-2 font-display text-base leading-snug text-text">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {item.title}
              <ExternalLink size={11} className="ml-1 inline align-baseline opacity-50" />
            </a>
          ) : (
            item.title
          )}
        </h3>

        <div className="my-2.5 flex items-center gap-2">
          <ConfidenceRule confidence={item.confidence} className="flex-1" />
          <span className="shrink-0 font-mono text-2xs text-text-faint">
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

        {action ? <p className="mt-2 text-sm italic text-accent-dim">→ {action}</p> : null}

        <div className="mt-3 border-t border-rule pt-2.5">{rail}</div>

        {/* Ambiguous save — pick the account. */}
        {saveMenu && (
          <div className="mt-2 rounded-md border border-rule bg-bg p-2">
            <p className="eyebrow mb-1.5">Save to which deal?</p>
            {deals.length === 0 ? (
              <p className="text-xs text-text-dim">No deals in the pipeline yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(hits.length > 0 ? hits : deals.slice(0, 12)).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => saveToDeal(d)}
                    className="inline-flex min-h-tap-sm items-center gap-1.5 rounded border border-rule px-2 py-1 text-xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
                  >
                    <Check size={11} aria-hidden />
                    {d.company}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {promoting && (
          <div className="mt-2 rounded-md border border-rule bg-bg p-2.5">
            <PromoteToSignal
              item={item}
              deals={deals}
              onDone={(message) => {
                setPromoting(false);
                if (message) setNote(message);
              }}
            />
          </div>
        )}

        {note ? <p className="mt-2 text-xs text-text-dim">{note}</p> : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <RailButton
            icon={Clock}
            label="Snooze"
            disabled={busy}
            onClick={() => mark('snoozed', { hours: 24 })}
          />
          {!expanded && ((synthesis && synthesis.length > 200) || item.byline || lazySummary) ? (
            <RailButton icon={ChevronDown} label="More" onClick={() => { setExpanded(true); void loadSummary(); }} />
          ) : null}
        </div>

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
            <p>Confidence {Math.round(item.confidence * 100)}% · action graded {item.action_tier}</p>
          </div>
        )}
      </article>

      {detail && (
        <DetailPanel
          item={{ ...item, synthesis, action }}
          deals={deals}
          onClose={() => setDetail(false)}
          actions={rail}
        />
      )}
    </>
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
      title={label}
      className={cn(
        // 44px min touch target below desktop — the rail is seven items wide
        // and is the most-tapped thing in the product.
        'inline-flex min-h-tap items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
        'hover:bg-bg-overlay disabled:opacity-40 xl:min-h-0 xl:py-1',
        accent ? 'text-text' : 'text-text-dim hover:text-text',
      )}
    >
      <Icon size={13} className={accent ? 'text-accent' : undefined} aria-hidden />
      {label}
    </button>
  );
}

/** Exported so the feed can offer an Undo after a dismissal. */
export function DismissedRow({
  title,
  onUndo,
}: {
  title: string;
  onUndo: () => void;
}) {
  return (
    <article className="flex items-center justify-between rounded-card border border-rule bg-bg-raised px-3.5 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-text-dim">
        <span className="eyebrow mr-2">Dismissed</span>
        {title}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="ml-3 inline-flex h-11 shrink-0 items-center gap-1 text-xs text-accent-dim underline underline-offset-2"
      >
        <Undo2 size={12} aria-hidden />
        Undo
      </button>
    </article>
  );
}
