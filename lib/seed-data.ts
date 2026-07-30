import type { Deal, FeedItem, CcusEvent } from './types';
import { computeHealthScore } from './deals';

/**
 * Zero-key fallback data (GLOBAL RULE 4).
 *
 * When Supabase is unconfigured the product still runs: the pipeline table
 * sorts and filters, the map plots markers, the feed renders. Everything here
 * is tagged so it can never be mistaken for live intelligence — feed items
 * carry arrival 'seed', and deals carry the same "verify before use" note as
 * supabase/seed.sql.
 *
 * These mirror the template rows in supabase/seed.sql. Same caveat applies:
 * structural placeholders, no invented MEDDPICC, contacts, or MW figures.
 */

const NOTE = 'Template row — verify site, territory, and load before use.';

type SeedSpec = Pick<
  Deal,
  'deal_id' | 'company' | 'vertical' | 'state' | 'utility' | 'value_prop' | 'geo_tier'
>;

const SPECS: SeedSpec[] = [
  { deal_id: 'DEF-001', company: 'BAE Systems', vertical: 'Defense', state: 'NH', utility: 'Eversource', value_prop: 'Both', geo_tier: 'Primary' },
  { deal_id: 'DEF-002', company: 'General Dynamics', vertical: 'Defense', state: 'VA', utility: 'Dominion', value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'DEF-003', company: 'Raytheon (RTX)', vertical: 'Defense', state: 'AZ', utility: null, value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'DEF-004', company: 'Lockheed Martin', vertical: 'Defense', state: 'TX', utility: 'Oncor', value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'DEF-005', company: 'Northrop Grumman', vertical: 'Defense', state: 'CA', utility: 'SCE', value_prop: 'Both', geo_tier: 'Secondary' },
  { deal_id: 'DEF-006', company: 'L3Harris Technologies', vertical: 'Defense', state: 'FL', utility: null, value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'DEF-007', company: 'Huntington Ingalls', vertical: 'Defense', state: 'VA', utility: 'Dominion', value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'OG-001', company: 'Valero Energy', vertical: 'O&G-Down', state: 'TX', utility: 'CenterPoint', value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'OG-002', company: 'Marathon Petroleum', vertical: 'O&G-Down', state: 'TX', utility: null, value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'OG-003', company: 'Phillips 66', vertical: 'O&G-Down', state: 'TX', utility: null, value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'OG-004', company: 'Energy Transfer', vertical: 'O&G-Mid', state: 'TX', utility: 'Oncor', value_prop: 'Grid-fighter', geo_tier: 'Primary' },
  { deal_id: 'OG-005', company: 'Williams Companies', vertical: 'O&G-Mid', state: 'OK', utility: null, value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
  { deal_id: 'OG-006', company: 'Kinder Morgan', vertical: 'O&G-Mid', state: 'TX', utility: 'CenterPoint', value_prop: 'Grid-fighter', geo_tier: 'Primary' },
  { deal_id: 'OG-007', company: 'Targa Resources', vertical: 'O&G-Mid', state: 'TX', utility: 'Oncor', value_prop: 'Grid-fighter', geo_tier: 'Primary' },
  { deal_id: 'IND-001', company: 'Westlake Corporation', vertical: 'Industrial-Chemical', state: 'TX', utility: 'CenterPoint', value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'IND-002', company: 'Dow', vertical: 'Industrial-Chemical', state: 'TX', utility: null, value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'IND-003', company: 'LyondellBasell', vertical: 'Industrial-Chemical', state: 'TX', utility: 'CenterPoint', value_prop: 'Combustion-fighter', geo_tier: 'Primary' },
  { deal_id: 'IND-004', company: 'Olin Corporation', vertical: 'Industrial-Chemical', state: 'LA', utility: null, value_prop: 'Combustion-fighter', geo_tier: 'Secondary' },
  { deal_id: 'DC-001', company: 'Equinix', vertical: 'Data Center', state: 'VA', utility: 'Dominion', value_prop: 'Grid-fighter', geo_tier: 'Primary' },
  { deal_id: 'DC-002', company: 'Digital Realty', vertical: 'Data Center', state: 'VA', utility: 'Dominion', value_prop: 'Grid-fighter', geo_tier: 'Primary' },
  { deal_id: 'OTH-001', company: 'SpaceX', vertical: 'Other', state: 'TX', utility: null, value_prop: 'Grid-fighter', geo_tier: 'Secondary' },
];

function buildDeal(spec: SeedSpec, index: number): Deal {
  const base: Deal = {
    id: `seed-${spec.deal_id.toLowerCase()}`,
    deal_id: spec.deal_id,
    company: spec.company,
    vertical: spec.vertical,
    relationship_type: 'Direct',
    geo_tier: spec.geo_tier,
    state: spec.state,
    utility: spec.utility,
    value_prop: spec.value_prop,
    beachhead_site: null,
    stage: 'Prospecting',
    size_mw: null,
    size_usd_m: null,
    meddpicc_score: 0,
    health_score: 3,
    multi_threaded: false,
    decision_mapped: false,
    days_in_stage: 0,
    next_move: null,
    next_move_date: null,
    key_risk: null,
    metrics_known: false,
    economic_buyer: null,
    decision_criteria: null,
    decision_process: null,
    identified_pain: null,
    champion: null,
    competition: null,
    landed_site: null,
    next_target_site: null,
    expansion_mw_captured: 0,
    expansion_mw_addressable: null,
    partner_notes: null,
    notes: NOTE,
    artifacts: [],
    created_at: new Date(2026, 0, 1 + index).toISOString(),
    updated_at: new Date(2026, 0, 1 + index).toISOString(),
    user_id: null,
  };
  return { ...base, health_score: computeHealthScore(base) };
}

export const SEED_DEALS: Deal[] = SPECS.map(buildDeal);

/**
 * Seed feed items. Every one is arrival 'seed' and tier 'inferred' — the UI
 * renders a SEED badge so nothing here reads as live reporting.
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

/** Seed CCUS state — primacy only, which is public and static. */
export const SEED_CCUS_EVENTS: CcusEvent[] = [];

export const IS_SEED_DATA = true;
