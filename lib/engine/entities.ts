import type { Deal, FeedItem, SourceTier } from '@/lib/types';
import { SEED_PREFIX } from '@/lib/seed-data';

/**
 * ENTITIES — the vocabulary Trending, Today's Topics and the entity pages all
 * rank and link on.
 *
 * The Hub extracts entities generically: any run of capitalised words in a
 * headline is a candidate. That works for general news and produces noise here.
 * An energy feed capitalises "Energy", "Power", "Company" and "Grid" in nearly
 * every headline, so generic extraction tops the list permanently with words
 * that mean nothing and link nowhere.
 *
 * So extraction is registry-first and PowerDeal-aware, in the priority the
 * reader actually cares about:
 *
 *   1. UTILITIES     — a rate move hits every account in that territory
 *   2. REGULATORS    — the bodies that decide whether a project happens
 *   3. SPINE COMPANIES — names already in the pipeline
 *   4. PEER COMPANIES  — corporate names NOT in the pipeline (origination leads)
 *   5. WATCHLIST TOPICS — the domain terms that signal a deal
 *
 * Only peers are pattern-extracted; everything above them is a curated match,
 * which is why they can be trusted as links rather than as filter chips.
 */

export type EntityType = 'utility' | 'regulator' | 'company' | 'topic';

export interface EntityDef {
  /** Canonical display name. */
  name: string;
  type: EntityType;
  /** Every string that means this entity in a headline. */
  aliases: string[];
  /**
   * States this entity has authority or territory in. Drives "deals affected"
   * for regulators and geographic topics, which have no company or utility
   * field to match on.
   */
  states?: string[];
  /** True when a pipeline deal carries this company name. */
  inSpine?: boolean;
  /** Deals that named this entity directly, when it came from the Spine. */
  dealIds?: string[];
}

export interface EntityMention extends EntityDef {
  slug: string;
  /** Items mentioning it — one per item, however often the phrase repeats. */
  count: number;
  /** Strongest tier among those items. */
  tier: SourceTier;
  itemIds: string[];
}

const TIER_RANK: Record<SourceTier, number> = { verified: 3, reported: 2, inferred: 1 };

function strongest(a: SourceTier, b: SourceTier): SourceTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** Ranking weight by type — the priority order above, as a tiebreak on count. */
const TYPE_WEIGHT: Record<EntityType, number> = {
  utility: 5,
  regulator: 4,
  company: 3,
  topic: 2,
};

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Registry ────────────────────────────────────────────────────

/**
 * Utilities. Aliases carry the forms that actually appear in trade press —
 * "SDG&E" and "San Diego Gas & Electric" are the same territory and must not
 * rank as two entities.
 */
export const UTILITIES: EntityDef[] = [
  { name: 'SDG&E', type: 'utility', aliases: ['SDG&E', 'SDGE', 'San Diego Gas & Electric', 'San Diego Gas and Electric'], states: ['CA'] },
  { name: 'Dominion Energy', type: 'utility', aliases: ['Dominion Energy', 'Dominion'], states: ['VA', 'NC', 'SC'] },
  { name: 'Eversource', type: 'utility', aliases: ['Eversource'], states: ['MA', 'CT', 'NH'] },
  { name: 'CenterPoint Energy', type: 'utility', aliases: ['CenterPoint Energy', 'CenterPoint'], states: ['TX', 'IN', 'MN', 'OH'] },
  { name: 'PG&E', type: 'utility', aliases: ['PG&E', 'PGE', 'Pacific Gas & Electric', 'Pacific Gas and Electric'], states: ['CA'] },
  { name: 'Southern California Edison', type: 'utility', aliases: ['Southern California Edison', 'SoCal Edison', 'SCE'], states: ['CA'] },
  { name: 'Duke Energy', type: 'utility', aliases: ['Duke Energy'], states: ['NC', 'SC', 'FL', 'IN', 'OH', 'KY'] },
  { name: 'Southern Company', type: 'utility', aliases: ['Southern Company'], states: ['GA', 'AL', 'MS'] },
  { name: 'Georgia Power', type: 'utility', aliases: ['Georgia Power'], states: ['GA'] },
  { name: 'Florida Power & Light', type: 'utility', aliases: ['Florida Power & Light', 'Florida Power and Light', 'FPL'], states: ['FL'] },
  { name: 'Xcel Energy', type: 'utility', aliases: ['Xcel Energy', 'Xcel'], states: ['CO', 'MN', 'TX', 'NM'] },
  { name: 'American Electric Power', type: 'utility', aliases: ['American Electric Power', 'AEP'], states: ['OH', 'TX', 'VA', 'WV', 'IN', 'OK'] },
  { name: 'FirstEnergy', type: 'utility', aliases: ['FirstEnergy'], states: ['OH', 'PA', 'NJ', 'WV', 'MD'] },
  { name: 'Entergy', type: 'utility', aliases: ['Entergy'], states: ['LA', 'TX', 'MS', 'AR'] },
  { name: 'Oncor', type: 'utility', aliases: ['Oncor'], states: ['TX'] },
  { name: 'ComEd', type: 'utility', aliases: ['ComEd', 'Commonwealth Edison'], states: ['IL'] },
  { name: 'PSE&G', type: 'utility', aliases: ['PSE&G', 'PSEG', 'Public Service Electric & Gas'], states: ['NJ'] },
  { name: 'National Grid', type: 'utility', aliases: ['National Grid'], states: ['MA', 'NY', 'RI'] },
  { name: 'Con Edison', type: 'utility', aliases: ['Con Edison', 'ConEdison', 'ConEd', 'Consolidated Edison'], states: ['NY'] },
  { name: 'Arizona Public Service', type: 'utility', aliases: ['Arizona Public Service', 'APS'], states: ['AZ'] },
  { name: 'NV Energy', type: 'utility', aliases: ['NV Energy'], states: ['NV'] },
  { name: 'Ameren', type: 'utility', aliases: ['Ameren'], states: ['MO', 'IL'] },
  { name: 'DTE Energy', type: 'utility', aliases: ['DTE Energy', 'DTE'], states: ['MI'] },
  { name: 'Consumers Energy', type: 'utility', aliases: ['Consumers Energy'], states: ['MI'] },
  { name: 'WEC Energy', type: 'utility', aliases: ['WEC Energy', 'We Energies'], states: ['WI'] },
  { name: 'PPL', type: 'utility', aliases: ['PPL Electric', 'PPL Corporation'], states: ['PA', 'KY', 'RI'] },
  { name: 'Exelon', type: 'utility', aliases: ['Exelon'], states: ['IL', 'PA', 'MD', 'NJ', 'DC'] },
  { name: 'Evergy', type: 'utility', aliases: ['Evergy'], states: ['KS', 'MO'] },
  { name: 'Puget Sound Energy', type: 'utility', aliases: ['Puget Sound Energy'], states: ['WA'] },
  { name: 'Portland General Electric', type: 'utility', aliases: ['Portland General Electric'], states: ['OR'] },
  { name: 'Idaho Power', type: 'utility', aliases: ['Idaho Power'], states: ['ID'] },
  { name: 'Tampa Electric', type: 'utility', aliases: ['Tampa Electric', 'TECO'], states: ['FL'] },
  { name: 'Alabama Power', type: 'utility', aliases: ['Alabama Power'], states: ['AL'] },
  { name: 'Baltimore Gas & Electric', type: 'utility', aliases: ['Baltimore Gas & Electric', 'BGE'], states: ['MD'] },
  { name: 'Salt River Project', type: 'utility', aliases: ['Salt River Project', 'SRP'], states: ['AZ'] },
  { name: 'LADWP', type: 'utility', aliases: ['LADWP', 'Los Angeles Department of Water and Power'], states: ['CA'] },
  { name: 'Austin Energy', type: 'utility', aliases: ['Austin Energy'], states: ['TX'] },
  { name: 'CPS Energy', type: 'utility', aliases: ['CPS Energy'], states: ['TX'] },
  { name: 'Tennessee Valley Authority', type: 'utility', aliases: ['Tennessee Valley Authority', 'TVA'], states: ['TN', 'AL', 'MS', 'KY'] },
];

/**
 * Regulators, agencies and market operators.
 *
 * ISOs and RTOs sit here rather than under utilities: ERCOT and PJM do not own
 * territory or bill a customer, they set the market rules a deal has to clear.
 * For a BD read those behave like regulators, so they are graded as such.
 */
export const REGULATORS: EntityDef[] = [
  { name: 'FERC', type: 'regulator', aliases: ['FERC', 'Federal Energy Regulatory Commission'] },
  { name: 'EPA', type: 'regulator', aliases: ['EPA', 'Environmental Protection Agency'] },
  { name: 'DOE', type: 'regulator', aliases: ['Department of Energy', 'DOE'] },
  { name: 'NERC', type: 'regulator', aliases: ['NERC', 'North American Electric Reliability'] },
  { name: 'EIA', type: 'regulator', aliases: ['Energy Information Administration', 'EIA'] },
  { name: 'NRC', type: 'regulator', aliases: ['Nuclear Regulatory Commission'] },
  { name: 'CPUC', type: 'regulator', aliases: ['CPUC', 'California Public Utilities Commission'], states: ['CA'] },
  { name: 'PUCT', type: 'regulator', aliases: ['PUCT', 'Public Utility Commission of Texas'], states: ['TX'] },
  { name: 'Railroad Commission of Texas', type: 'regulator', aliases: ['Railroad Commission of Texas', 'Texas Railroad Commission'], states: ['TX'] },
  { name: 'TCEQ', type: 'regulator', aliases: ['TCEQ', 'Texas Commission on Environmental Quality'], states: ['TX'] },
  { name: 'Virginia SCC', type: 'regulator', aliases: ['Virginia State Corporation Commission', 'Virginia SCC'], states: ['VA'] },
  { name: 'Massachusetts DPU', type: 'regulator', aliases: ['Massachusetts Department of Public Utilities', 'Massachusetts DPU'], states: ['MA'] },
  { name: 'CARB', type: 'regulator', aliases: ['CARB', 'California Air Resources Board'], states: ['CA'] },
  { name: 'ERCOT', type: 'regulator', aliases: ['ERCOT'], states: ['TX'] },
  { name: 'PJM', type: 'regulator', aliases: ['PJM'], states: ['PA', 'NJ', 'MD', 'VA', 'OH', 'WV', 'DE', 'IL', 'IN', 'KY', 'NC', 'DC'] },
  { name: 'CAISO', type: 'regulator', aliases: ['CAISO', 'California ISO'], states: ['CA'] },
  { name: 'ISO-NE', type: 'regulator', aliases: ['ISO-NE', 'ISO New England'], states: ['MA', 'CT', 'NH', 'ME', 'RI', 'VT'] },
  { name: 'MISO', type: 'regulator', aliases: ['MISO', 'Midcontinent ISO'], states: ['IL', 'IN', 'MI', 'MN', 'MO', 'IA', 'WI', 'AR', 'LA', 'MS', 'TX', 'ND', 'SD'] },
  { name: 'SPP', type: 'regulator', aliases: ['Southwest Power Pool', 'SPP'], states: ['KS', 'OK', 'NE', 'AR', 'MO', 'ND', 'SD', 'NM', 'TX'] },
  { name: 'NYISO', type: 'regulator', aliases: ['NYISO', 'New York ISO'], states: ['NY'] },
];

/**
 * Watchlist topics — the domain terms that signal a deal. These are the
 * concepts a BD rep would set an alert on, not a general glossary.
 */
export const WATCHLIST_TOPICS: EntityDef[] = [
  { name: 'Class VI', type: 'topic', aliases: ['Class VI', 'Class 6 well'] },
  { name: 'CCUS', type: 'topic', aliases: ['CCUS', 'CCS'] },
  { name: 'carbon capture', type: 'topic', aliases: ['carbon capture'] },
  { name: 'sequestration', type: 'topic', aliases: ['sequestration', 'sequestered'] },
  { name: '45Q', type: 'topic', aliases: ['45Q'] },
  { name: 'primacy', type: 'topic', aliases: ['primacy'] },
  { name: 'HGB non-attainment', type: 'topic', aliases: ['HGB', 'Houston-Galveston-Brazoria', 'Houston Galveston Brazoria'], states: ['TX'] },
  { name: 'non-attainment', type: 'topic', aliases: ['non-attainment', 'nonattainment'] },
  { name: 'rate case', type: 'topic', aliases: ['rate case', 'rate increase', 'rate hike'] },
  { name: 'capacity auction', type: 'topic', aliases: ['capacity auction', 'capacity market'] },
  { name: 'interconnection', type: 'topic', aliases: ['interconnection', 'interconnection queue'] },
  { name: 'curtailment', type: 'topic', aliases: ['curtailment', 'curtailed'] },
  { name: 'resource adequacy', type: 'topic', aliases: ['resource adequacy'] },
  { name: 'grid reliability', type: 'topic', aliases: ['grid reliability', 'reliability standard'] },
  { name: 'demand response', type: 'topic', aliases: ['demand response'] },
  { name: 'load growth', type: 'topic', aliases: ['load growth'] },
  { name: 'transmission', type: 'topic', aliases: ['transmission line', 'transmission project'] },
  { name: 'data center', type: 'topic', aliases: ['data center', 'data centre'] },
  { name: 'hyperscaler', type: 'topic', aliases: ['hyperscaler', 'hyperscale'] },
  { name: 'behind-the-meter', type: 'topic', aliases: ['behind-the-meter', 'behind the meter'] },
  { name: 'microgrid', type: 'topic', aliases: ['microgrid'] },
  { name: 'fuel cell', type: 'topic', aliases: ['fuel cell'] },
  { name: 'SOFC', type: 'topic', aliases: ['SOFC', 'solid oxide'] },
  { name: 'baseload', type: 'topic', aliases: ['baseload', 'base load'] },
  { name: 'PPA', type: 'topic', aliases: ['PPA', 'power purchase agreement'] },
  { name: 'tariff', type: 'topic', aliases: ['tariff'] },
  { name: 'outage', type: 'topic', aliases: ['outage', 'blackout'] },
  { name: 'LNG', type: 'topic', aliases: ['LNG'] },
  { name: 'midstream', type: 'topic', aliases: ['midstream'] },
  { name: 'petrochemical', type: 'topic', aliases: ['petrochemical'] },
  { name: 'refinery', type: 'topic', aliases: ['refinery', 'refining'] },
];

export const REGISTRY: EntityDef[] = [...UTILITIES, ...REGULATORS, ...WATCHLIST_TOPICS];

// ── Matching ────────────────────────────────────────────────────

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One matcher per entity, alternating over its aliases.
 *
 * Lookarounds rather than \b: aliases end in punctuation ("SDG&E", "PSE&G")
 * where \b sits in the wrong place and either over- or under-matches. Runs of
 * whitespace are made flexible so a headline that line-wraps still matches.
 */
function matcherFor(def: EntityDef): RegExp {
  const alternatives = def.aliases
    .map((a) => escapeRe(a).replace(/\\?\s+/g, '\\s+'))
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(?<![a-z0-9])(?:${alternatives})(?![a-z0-9])`, 'i');
}

const MATCHER_CACHE = new WeakMap<EntityDef, RegExp>();

function cachedMatcher(def: EntityDef): RegExp {
  let re = MATCHER_CACHE.get(def);
  if (!re) {
    re = matcherFor(def);
    MATCHER_CACHE.set(def, re);
  }
  return re;
}

function haystackOf(item: Pick<FeedItem, 'title' | 'synthesis'>): string {
  return `${item.title} ${item.synthesis ?? ''}`;
}

export function mentions(def: EntityDef, item: Pick<FeedItem, 'title' | 'synthesis'>): boolean {
  return cachedMatcher(def).test(haystackOf(item));
}

// ── Company-name extraction (shared with peer radar) ─────────────

/** Corporate name shapes worth trusting, e.g. "Cheniere Energy", "NextEra Inc". */
export const COMPANY_PATTERN =
  /\b([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,3}\s+(?:Energy|Corp|Corporation|Inc|LLC|LP|Company|Industries|Partners|Resources|Midstream|Chemical|Chemicals|Refining|Petroleum|Systems|Technologies|Power|Utilities|Holdings))\b/g;

/**
 * Words that pattern-match as companies but never are. Without this the radar
 * fills with "The Company", "Clean Energy" and headline fragments.
 */
export const COMPANY_STOPWORDS = new Set([
  'the company', 'clean energy', 'renewable energy', 'solar energy',
  'wind energy', 'nuclear power', 'electric power', 'the power',
  'new energy', 'green energy', 'this company', 'energy company',
  'oil company', 'gas company', 'the corporation', 'united states',
]);

/**
 * Loose comparison so "Valero Energy Corp" matches a deal named "Valero".
 *
 * ⚠️ THE SEED MARKER IS STRIPPED FIRST, AND LEAVING IT IN BREAKS MATCHING IN
 * ONE DIRECTION ONLY — which is the direction that would have gone unnoticed.
 *
 * `isInPipeline` compares both ways: the book's name inside the news name, and
 * the news name inside the book's. With the prefix left on, "SAMPLE — Valero"
 * normalises to "sample valero", and a headline about "Valero Energy Corp"
 * normalises to "valero energy". Neither contains the other, so the match that
 * used to succeed silently stops — peer radar, trending and the feed's account
 * mapping all go quiet in exactly the mode the render check runs in.
 *
 * "SAMPLE — BAE Systems" vs "BAE Systems" would still have matched, because
 * the longer string contains the shorter one. So half the fixtures would have
 * kept passing.
 *
 * The marker is a statement about the ROW, not part of the company's identity.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .replace(SEED_PREFIX, '')
    .toLowerCase()
    .replace(
      /\b(inc|llc|lp|corp|corporation|company|co|holdings|industries|partners|resources|plc|ltd)\b\.?/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when the candidate is already an account, under any spelling. */
export function isInPipeline(candidate: string, deals: Deal[]): boolean {
  const c = normalizeCompanyName(candidate);
  if (!c) return true;
  return deals.some((d) => {
    const company = normalizeCompanyName(d.company);
    if (!company) return false;
    // Substring either way: "Valero" in the book matches "Valero Energy Corp"
    // in the news, and vice versa.
    return company === c || company.includes(c) || c.includes(company);
  });
}

/** Corporate names appearing in a block of text, stopwords removed. */
export function extractCompanyNames(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(COMPANY_PATTERN)) {
    const name = match[1].trim();
    if (COMPANY_STOPWORDS.has(name.toLowerCase())) continue;
    out.push(name);
  }
  return out;
}

/**
 * True when a name is already a curated entity — a utility, a regulator or an
 * ISO.
 *
 * The corporate-name pattern cannot tell "Cheniere Energy" from "Dominion
 * Energy": both are capitalised words ending in a corporate suffix. Without
 * this check the peer radar offers to add the utility on an existing deal to
 * the pipeline as an origination lead, which is not a lead — it is the counter‑
 * party the deal already runs through.
 */
export function isRegistryEntity(name: string): boolean {
  const n = normalizeCompanyName(name);
  if (!n) return false;
  return [...UTILITIES, ...REGULATORS].some((def) =>
    def.aliases.some((alias) => normalizeCompanyName(alias) === n),
  );
}

// ── Extraction ──────────────────────────────────────────────────

/** Spine companies and their utilities, as entity definitions. */
export function spineEntities(deals: Deal[]): EntityDef[] {
  const defs: EntityDef[] = [];

  const byCompany = new Map<string, string[]>();
  for (const deal of deals) {
    if (!deal.company?.trim()) continue;
    const key = deal.company.trim();
    byCompany.set(key, [...(byCompany.get(key) ?? []), deal.id]);
  }
  for (const [company, dealIds] of byCompany) {
    defs.push({
      name: company,
      type: 'company',
      aliases: [company],
      inSpine: true,
      dealIds,
      states: [
        ...new Set(
          deals
            .filter((d) => d.company === company && d.state && d.state !== 'multi')
            .map((d) => d.state as string),
        ),
      ],
    });
  }

  // Utilities named on a deal but absent from the registry — the book knows
  // territories the curated list does not.
  const known = new Set(
    UTILITIES.flatMap((u) => u.aliases.map((a) => a.toLowerCase())),
  );
  const extras = new Set<string>();
  for (const deal of deals) {
    const utility = deal.utility?.trim();
    if (!utility || utility.toLowerCase() === 'multi') continue;
    if (known.has(utility.toLowerCase())) continue;
    // ERCOT and friends are already regulators; don't double-register them.
    if (REGULATORS.some((r) => r.aliases.some((a) => a.toLowerCase() === utility.toLowerCase()))) {
      continue;
    }
    extras.add(utility);
  }
  for (const utility of extras) {
    defs.push({ name: utility, type: 'utility', aliases: [utility] });
  }

  return defs;
}

/**
 * Rank every entity mentioned across the feed.
 *
 * One pool, ranked once — Trending and Today's Topics are two presentations of
 * this same list, so they can never disagree about what is trending.
 */
export function extractEntities(
  items: FeedItem[],
  deals: Deal[] = [],
  limit = 24,
): EntityMention[] {
  const defs = [...spineEntities(deals), ...REGISTRY];
  const found = new Map<string, EntityMention>();

  for (const item of items) {
    const haystack = haystackOf(item);
    for (const def of defs) {
      if (!cachedMatcher(def).test(haystack)) continue;

      const key = slugify(def.name);
      const existing = found.get(key);
      if (existing) {
        existing.count += 1;
        existing.tier = strongest(existing.tier, item.tier);
        existing.itemIds.push(item.id);
      } else {
        found.set(key, {
          ...def,
          slug: key,
          count: 1,
          tier: item.tier,
          itemIds: [item.id],
        });
      }
    }
  }

  // Peer companies — pattern-extracted, so they earn a slot only on repetition.
  const peers = new Map<string, EntityMention>();
  for (const item of items) {
    for (const name of new Set(extractCompanyNames(item.title))) {
      if (isInPipeline(name, deals) || isRegistryEntity(name)) continue;
      const key = slugify(name);
      if (found.has(key)) continue;
      const existing = peers.get(key);
      if (existing) {
        existing.count += 1;
        existing.tier = strongest(existing.tier, item.tier);
        existing.itemIds.push(item.id);
      } else {
        peers.set(key, {
          name,
          type: 'company',
          aliases: [name],
          inSpine: false,
          slug: key,
          count: 1,
          tier: item.tier,
          itemIds: [item.id],
        });
      }
    }
  }
  for (const [key, peer] of peers) {
    // A pattern-matched name seen once is usually a headline fragment.
    if (peer.count >= 2) found.set(key, peer);
  }

  return [...found.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type] ||
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/**
 * Entities named in a single item — what a feed card links out to.
 *
 * Registry-only by design: peer companies need repetition across items before
 * they can be trusted, and a single card has no way to establish that. A card
 * linking to a page for a headline fragment would be worse than no link.
 */
export function entitiesIn(
  item: Pick<FeedItem, 'title' | 'synthesis'>,
  deals: Deal[] = [],
  limit = 6,
): EntityDef[] {
  const defs = [...spineEntities(deals), ...REGISTRY];
  const seen = new Set<string>();
  const out: EntityDef[] = [];

  for (const def of defs) {
    const slug = slugify(def.name);
    if (seen.has(slug)) continue;
    if (!mentions(def, item)) continue;
    seen.add(slug);
    out.push(def);
  }

  return out
    .sort((a, b) => TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type] || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Items mentioning an entity — the entity page's "your sources" block. */
export function itemsForEntity(items: FeedItem[], entity: EntityDef): FeedItem[] {
  const re = cachedMatcher(entity);
  return items.filter((i) => re.test(haystackOf(i)));
}

/**
 * Resolve a slug (plus the `?q=` display name) back to an entity.
 *
 * Registry and Spine first; anything else becomes a company, which is how a
 * peer-radar name gets a working page without being curated in advance.
 */
export function resolveEntity(slug: string, q: string | undefined, deals: Deal[]): EntityDef {
  const defs = [...spineEntities(deals), ...REGISTRY];
  const bySlug = defs.find((d) => slugify(d.name) === slug);
  if (bySlug) return bySlug;

  // A `?q=` always rides along on links we generate, so the fallback only fires
  // for a hand-typed or truncated URL. Title-case it rather than showing the
  // reader "cheniere energy" as a page heading.
  const name = (q?.trim() || titleCase(slug.replace(/-/g, ' '))).trim();
  const byAlias = defs.find((d) =>
    d.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
  );
  if (byAlias) return byAlias;

  return { name, type: 'company', aliases: [name], inSpine: isInPipeline(name, deals) };
}

/** Canonical link for an entity — the one URL every surface points at. */
export function entityHref(entity: Pick<EntityDef, 'name'>): string {
  return `/app/entity/${slugify(entity.name)}?q=${encodeURIComponent(entity.name)}`;
}

// ── Deals affected ──────────────────────────────────────────────

/**
 * Pipeline deals this entity touches.
 *
 * Ordered by how defensible the link is, and the basis travels with the match
 * so the page can say WHY a deal is listed. A state-level match on a regulator
 * is real but weak; presenting it identically to a direct company hit would
 * put a rep in a meeting citing a connection that isn't there.
 */
export interface EntityDealMatch {
  deal: Deal;
  basis: 'company' | 'utility' | 'state';
}

export function dealsForEntity(entity: EntityDef, deals: Deal[]): EntityDealMatch[] {
  const out: EntityDealMatch[] = [];
  const aliases = entity.aliases.map((a) => a.toLowerCase());
  const entityStates = new Set((entity.states ?? []).map((s) => s.toUpperCase()));

  for (const deal of deals) {
    if (entity.type === 'company') {
      const c = normalizeCompanyName(entity.name);
      const dc = normalizeCompanyName(deal.company);
      if (c && dc && (c === dc || dc.includes(c) || c.includes(dc))) {
        out.push({ deal, basis: 'company' });
        continue;
      }
    }

    const utility = deal.utility?.toLowerCase().trim();
    if (utility && utility !== 'multi' && aliases.some((a) => a === utility || utility.includes(a))) {
      out.push({ deal, basis: 'utility' });
      continue;
    }

    const state = deal.state?.toUpperCase();
    if (state && state !== 'MULTI' && entityStates.has(state)) {
      out.push({ deal, basis: 'state' });
    }
  }

  const rank = { company: 0, utility: 1, state: 2 } as const;
  return out.sort(
    (a, b) => rank[a.basis] - rank[b.basis] || a.deal.health_score - b.deal.health_score,
  );
}

/**
 * Companies appearing alongside this entity that are NOT in the Spine.
 *
 * The origination question the feed cannot answer on its own: who keeps showing
 * up in this entity's coverage that we have no deal with?
 */
export interface PeerAround {
  name: string;
  mentions: number;
  headlines: string[];
}

export function peersAround(
  items: FeedItem[],
  deals: Deal[],
  entity: EntityDef,
  limit = 6,
): PeerAround[] {
  const hits = new Map<string, PeerAround>();
  const self = normalizeCompanyName(entity.name);

  for (const item of items) {
    for (const name of new Set(extractCompanyNames(item.title))) {
      if (isInPipeline(name, deals) || isRegistryEntity(name)) continue;
      const key = normalizeCompanyName(name);
      if (!key || key === self) continue;

      const existing = hits.get(key);
      if (existing) {
        existing.mentions += 1;
        if (!existing.headlines.includes(item.title)) existing.headlines.push(item.title);
      } else {
        hits.set(key, { name, mentions: 1, headlines: [item.title] });
      }
    }
  }

  return [...hits.values()].sort((a, b) => b.mentions - a.mentions).slice(0, limit);
}
