import type { FeedItem, SourceTier } from '@/lib/types';

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
 * PowerDeal difference: topics are drawn from the vertical's own vocabulary —
 * company names in the pipeline, utilities, and the domain terms that actually
 * signal a deal — rather than generic capitalised-word extraction. A feed about
 * energy infrastructure produces endless false topics otherwise ("The Company
 * Said", "Last Year").
 */

export interface Trend {
  topic: string;
  slug: string;
  count: number;
  /** Strongest tier among the items mentioning it. */
  tier: SourceTier;
  /** Item ids, so a click can filter the feed rather than dead-end. */
  itemIds: string[];
}

const TIER_RANK: Record<SourceTier, number> = {
  verified: 3,
  reported: 2,
  inferred: 1,
};

function strongest(a: SourceTier, b: SourceTier): SourceTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Domain terms worth trending on. Generic extraction produces noise in this
 * vertical — "Energy", "Power" and "Company" appear in nearly every headline
 * and would top the list permanently while saying nothing.
 */
const DOMAIN_TERMS = [
  'Class VI', 'CCUS', 'carbon capture', 'sequestration', '45Q',
  'rate case', 'rate increase', 'interconnection', 'curtailment',
  'data center', 'hyperscaler', 'behind-the-meter', 'microgrid',
  'fuel cell', 'SOFC', 'baseload', 'grid reliability', 'demand response',
  'LNG', 'midstream', 'petrochemical', 'refinery', 'primacy',
  'capacity market', 'PPA', 'tariff', 'outage', 'permit',
];

/**
 * Rank topics across the feed.
 *
 * `entities` are the reader's own vocabulary — pipeline company names and
 * utilities. They rank above generic domain terms because a mention of an
 * account in the book is worth more than a mention of a concept.
 */
export function computeTrends(
  items: FeedItem[],
  entities: string[] = [],
  limit = 10,
): Trend[] {
  const found = new Map<string, Trend>();

  // Longest first so "Class VI permit" is not shadowed by "permit".
  const terms = [
    ...entities.filter(Boolean).map((e) => ({ text: e, weight: 2 })),
    ...DOMAIN_TERMS.map((t) => ({ text: t, weight: 1 })),
  ].sort((a, b) => b.text.length - a.text.length);

  for (const item of items) {
    const haystack = `${item.title} ${item.synthesis ?? ''}`.toLowerCase();
    const seenInItem = new Set<string>();

    for (const { text } of terms) {
      const needle = text.toLowerCase();
      if (!haystack.includes(needle)) continue;
      // Count an item once per topic even if the phrase repeats.
      if (seenInItem.has(needle)) continue;
      seenInItem.add(needle);

      const existing = found.get(needle);
      if (existing) {
        existing.count += 1;
        existing.tier = strongest(existing.tier, item.tier);
        existing.itemIds.push(item.id);
      } else {
        found.set(needle, {
          topic: text,
          slug: slugify(text),
          count: 1,
          tier: item.tier,
          itemIds: [item.id],
        });
      }
    }
  }

  return [...found.values()]
    .filter((t) => t.count > 0)
    // Count first, then tier as the tiebreak — a verified mention outranks an
    // inferred one at equal volume.
    .sort((a, b) => b.count - a.count || TIER_RANK[b.tier] - TIER_RANK[a.tier])
    .slice(0, limit);
}
