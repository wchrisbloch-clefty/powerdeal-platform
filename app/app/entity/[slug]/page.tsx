import Link from 'next/link';
import { ArrowLeft, Building2, Globe, MessagesSquare, Radar, Users } from 'lucide-react';
import { getDeals } from '@/lib/data';
import { getFeedStates, type FeedStateMap } from '@/lib/feed-state';
import { getLiveFeed } from '@/lib/engine/live-feed';
import { webSearch } from '@/lib/engine/web-search';
import { classifyExternal } from '@/lib/engine/tiering';
import {
  dealsForEntity,
  extractEntities,
  itemsForEntity,
  peersAround,
  resolveEntity,
  slugify,
} from '@/lib/engine/entities';
import FeedItemCard from '@/components/modules/feed-item';
import ConsensusPanel from '@/components/modules/consensus-panel';
import PeerChip from '@/components/modules/peer-chip';
import { TrendingRow } from '@/components/modules/trending-panel';
import { entityTypeLabel } from '@/components/ui/entity-link';
import DealCard from '@/components/ui/deal-card';
import ProvenanceChip from '@/components/ui/provenance-chip';
import Badge from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const BASIS_LABELS = {
  company: 'Named directly',
  utility: 'In this utility territory',
  state: 'In this state',
} as const;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ slug }, { q }] = await Promise.all([params, searchParams]);
  return { title: q?.trim() || slug.replace(/-/g, ' ') };
}

/**
 * ENTITY PAGE — where Trending and Today's Topics land.
 *
 * Ported from The Hub's topic page, with the section order changed for BD.
 * The Hub leads with what your sources say, because its reader is trying to
 * understand a story. This leads with DEALS AFFECTED, because its reader is
 * trying to decide who to call — the news is the evidence, the account list is
 * the answer, and burying the account list under six article cards would invert
 * the reason the page exists.
 *
 * Everything expensive is either lazy (consensus, client-side) or best-effort
 * (web coverage, caught). A slow search must not hold up the deal list.
 */
export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ slug }, { q }] = await Promise.all([params, searchParams]);

  const { data: deals } = await getDeals();
  const entity = resolveEntity(slug, q, deals);

  const [feed, web, states] = await Promise.all([
    getLiveFeed(deals).catch(() => null),
    // Best-effort: the wider web is the one block that can be missing without
    // the page losing its point.
    webSearch(entity.name).catch(() => []),
    getFeedStates().catch((): FeedStateMap => ({})),
  ]);

  const pool = feed?.items ?? [];
  const mine = itemsForEntity(pool, entity);
  const affected = dealsForEntity(entity, deals);
  const peers = peersAround(mine, deals, entity);

  const related = extractEntities(mine.length > 2 ? mine : pool, deals, 10).filter(
    (t) => slugify(t.name) !== slugify(entity.name),
  );

  const askHref =
    `/app/chat?about=${encodeURIComponent(entity.name)}` +
    (affected[0] ? `&deal=${encodeURIComponent(affected[0].deal.id)}` : '');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/app/intelligence"
        className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-text"
      >
        <ArrowLeft size={15} aria-hidden /> Intelligence
      </Link>

      {/* ── Header ── */}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Entity</span>
          <Badge tone="neutral">{entityTypeLabel(entity.type)}</Badge>
          {entity.type === 'company' ? (
            <Badge tone={entity.inSpine ? 'accent' : 'neutral'}>
              {entity.inSpine ? 'In pipeline' : 'Not in pipeline'}
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-1.5 font-display text-2xl text-text">{entity.name}</h1>
        <p className="mt-1.5 text-sm text-text-dim">
          <span className="font-mono">{mine.length}</span> in your sources ·{' '}
          <span className="font-mono">{web.length}</span> across the web · hits{' '}
          <span className="font-mono">{affected.length}</span>{' '}
          {affected.length === 1 ? 'deal' : 'deals'}
        </p>
        {feed?.isSeed ? (
          <p className="mt-2 rounded-card border border-rule bg-bg-raised px-3 py-2 text-xs text-text-dim">
            Live sources were unreachable — the items below come from seed
            content, not today&rsquo;s feed.
          </p>
        ) : null}

        <Link
          href={askHref}
          className="mt-3.5 inline-flex h-tap xl:h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-dim"
        >
          <MessagesSquare size={15} aria-hidden /> Ask about {entity.name}
        </Link>
      </header>

      {/* ── Deals affected — the reason this page exists ── */}
      <section>
        <div className="mb-2.5 flex items-center gap-1.5">
          <Building2 size={13} className="text-accent" aria-hidden />
          <span className="eyebrow">Deals affected</span>
        </div>
        {affected.length === 0 ? (
          <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
            No deal in the pipeline maps to this entity — by company, utility
            territory, or state.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {affected.map(({ deal, basis }) => (
              <div key={`${deal.id}-${basis}`}>
                <DealCard deal={deal} />
                {/* The basis travels with the card: a state-level match is real
                    but weak, and a rep should know which one they are citing. */}
                <p className="mt-1 pl-1 text-2xs text-text-faint">
                  {BASIS_LABELS[basis]}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── What your sources say ── */}
      <section>
        <p className="eyebrow mb-2.5">What your sources say</p>
        {mine.length === 0 ? (
          <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
            Nothing in your configured sources mentions this yet.
          </p>
        ) : (
          <div className="grid gap-3">
            {mine.slice(0, 8).map((item, i) => (
              <FeedItemCard
                key={item.id}
                item={item}
                deals={deals}
                state={states[item.id]?.state}
                // Beyond the eager window the summary is fetched on open, same
                // rule as the main feed.
                lazySummary={i >= 3 && !feed?.isSeed}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── What the wider web says — visually separated, independently tiered ── */}
      <section className="rounded-card border border-dashed border-rule p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <Globe size={13} className="text-text-dim" aria-hidden />
          <span className="eyebrow">What the wider web says</span>
        </div>
        <p className="mb-3 text-xs text-text-dim">
          Not from your sources. Graded on the same evidence, so most of it lands
          INFERRED — corroborate before acting on any of it.
        </p>
        {web.length === 0 ? (
          <p className="text-sm text-text-dim">No open-web coverage found.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {web.slice(0, 8).map((w, i) => {
              const tier = classifyExternal({
                title: w.title,
                url: w.link,
                source: w.source,
                desc: w.desc,
              }).tier;
              return (
                <li key={`${w.link}-${i}`} className="rounded-card border border-rule bg-bg-raised p-3">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <ProvenanceChip tier={tier} />
                    <span className="truncate text-xs text-text-dim">{w.source}</span>
                  </div>
                  <a
                    href={w.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-sm leading-snug text-text hover:text-accent-dim"
                  >
                    {w.title}
                  </a>
                  {w.desc ? (
                    <p className="mt-1 line-clamp-2 text-xs text-text-dim">{w.desc}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Where sources agree and disagree ── */}
      <section>
        <p className="eyebrow mb-2.5">Where sources agree and disagree</p>
        <ConsensusPanel entity={entity.name} />
      </section>

      {/* ── Peer radar ── */}
      {peers.length > 0 ? (
        <section>
          <div className="mb-1 flex items-center gap-1.5">
            <Radar size={13} className="text-accent" aria-hidden />
            <span className="eyebrow">Peer radar — add to pipeline?</span>
          </div>
          <p className="mb-2.5 text-xs text-text-dim">
            Named alongside {entity.name} in the items above, and not in your
            book. Candidates only.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {peers.map((peer) => (
              <PeerChip key={peer.name} peer={peer} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Related entities ── */}
      {related.length > 0 ? (
        <section className="border-t border-rule pt-5">
          <TrendingRow trends={related} label="Related entities" />
        </section>
      ) : null}

      {mine.length === 0 && web.length === 0 && affected.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-text-dim">
          <Users size={14} aria-hidden />
          Nothing on this entity yet. It may have trended on a single mention
          that has since aged out of the window.
        </p>
      ) : null}
    </div>
  );
}
