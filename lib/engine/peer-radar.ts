import type { Deal } from '@/lib/types';
import type { CoverageGap } from './discover';
import {
  extractCompanyNames,
  isInPipeline,
  isRegistryEntity,
  normalizeCompanyName,
} from './entities';

/**
 * PEER RADAR — the PowerDeal extension to The Hub's coverage-gap block.
 *
 * The Hub's gap answers "what am I not reading?". For a BD operator the more
 * valuable question is "who is showing up in that coverage who is not in my
 * book?" — a company appearing repeatedly in industrial-power stories that has
 * no deal record is an origination lead, and it is invisible in a feed sorted
 * by account hits because it hits nothing.
 *
 * Deliberately conservative. A false peer costs the reader a manual dismissal
 * every sweep, so this only surfaces names it can defend: multi-word, matching
 * a corporate-suffix pattern, seen more than once, and not already in the
 * pipeline under any spelling.
 */

export interface PeerCandidate {
  name: string;
  /** How many gap clusters mentioned it. */
  mentions: number;
  /** Headlines it appeared in — the evidence, shown on hover. */
  headlines: string[];
}

/**
 * The name pattern, its stopwords and the pipeline comparison now live in
 * ./entities, because the entity pages surface peers too ("who appears
 * alongside SDG&E that we have no deal with?"). Two copies of this regex would
 * drift, and the radar and the entity pages would start disagreeing about who
 * counts as a peer.
 */

export function findPeerCandidates(
  gaps: CoverageGap[],
  deals: Deal[],
  minMentions = 2,
  limit = 6,
): PeerCandidate[] {
  const hits = new Map<string, PeerCandidate>();

  for (const gap of gaps) {
    const text = gap.headline;
    for (const name of extractCompanyNames(text)) {
      // A utility or an ISO is not an origination lead — it is the counterparty
      // deals already run through.
      if (isInPipeline(name, deals) || isRegistryEntity(name)) continue;

      const key = normalizeCompanyName(name);
      const existing = hits.get(key);
      if (existing) {
        existing.mentions += 1;
        if (!existing.headlines.includes(text)) existing.headlines.push(text);
      } else {
        hits.set(key, { name, mentions: 1, headlines: [text] });
      }
    }
  }

  return [...hits.values()]
    .filter((p) => p.mentions >= minMentions)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}
