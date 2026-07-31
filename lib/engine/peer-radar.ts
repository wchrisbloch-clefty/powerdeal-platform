import type { Deal } from '@/lib/types';
import type { CoverageGap } from './discover';

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

/** Corporate name shapes worth trusting, e.g. "Cheniere Energy", "NextEra Inc". */
const COMPANY_PATTERN =
  /\b([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,3}\s+(?:Energy|Corp|Corporation|Inc|LLC|LP|Company|Industries|Partners|Resources|Midstream|Chemical|Chemicals|Refining|Petroleum|Systems|Technologies|Power|Utilities|Holdings))\b/g;

/**
 * Words that pattern-match as companies but never are. Without this the radar
 * fills with "The Company", "Clean Energy" and headline fragments.
 */
const STOPWORDS = new Set([
  'the company', 'clean energy', 'renewable energy', 'solar energy',
  'wind energy', 'nuclear power', 'electric power', 'the power',
  'new energy', 'green energy', 'this company', 'energy company',
  'oil company', 'gas company', 'the corporation', 'united states',
]);

/** Loose comparison so "Valero Energy Corp" matches a deal named "Valero". */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(inc|llc|lp|corp|corporation|company|co|holdings|industries|partners|resources|plc|ltd)\b\.?/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when the candidate is already an account, under any spelling. */
function inPipeline(candidate: string, deals: Deal[]): boolean {
  const c = normalize(candidate);
  if (!c) return true;
  return deals.some((d) => {
    const company = normalize(d.company);
    if (!company) return false;
    // Substring either way: "Valero" in the book matches "Valero Energy Corp"
    // in the news, and vice versa.
    return company === c || company.includes(c) || c.includes(company);
  });
}

export function findPeerCandidates(
  gaps: CoverageGap[],
  deals: Deal[],
  minMentions = 2,
  limit = 6,
): PeerCandidate[] {
  const hits = new Map<string, PeerCandidate>();

  for (const gap of gaps) {
    const text = gap.headline;
    for (const match of text.matchAll(COMPANY_PATTERN)) {
      const name = match[1].trim();
      if (STOPWORDS.has(name.toLowerCase())) continue;
      if (inPipeline(name, deals)) continue;

      const key = normalize(name);
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
