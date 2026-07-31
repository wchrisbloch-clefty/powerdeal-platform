import type { Deal, FeedItem } from '@/lib/types';
import { extractEntities, type EntityMention } from './entities';

/**
 * TRENDING NOW — ported from The Hub's trending panel.
 *
 * Two things carried over deliberately, because they are the difference
 * between a trend list and a popularity contest:
 *
 *   · Every topic carries the STRONGEST tier that reported it. Ranking by
 *     volume alone lets a rumour repeated by five aggregators outrank a single
 *     regulator filing. The tier travels with the count so the reader can see
 *     which one they are looking at.
 *   · Ranks are plain and the accent never varies by position. Colour-coding
 *     rank reads as importance the data does not support.
 *
 * PowerDeal difference: the candidates come from lib/engine/entities — the
 * reader's own vocabulary of utilities, regulators, pipeline companies and
 * watchlist topics — rather than generic capitalised-word extraction. A feed
 * about energy infrastructure produces endless false topics otherwise ("The
 * Company Said", "Last Year"), and none of them would have a page to link to.
 *
 * Trending and Today's Topics both read this list. They are two presentations
 * of one ranking, so they can never disagree about what is trending.
 */

export type Trend = EntityMention;

export function computeTrends(items: FeedItem[], deals: Deal[] = [], limit = 10): Trend[] {
  return extractEntities(items, deals, limit);
}

export { slugify, itemsForEntity, entityHref } from './entities';
