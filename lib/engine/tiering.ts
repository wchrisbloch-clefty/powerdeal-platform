import type { SourceTier, Deal } from '@/lib/types';
import type { RawItem } from './rss';

/**
 * Graded provenance — The Hub's trust spine.
 *
 * VERIFIED  — primary source: government, regulator, filing, transcript
 * REPORTED  — credible trade press reporting on a primary source
 * INFERRED  — discovery net, social, aggregator, or model inference
 *
 * The grade is deterministic where possible. We only spend an AI call on the
 * genuinely ambiguous middle.
 */

/** Domains that are primary sources by definition. */
const VERIFIED_DOMAINS = [
  'eia.gov',
  'ferc.gov',
  'epa.gov',
  'energy.gov',
  'netl.doe.gov',
  'nrel.gov',
  'sec.gov',
  'rrc.texas.gov',
  'puc.texas.gov',
  'cpuc.ca.gov',
  'ercot.com',
  'pjm.com',
  'caiso.com',
  'iso-ne.com',
  'misoenergy.org',
  'spp.org',
  'nyiso.com',
  'globalccsinstitute.com',
];

/** Aggregators and social — never better than INFERRED on their own. */
const INFERRED_DOMAINS = [
  'news.google.com',
  'reddit.com',
  'medium.com',
  'substack.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
];

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function matches(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Language that signals a claim is second-hand or speculative. */
const HEDGE_PATTERNS =
  /\b(reportedly|rumou?red|sources say|according to (?:people|sources)|is said to|could|may|might|expected to|plans to|considering|explores?|weighs?)\b/i;

/** Language that signals a completed, on-the-record action. */
const CONCRETE_PATTERNS =
  /\b(approved|authorized|filed|issued|granted|denied|signed|announced|awarded|commissioned|ordered|ruled|finalized|effective)\b/i;

export interface TierResult {
  tier: SourceTier;
  confidence: number; // 0..1
  reason: string;
}

/**
 * Grade an item without an AI call.
 *
 * Starts from the source's configured tier and adjusts on evidence. A
 * discovery-net item can never be promoted above INFERRED — that's the whole
 * point of separating the nets.
 */
export function classifyTier(item: RawItem): TierResult {
  const domain = domainOf(item.url);
  const text = `${item.title} ${item.summary}`;

  // Discovery sources are structurally untrusted.
  if (item.role === 'discovery') {
    return {
      tier: 'inferred',
      confidence: 0.4,
      reason: 'Discovery net — surfaced for coverage, not trusted as reporting.',
    };
  }

  if (matches(domain, VERIFIED_DOMAINS)) {
    return {
      tier: 'verified',
      confidence: 0.95,
      reason: `Primary source (${domain}).`,
    };
  }

  if (matches(domain, INFERRED_DOMAINS)) {
    return {
      tier: 'inferred',
      confidence: 0.4,
      reason: `Aggregator or social platform (${domain}).`,
    };
  }

  const hedged = HEDGE_PATTERNS.test(text);
  const concrete = CONCRETE_PATTERNS.test(text);

  if (item.defaultTier === 'verified') {
    return { tier: 'verified', confidence: 0.9, reason: 'Configured primary source.' };
  }

  if (hedged && !concrete) {
    return {
      tier: 'inferred',
      confidence: 0.45,
      reason: 'Speculative framing — no completed action reported.',
    };
  }

  if (concrete && !hedged) {
    return {
      tier: 'reported',
      confidence: 0.85,
      reason: 'Trade press reporting a completed action.',
    };
  }

  return {
    tier: item.defaultTier,
    confidence: item.defaultTier === 'reported' ? 0.7 : 0.5,
    reason: 'Source default tier.',
  };
}

/** Breaking = published in the last 6 hours and reporting a concrete action. */
export function isBreaking(item: RawItem): boolean {
  if (!item.publishedAt) return false;
  const age = Date.now() - Date.parse(item.publishedAt);
  if (age > 6 * 3600_000 || age < 0) return false;
  return CONCRETE_PATTERNS.test(`${item.title} ${item.summary}`);
}

// ── Account mapping ─────────────────────────────────────────────

/** Normalize a company name for matching: drop suffixes and punctuation. */
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|llc|lp|plc|ltd|limited|holdings|group|systems|industries|energy|technologies)\b/g,
      '',
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const US_STATE_NAMES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi',
  MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire',
  NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina',
  ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania',
  RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee',
  TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington',
  WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
};

export interface AccountMatch {
  dealId: string;
  dealRef: string;
  company: string;
  /** Why it matched — shown in the UI so the mapping is auditable. */
  basis: 'company' | 'utility' | 'state+vertical';
  score: number;
}

/**
 * Map a feed item to pipeline accounts.
 *
 * Ordered by strength: a company-name hit is decisive, a utility-territory hit
 * is strong, and state+vertical is weak corroboration only. We never map on
 * vertical alone — that would tag every O&G deal onto every O&G headline.
 */
export function mapToAccounts(
  item: Pick<RawItem, 'title' | 'summary' | 'content' | 'category'>,
  deals: Deal[],
): AccountMatch[] {
  const haystack = `${item.title} ${item.summary} ${item.content}`.toLowerCase();
  const normalizedHaystack = normalizeCompany(haystack);
  const matchesFound: AccountMatch[] = [];

  for (const deal of deals) {
    const normCompany = normalizeCompany(deal.company);

    // 1. Company name — decisive.
    if (normCompany.length >= 3 && normalizedHaystack.includes(normCompany)) {
      matchesFound.push({
        dealId: deal.id,
        dealRef: deal.deal_id,
        company: deal.company,
        basis: 'company',
        score: 1,
      });
      continue;
    }

    // 2. Utility territory — strong. Rate moves hit every account on that utility.
    if (deal.utility) {
      const util = deal.utility.toLowerCase();
      const utilCore = util.replace(/[^a-z0-9&]/g, '');
      if (
        (util.length >= 4 && haystack.includes(util)) ||
        (utilCore.length >= 4 && haystack.replace(/[^a-z0-9&]/g, '').includes(utilCore))
      ) {
        matchesFound.push({
          dealId: deal.id,
          dealRef: deal.deal_id,
          company: deal.company,
          basis: 'utility',
          score: 0.75,
        });
        continue;
      }
    }

    // 3. State + vertical — weak, and only when both line up.
    if (deal.state) {
      const stateName = US_STATE_NAMES[deal.state.toUpperCase()];
      const stateHit =
        (stateName && haystack.includes(stateName)) ||
        new RegExp(`\\b${deal.state.toUpperCase()}\\b`).test(
          `${item.title} ${item.summary}`,
        );
      const verticalHit = verticalMatchesCategory(deal.vertical, item.category);
      if (stateHit && verticalHit) {
        matchesFound.push({
          dealId: deal.id,
          dealRef: deal.deal_id,
          company: deal.company,
          basis: 'state+vertical',
          score: 0.45,
        });
      }
    }
  }

  return matchesFound.sort((a, b) => b.score - a.score);
}

function verticalMatchesCategory(vertical: string, category: string): boolean {
  const v = vertical.toLowerCase();
  switch (category) {
    case 'og':
      return v.startsWith('o&g');
    case 'industrial':
      return v.startsWith('industrial');
    case 'data-center':
      return v.includes('data center');
    case 'defense':
      return v.includes('defense');
    case 'ccus':
      return v.startsWith('o&g') || v.startsWith('industrial');
    case 'power-markets':
    case 'policy':
      return true; // rate and policy moves cut across every vertical
    default:
      return false;
  }
}

/** Which of the vertical's categories an item belongs to, given its source. */
export function verticalTagsFor(item: RawItem): string[] {
  const tags = new Set<string>([item.category]);
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/\bccus\b|carbon capture|class vi|sequestration/.test(text)) tags.add('ccus');
  if (/\brate case\b|rate increase|tariff|\bpuc\b|\bcpuc\b/.test(text)) {
    tags.add('power-markets');
  }
  if (/data ?cent(er|re)|hyperscal/.test(text)) tags.add('data-center');
  return [...tags];
}
