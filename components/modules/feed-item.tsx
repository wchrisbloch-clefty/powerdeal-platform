'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { FeedItem as FeedItemType, Deal } from '@/lib/types';
import { relativeTime, cn } from '@/lib/utils';
import { categoryLabel } from '@/lib/active-vertical';
import { getActiveVertical } from '@/lib/active-vertical';
import ProvenanceChip, { ConfidenceRule } from '@/components/ui/provenance-chip';
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
 * A single feed item.
 *
 * Reading order is deliberate: provenance first (can I trust this?), then the
 * headline, then the synthesis, then who it hits, then what to do. A reader
 * scanning at speed should be able to stop after the account mapping line.
 */
export default function FeedItemCard({
  item,
  deals,
}: {
  item: FeedItemType;
  deals: Deal[];
}) {
  const [expanded, setExpanded] = useState(false);
  const vertical = getActiveVertical();

  const hits = item.deal_ids
    .map((id) => deals.find((d) => d.id === id))
    .filter((d): d is Deal => Boolean(d));

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
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {item.title}
            <ExternalLink size={11} className="ml-1 inline align-baseline opacity-50" />
          </a>
        ) : (
          item.title
        )}
      </h3>

      <ConfidenceRule confidence={item.confidence} className="my-2.5" />

      {item.synthesis ? (
        <p className={cn('text-sm leading-relaxed text-text-dim', !expanded && 'line-clamp-3')}>
          {item.synthesis}
        </p>
      ) : null}

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

      {item.action ? (
        <p className="mt-2 text-sm italic text-accent-dim">→ {item.action}</p>
      ) : null}

      {(item.synthesis && item.synthesis.length > 200) || item.byline ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-xs text-text-dim hover:text-text"
        >
          {expanded ? 'Less' : 'More'}
          <ChevronDown
            size={12}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      ) : null}

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
            Confidence {Math.round(item.confidence * 100)}% · action graded{' '}
            {item.action_tier}
          </p>
        </div>
      )}
    </article>
  );
}
