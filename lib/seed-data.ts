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
 * ══ WHY EVERY COMPANY CARRIES A PREFIX ══
 *
 * This file used to open with "These are the REAL 21 Spine accounts, mirroring
 * supabase/seed.sql", and that sentence was the whole problem. Twenty-one
 * rows, the same twenty-one companies, one of them carrying a real person's
 * name in `champion`, `next_move` and `key_risk`.
 *
 * The consequence was not theoretical. A screenshot taken during this build
 * showed BAE with Champion recorded and health 2.8; the live book has BAE at
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
 * The verticals, states, utilities and stage distribution stay real, because
 * the fallback has to exercise the same code paths the live data does. A seed
 * set of Foo Corp in state XX would stop catching layout and grouping defects,
 * which is the other job this data does.
 *
 * supabase/seed.sql IS NOT TOUCHED. It populates the live instance and holds
 * the operator's actual book.
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
    deal_id: 'DEF-001', company: 'SAMPLE — BAE Systems', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'CA',
    utility: 'SDG&E', value_prop: 'Multiple', beachhead_site: 'ES — San Diego',
    size_mw: 116, champion: 'A. Sample (Energy & Utilities Mgr)',
    next_move: 'Land San Diego feasibility convo; name EB + security gatekeeper',
    key_risk: 'Single-threaded on the one named contact; no load number confirmed',
  },
  {
    deal_id: 'DEF-006', company: 'SAMPLE — General Dynamics', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'VA',
    utility: 'Dominion', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Identify beachhead segment (land systems vs. marine)',
    key_risk: 'Massive multi-segment enterprise; security gates throughout',
  },
  {
    deal_id: 'DEF-007', company: 'SAMPLE — L3Harris', vertical: 'Defense',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'FL',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Map facility footprint; identify reliability-critical fabs',
    key_risk: 'Multi-site; security/OPSEC gates like BAE',
  },
  {
    deal_id: 'DEF-021', company: 'SAMPLE — SpaceX', vertical: 'Defense/Special',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'ERCOT', value_prop: 'Multiple', beachhead_site: 'Starbase TX',
    size_mw: null, champion: null,
    next_move: 'Qualify Starbase + factory loads; time-to-power is their language',
    key_risk: 'Moves fast, vertically integrated — may self-build power; ITAR gates',
  },

  // ── INDUSTRIAL / CHEMICAL ──
  {
    deal_id: 'IND-002', company: 'SAMPLE — Cabot Corp', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'MA',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Identify multi-site beachhead; map carbon black plant loads',
    key_risk: 'Multi-site enterprise; no contact; load unknown',
  },
  {
    deal_id: 'IND-004', company: 'SAMPLE — DuPont', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'DE',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Map US plant footprint post-Qnity spin; find beachhead',
    key_risk: 'Post-Qnity spinoff — footprint shrank, re-scope needed',
  },
  {
    deal_id: 'IND-005', company: 'SAMPLE — Evonik', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'multi',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Map US footprint; find US decision authority (German parent)',
    key_risk: 'Foreign parent; US decision autonomy unclear',
  },
  {
    deal_id: 'IND-008', company: 'SAMPLE — Stepan Co', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'IL',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Qualify process-continuity + ESG pain at surfactant plants',
    key_risk: 'Mid-cap; load profile unknown; no contact yet',
  },
  {
    deal_id: 'IND-009', company: 'SAMPLE — Westlake Corp', vertical: 'Industrial-Chemical',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'CenterPoint', value_prop: 'Multiple',
    beachhead_site: 'Gulf Coast petrochemical', size_mw: null, champion: null,
    next_move: 'HGB non-attainment permitting angle; map Gulf Coast vinyls plants',
    key_risk: 'Home-turf Houston; no contact yet; HGB is the wedge',
  },
  {
    deal_id: 'IND-014', company: 'SAMPLE — Qnity Electronics', vertical: 'Industrial-Semicon',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'DE',
    utility: 'Delmarva', value_prop: 'Multiple', beachhead_site: 'Newark DE fab',
    size_mw: null, champion: null,
    next_move: 'Map US fab footprint; fresh-spin energy strategy window NOW',
    key_risk: 'New company (Nov 2025) — processes still forming; DuPont sibling',
  },

  // ── OIL & GAS — DOWNSTREAM ──
  {
    deal_id: 'OG-003', company: 'SAMPLE — CVR Energy', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Secondary', state: 'KS',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Qualify refinery reliability + permitting pain at Coffeyville/Wynnewood',
    key_risk: '2 mid-con refineries; no contact; mid-con HGB less acute than Gulf Coast',
  },
  {
    deal_id: 'OG-010', company: 'SAMPLE — Valero', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Pick beachhead refinery; reliability + HGB permitting angle',
    key_risk: '15-refinery giant; enterprise sequencing like BAE needed',
  },
  {
    deal_id: 'OG-017', company: 'SAMPLE — Marathon Petroleum', vertical: 'O&G-Down',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'OH',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: 'Galveston Bay TX (HGB)',
    size_mw: null, champion: null,
    next_move: 'Galveston Bay refinery = HGB non-attainment wedge; pick beachhead',
    key_risk: 'Largest US refiner; enterprise sequencing needed same as Valero',
  },

  // ── OIL & GAS — MIDSTREAM ──
  {
    deal_id: 'OG-013', company: 'SAMPLE — Targa Resources', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'ERCOT', value_prop: 'Multiple', beachhead_site: 'Permian gas processing',
    size_mw: null, champion: null,
    next_move: 'Map Permian processing/fractionation loads — they OWN the fuel',
    key_risk: 'Multi-asset Permian sprawl; distributed loads',
  },
  {
    deal_id: 'OG-015', company: 'SAMPLE — Plains All American', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'TX',
    utility: 'multi', value_prop: 'Grid-fighter', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Qualify pump-station/terminal loads — are any sites large enough?',
    key_risk: 'Many small distributed loads; need to find sites above minimum threshold',
  },
  {
    deal_id: 'OG-016', company: 'SAMPLE — Tallgrass', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'KS',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Probe dual angle: compression loads (Direct) + decarb infra ambitions (Partner)',
    key_risk: 'Energy-transition strategy may make them partner not just buyer',
  },
  {
    deal_id: 'OG-018', company: 'SAMPLE — ONEOK', vertical: 'O&G-Mid',
    relationship_type: 'Direct', geo_tier: 'Secondary', state: 'OK',
    utility: 'PSO', value_prop: 'Multiple',
    beachhead_site: 'Mont Belvieu TX NGL fractionation', size_mw: null, champion: null,
    next_move: 'Map fractionator + processing loads; Mont Belvieu = TX cluster play',
    key_risk: 'Multi-state asset sprawl; OK HQ but TX loads are the prize',
  },
  {
    deal_id: 'OG-019', company: 'SAMPLE — Williams', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'OK',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Dual angle: Transco compression loads + announced power-for-DC builds',
    key_risk: 'They are building gas power themselves — buyer, partner, or neither?',
  },
  {
    deal_id: 'OG-020', company: 'SAMPLE — TC Energy', vertical: 'O&G-Mid',
    relationship_type: 'Direct/Partner', geo_tier: 'Secondary', state: 'TX',
    utility: 'multi', value_prop: 'Multiple', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'US decision authority (Calgary parent); dual angle incl. power ambitions',
    key_risk: 'Foreign parent; pursuing own power plays; US autonomy unclear',
  },

  // ── OTHER ──
  {
    deal_id: 'OTH-011', company: 'SAMPLE — Far Niente', vertical: 'Other-Winery',
    relationship_type: 'Direct', geo_tier: 'Primary', state: 'CA',
    utility: 'PG&E', value_prop: 'Grid-fighter', beachhead_site: 'Napa estate',
    size_mw: null, champion: null,
    next_move: 'Qualify load size first — likely sub-scale; fast-fail candidate',
    key_risk: 'Winery load probably too small; verify before investing time',
  },
  {
    deal_id: 'OTH-012', company: 'SAMPLE — Ventas', vertical: 'Other-REIT',
    relationship_type: 'Channel/Partner', geo_tier: 'Primary', state: 'IL',
    utility: 'multi', value_prop: 'Grid-fighter', beachhead_site: null,
    size_mw: null, champion: null,
    next_move: 'Clarify model: REIT owns buildings, tenants own load — channel play?',
    key_risk: 'Relationship type unclear; distributed small loads across portfolio',
  },
];

function buildDeal(spec: SeedSpec, index: number): Deal {
  const base: Deal = {
    id: `seed-${spec.deal_id.toLowerCase()}`,
    ...spec,
    stage: 'Prospecting',
    // Null across the whole seed. Site-level territory is a fact about a site
    // nobody has visited; resolution falls through to the account level, which
    // is exactly the graceful path.
    beachhead_utility: null,
    size_usd_m: null,
    meddpicc_score: 0,
    health_score: 3,
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
