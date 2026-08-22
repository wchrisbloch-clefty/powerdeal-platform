import type { Deal, FeedItem, CcusEvent } from './types';
import { computeHealthScore, computeMeddpiccScore } from './deals';

/**
 * ═══════════════════════════════════════════════════════════════
 * ZERO-KEY FALLBACK DATA (GLOBAL RULE 4) — AND IT SAYS SO ON EVERY ROW.
 * ═══════════════════════════════════════════════════════════════
 *
 * When Supabase is unconfigured the product still runs: the pipeline table
 * sorts and filters, the map plots markers, the feed renders.
 *
 * ══ NOTHING HERE IS THE OPERATOR'S BOOK ANY MORE ══
 *
 * This file used to open with "These are the REAL 21 Spine accounts, mirroring
 * supabase/seed.sql", and that sentence was the whole problem. Twenty-one
 * rows, the same twenty-one companies, one of them carrying a real person's
 * name, and forty-two cells of live BD reasoning — "map the plants in the same
 * airshed" was not placeholder text, it was a thesis someone was working.
 *
 * ⚠️ THE REASON IS DISTRIBUTION, NOT EMBARRASSMENT. Every component of this
 * system has to be independently packageable — shareable, sellable, handed to
 * somebody. A repo that ships with a real target list, a real competitive
 * strategy and a named contact at a defense prime is not a product; it is a
 * notebook that happens to compile. The book lives in Supabase. This holds a
 * demo.
 *
 * Companies, notes, risks and site names are INVENTED. tests/seed-visible.test.ts
 * asserts that no string here appears in any file holding real data.
 *
 * The consequence was not theoretical. A screenshot taken during this build
 * showed the first defense row with Champion recorded at health 2.8; the live
 * book has that account at
 * health 4 with no champion. Nobody could tell from the screenshot, because
 * nothing in the CONTENT distinguished the two — the only tell was the row's
 * uuid, which no screenshot shows.
 *
 * Banners help and they are not enough: a banner is one element that can be
 * cropped out, scrolled past, or missing on a surface nobody wired it into —
 * which is exactly what happened on Pipeline and the deal page for months. A
 * prefix on the company name is IN the data, so it survives a crop, a CSV
 * export, a pasted table and a photograph of a screen.
 *
 * ⚠️ SEED_PREFIX IS PART OF THE VALUE, NOT A RENDER-TIME DECORATION. Adding it
 * in a component would put it back in exactly the place that already failed —
 * one surface at a time, forgettable on the next one.
 *
 * ══ WHAT IS NOT CHANGED ══
 *
 * The verticals, states, utilities, geo tiers and stage distribution stay real,
 * because the fallback has to exercise the same code paths the live data does.
 * A seed set of Foo Corp in state XX would stop catching layout and grouping
 * defects, which is the other job this data does — and utilities are public
 * infrastructure, not accounts, so naming SDG&E or Dominion discloses nothing.
 *
 * The company names are invented but SHAPED like the real ones: multi-word,
 * mixed lengths, one that is a single word after the prefix. That matters more
 * than it sounds — the entity matcher compares normalised names in both
 * directions, and a set of uniformly-shaped names would stop exercising the
 * short-name path that the SAMPLE prefix broke once already.
 */

/**
 * The marker. Em dash rather than a colon or brackets so it reads as part of
 * the name in a table cell rather than as syntax that might be a rendering
 * artifact.
 */
export const SEED_PREFIX = 'SAMPLE — ';

type SeedSpec = Pick<
  Deal,
  | 'deal_id' | 'company' | 'vertical' | 'relationship_type' | 'geo_tier'
  | 'state' | 'utility' | 'value_prop' | 'beachhead_site' | 'size_mw'
  | 'champion' | 'next_move' | 'key_risk'
>;

const SPECS: SeedSpec[] = [
  // ── DEFENSE ──
  {
    deal_id: 'DEF-001', company: 'SAMPLE — Ironvale Defense Systems', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'CA',
    utility: 'SDG&E', value_prop: 'Multiple', beachhead_site: 'Coastal test range',
    size_mw: 116, champion: 'A. Sample (Energy & Utilities Mgr)',
    next_move: 'Book the site feasibility call; name the economic buyer and the security sponsor',
    key_risk: 'Single-threaded on the one named contact; no load number confirmed',
  },
  {
    deal_id: 'DEF-006', company: 'SAMPLE — Calderwood Marine Group', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'VA',
    utility: 'Dominion', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Choose a beachhead segment before approaching the enterprise',
    key_risk: 'Several business units, each with its own clearance process',
  },
  {
    deal_id: 'DEF-007', company: 'SAMPLE — Helix Avionics Group', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'FL',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Map the site list and find the ones where an outage stops production',
    key_risk: 'Multi-site, and site access is controlled centrally',
  },
  {
    deal_id: 'DEF-021', company: 'SAMPLE — Orbital Reach Industries', vertical: 'Defense/Special',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'ERCOT', value_prop: 'Multiple', beachhead_site: 'Launch complex',
    size_mw: null, champion: null,
    next_move: 'Qualify the launch and factory loads; lead with time-to-power',
    key_risk: 'Vertically integrated and may build its own generation',
  },

  // ── INDUSTRIAL / CHEMICAL ──
  {
    deal_id: 'IND-002', company: 'SAMPLE — Bramwell Chemical Works', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'MA',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Pick one plant to qualify rather than approaching the group',
    key_risk: 'No contact yet and no load figure for any site',
  },
  {
    deal_id: 'IND-004', company: 'SAMPLE — Ardent Polymers', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'DE',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Re-map the footprint after the recent divestiture',
    key_risk: 'Footprint changed this year; the old site list is stale',
  },
  {
    deal_id: 'IND-005', company: 'SAMPLE — Kestrelex Specialty Chemicals', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'multi',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Establish whether the US business can decide without the parent',
    key_risk: 'Overseas parent; US decision autonomy unclear',
  },
  {
    deal_id: 'IND-008', company: 'SAMPLE — Northfield Surfactants', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'IL',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Test whether process continuity is a live pain or a stated one',
    key_risk: 'Mid-cap; no load profile on file and no contact yet',
  },
  {
    deal_id: 'IND-009', company: 'SAMPLE — Bayline Vinyls', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'CenterPoint', value_prop: 'Multiple',
    beachhead_site: 'Coastal plant', size_mw: null, champion: null,
    next_move: 'Open on air-permit headroom; map the plants in the same airshed',
    key_risk: 'Competitive home territory; no contact yet',
  },
  {
    deal_id: 'IND-014', company: 'SAMPLE — Quillon Semiconductor', vertical: 'Industrial-Semicon',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'DE',
    utility: 'Delmarva', value_prop: 'Multiple', beachhead_site: 'Wafer fab',
    size_mw: null, champion: null,
    next_move: 'Reach them while the energy strategy is still being written',
    key_risk: 'Newly separated business; procurement process still forming',
  },

  // ── OIL & GAS — DOWNSTREAM ──
  {
    deal_id: 'OG-003', company: 'SAMPLE — Redstone Refining', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Secondary', state: 'KS',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Qualify reliability pain at the two inland refineries',
    key_risk: 'Inland sites; the permitting argument lands harder on the coast',
  },
  {
    deal_id: 'OG-010', company: 'SAMPLE — Copperline Energy Partners', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Pick one refinery as the beachhead rather than pitching the fleet',
    key_risk: 'Large fleet; needs sequencing before any enterprise conversation',
  },
  {
    deal_id: 'OG-017', company: 'SAMPLE — Halbrook Petroleum', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'OH',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: 'Gulf refinery',
    size_mw: null, champion: null,
    next_move: 'Lead with the coastal site where air permitting is tightest',
    key_risk: 'Large fleet; head office is far from the site that matters',
  },

  // ── OIL & GAS — MIDSTREAM ──
  {
    deal_id: 'OG-013', company: 'SAMPLE — Perdiz Midstream', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'ERCOT', value_prop: 'Multiple', beachhead_site: 'Gas processing complex',
    size_mw: null, champion: null,
    next_move: 'Map processing and fractionation loads — they already own the fuel',
    key_risk: 'Assets spread across a basin; loads are distributed',
  },
  {
    deal_id: 'OG-015', company: 'SAMPLE — Silt Creek Pipeline Partners', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'multi', value_prop: 'Grid-fighter', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Find out whether any single station clears the minimum unit size',
    key_risk: 'Many small loads; may be sub-scale everywhere',
  },
  {
    deal_id: 'OG-016', company: 'SAMPLE — Bluestem Gathering Co', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'KS',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Probe both angles: compression load, and their own build ambitions',
    key_risk: 'May want to partner rather than buy',
  },
  {
    deal_id: 'OG-018', company: 'SAMPLE — Cordillera NGL Partners', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Secondary', state: 'OK',
    utility: 'PSO', value_prop: 'Multiple',
    beachhead_site: 'NGL fractionation hub', size_mw: null, champion: null,
    next_move: 'Follow the load rather than the head office — the hub is out of state',
    key_risk: 'Assets in several states; the biggest loads are not near HQ',
  },
  {
    deal_id: 'OG-019', company: 'SAMPLE — Tamarack Transmission', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'OK',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Test the dual angle: compression load, and their announced power projects',
    key_risk: 'Building generation themselves — buyer, partner, or neither',
  },
  {
    deal_id: 'OG-020', company: 'SAMPLE — Northbank Energy Transport', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'TX',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Establish where US decisions are actually made',
    key_risk: 'Overseas parent, and pursuing its own generation projects',
  },

  // ── OTHER ──
  {
    deal_id: 'OTH-011', company: 'SAMPLE — Verano Estate Winery', vertical: 'Other-Winery',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'CA',
    utility: 'PG&E', value_prop: 'Grid-fighter', beachhead_site: 'Estate winery',
    size_mw: null, champion: null,
    next_move: 'Qualify load size first — a fast no is the useful outcome here',
    key_risk: 'Probably sub-scale; verify before investing time',
  },
  {
    deal_id: 'OTH-012', company: 'SAMPLE — Meridian Health Properties', vertical: 'Other-REIT',
    relationship_type: 'Channel/Partner', geo_tier: 'Primary', state: 'IL',
    utility: 'multi', value_prop: 'Grid-fighter', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Clarify who owns the load — the landlord or the tenant',
    key_risk: 'Relationship type unclear; loads split across a portfolio',
  },
];

function buildDeal(spec: SeedSpec, index: number): Deal {
  /**
   * ⚠️ `base` OMITS BOTH DERIVED SCORES, and it used to carry
   * `health_score: 3` as a placeholder that the return statement overwrote.
   *
   * It never shipped — but it was a THIRD hardcoded source for a value with two
   * implementations already, sitting in a `Deal`-typed object where a reader
   * could believe it, one refactor away from being returned. The defect this
   * repo just spent a day on was twenty-one hand-written health scores that no
   * function produced; a hand-written one in the seed builder is the same thing
   * waiting for an accident.
   *
   * Omitting them from the type means there is nowhere to put a literal.
   */
  const base: Omit<Deal, 'health_score' | 'meddpicc_score'> = {
    id: `seed-${spec.deal_id.toLowerCase()}`,
    ...spec,
    stage: 'Prospecting',
    // Null across the whole seed. Site-level territory is a fact about a site
    // nobody has visited; resolution falls through to the account level, which
    // is exactly the graceful path.
    beachhead_utility: null,
    size_usd_m: null,
    multi_threaded: false,
    decision_mapped: false,
    days_in_stage: 0,
    next_move_date: null,
    // Deliberately null across the whole seed. None of these accounts has a
    // forcing function on record, and inventing one would make every seeded
    // deal read as healthier than it is — the seed is a starting point, not a
    // claim about the book.
    critical_event: null,
    critical_event_date: null,
    metrics_known: false,
    economic_buyer: null,
    decision_criteria: null,
    decision_process: null,
    identified_pain: null,
    competition: null,
    landed_site: null,
    next_target_site: null,
    expansion_mw_captured: 0,
    expansion_mw_addressable: null,
    partner_notes: null,
    notes: null,
    artifacts: [],
    created_at: new Date(2026, 0, 1 + index).toISOString(),
    updated_at: new Date(2026, 0, 1 + index).toISOString(),
    user_id: null,
  };

  // Derive rather than hardcode, so the local copy and the database agree —
  // the schema trigger runs the same formula server-side.
  // Seed deals ship with no `deal_competitors` rows — a real zero, not an
  // unknown. Passed explicitly so the seed score matches what the app would
  // compute for the same row.
  const meddpicc = computeMeddpiccScore(base, 0);
  return {
    ...base,
    meddpicc_score: meddpicc,
    health_score: computeHealthScore({ ...base, meddpicc_score: meddpicc }),
  };
}

export const SEED_DEALS: Deal[] = SPECS.map(buildDeal);

/**
 * Seed feed items. Tagged arrival 'seed' and tier 'inferred' so the UI shows a
 * SEED badge — nothing here can be mistaken for live reporting.
 */
export const SEED_FEED_ITEMS: FeedItem[] = [
  {
    id: 'seed-feed-1',
    title: 'Connect a source to start the intelligence feed',
    synthesis:
      'No RSS sources have been swept yet. Once Supabase is connected, run a sweep from the Intelligence page and this feed fills with graded, account-mapped items from the sources in your vertical config.',
    tier: 'inferred',
    confidence: 0.2,
    arrival: 'seed',
    platform: 'seed',
    source_id: null,
    source_name: 'PowerDeal',
    url: null,
    url_hash: null,
    image_url: null,
    byline: null,
    published_at: null,
    category: 'power-markets',
    vertical_tags: ['power-markets'],
    deal_ids: [],
    action: 'Open Settings → Sources to review which feeds are enabled.',
    action_tier: 'inferred',
    breaking: false,
    cached_at: new Date().toISOString(),
    user_id: null,
  } as FeedItem,
];

export const SEED_CCUS_EVENTS: CcusEvent[] = [];

export const IS_SEED_DATA = true;
