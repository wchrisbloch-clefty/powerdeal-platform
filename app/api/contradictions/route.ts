import { NextResponse } from 'next/server';
import { getDeals } from '@/lib/data';
import { getLiveFeed } from '@/lib/engine/live-feed';
import { webSearch } from '@/lib/engine/web-search';
import { classifyExternal } from '@/lib/engine/tiering';
import { itemsForEntity, resolveEntity } from '@/lib/engine/entities';
import { findContradictions, toComparable } from '@/lib/engine/contradiction';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/contradictions?q= — where sources agree, and where they don't.
 *
 * Compares your own sources against the wider web on one entity. Both halves
 * matter: agreement across your curated feed alone is weak evidence, because
 * those sources often syndicate each other.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'An entity is required' }, { status: 400 });

  const { data: deals } = await getDeals();
  const entity = resolveEntity('', q, deals);

  const [feed, web] = await Promise.all([
    getLiveFeed(deals).catch(() => null),
    webSearch(q).catch(() => []),
  ]);

  const mine = feed ? itemsForEntity(feed.items, entity).slice(0, 5) : [];
  const webItems = web.slice(0, 5).map((w) => ({
    title: w.title,
    synthesis: w.desc,
    source: w.source,
    tier: classifyExternal({ title: w.title, url: w.link, source: w.source, desc: w.desc }).tier,
  }));

  const consensus = await findContradictions(q, [...toComparable(mine), ...webItems]);
  return NextResponse.json({ topic: q, consensus });
}
