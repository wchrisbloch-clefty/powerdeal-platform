/**
 * Core domain types. These mirror supabase/schema.sql 1:1 — the deals table IS
 * the Pipeline Spine, so a field added here must be added there and vice versa.
 */

// ── Enumerations ────────────────────────────────────────────────

export const DEAL_STAGES = [
  'Prospecting',
  'Qualified',
  'Intro Call',
  'Discovery',
  'Solution Design',
  'Economic Proposal',
  'Negotiation',
  'Contracting',
  'Closed-Won',
  'Post-Sale',
  'Archived',
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/** Stages that no longer count as "in flight" for stall detection. */
export const TERMINAL_STAGES: readonly DealStage[] = ['Closed-Won', 'Post-Sale', 'Archived'];

/** Verticals in use across the live Spine, plus room to grow. */
export const VERTICALS = [
  'Defense',
  'Defense/Special',
  'O&G-Down',
  'O&G-Mid',
  'O&G-Up',
  'Industrial-Chemical',
  'Industrial-Semicon',
  'Industrial-Other',
  'Data Center',
  'Other-Winery',
  'Other-REIT',
  'Other',
] as const;
export type Vertical = (typeof VERTICALS)[number];

/**
 * Relationship type. The compound values are load-bearing, not sloppy data:
 * a midstream account that owns gas, land, and right-of-way may be a better
 * co-developer than customer, and running it as Direct-only misses the deal.
 */
export const RELATIONSHIP_TYPES = [
  'Direct',
  'Direct/Partner',
  'Channel',
  'Channel/Partner',
  'Partner',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const GEO_TIERS = ['Primary', 'Secondary', 'National'] as const;
export type GeoTier = (typeof GEO_TIERS)[number];

/** Grid-fighter = rate/reliability pain. Combustion-fighter = emissions/permit pain. */
export const VALUE_PROPS = ['Grid-fighter', 'Combustion-fighter', 'Both'] as const;
export type ValueProp = (typeof VALUE_PROPS)[number];

/** Graded provenance — The Hub's trust spine, applied to every intelligence item. */
export const SOURCE_TIERS = ['verified', 'reported', 'inferred'] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export const SIGNAL_TYPES = [
  'pain',
  'trigger-event',
  'corporate-event',
  'market-trend',
  'competitive',
  'stakeholder',
  'macro-policy',
  'ESG',
  'objection',
  'win-loss',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const MARKET_WATCH_CATEGORIES = [
  'rate-move',
  'capacity-cap-tag',
  'policy',
  'customer-announcement',
  'earnings',
  'grid-stress',
  'value-prop-enhancer',
  'peer-signal',
  'ccus',
] as const;
export type MarketWatchCategory = (typeof MARKET_WATCH_CATEGORIES)[number];

export const CCUS_EVENT_TYPES = [
  'class-vi-permit-application',
  'class-vi-permit-approved',
  'class-vi-permit-denied',
  'state-primacy-granted',
  'state-primacy-pending',
  'gccsi-project-update',
  'doe-funding',
  'iea-project-update',
] as const;
export type CcusEventType = (typeof CCUS_EVENT_TYPES)[number];

export const OUTCOME_TYPES = ['No-Decision', 'Competitive', 'Disqualified', 'Won'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

// ── Deal (the Pipeline Spine row) ───────────────────────────────

export interface Deal {
  id: string;
  deal_id: string; // human key: DC-001, DEF-001, OG-010
  company: string;
  vertical: string;
  relationship_type: RelationshipType | string;
  geo_tier: GeoTier | string | null;
  state: string | null;
  utility: string | null;
  value_prop: ValueProp | string | null;
  beachhead_site: string | null;
  stage: DealStage | string;
  size_mw: number | null;
  size_usd_m: number | null;
  meddpicc_score: number; // 0..8
  health_score: number; // 1..10
  multi_threaded: boolean;
  decision_mapped: boolean;
  days_in_stage: number;
  next_move: string | null;
  next_move_date: string | null;
  key_risk: string | null;

  // MEDDPICC breakdown
  metrics_known: boolean;
  economic_buyer: string | null;
  decision_criteria: string | null;
  decision_process: string | null;
  identified_pain: string | null;
  champion: string | null;
  competition: string | null;

  // Land-and-expand
  landed_site: string | null;
  next_target_site: string | null;
  expansion_mw_captured: number;
  expansion_mw_addressable: number | null;

  partner_notes: string | null;
  notes: string | null;
  artifacts: DealArtifact[];

  created_at: string;
  updated_at: string;
  user_id: string | null;
}

export interface DealArtifact {
  type: string; // brief | plan | map | outreach | deck | proforma | economics-scenario
  label?: string;
  url: string;
  format?: string;
  created_at: string;
  /**
   * Payload for artifacts whose content IS the artifact rather than a link to
   * one — economics scenarios carry their full input set here so the deal
   * record is self-contained. `artifacts` is jsonb, so this needs no migration.
   */
  data?: Record<string, unknown>;
}

/** The 8 MEDDPICC pillars, in scoring order. */
export const MEDDPICC_FIELDS = [
  { key: 'metrics_known', label: 'Metrics', hint: 'Quantified economic impact the customer owns' },
  { key: 'economic_buyer', label: 'Economic Buyer', hint: 'Named person who can sign' },
  { key: 'decision_criteria', label: 'Decision Criteria', hint: 'How they will judge options' },
  { key: 'decision_process', label: 'Decision Process', hint: 'Steps, committee, signature path' },
  { key: 'identified_pain', label: 'Identified Pain', hint: 'Grid pain, combustion pain, or both' },
  { key: 'champion', label: 'Champion', hint: 'Named internal seller with access' },
  { key: 'competition', label: 'Competition', hint: 'Alternatives including do-nothing' },
  { key: 'decision_mapped', label: 'Paper Process', hint: 'Security gate, legal, procurement mapped' },
] as const;
export type MeddpiccFieldKey = (typeof MEDDPICC_FIELDS)[number]['key'];

// ── Supporting records ──────────────────────────────────────────

export interface Contact {
  id: string;
  deal_id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  role_type: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  user_id: string | null;
}

export interface StageTransition {
  id: string;
  deal_id: string | null;
  deal_ref: string | null;
  from_stage: string;
  to_stage: string;
  days_in_prior: number | null;
  transitioned_at: string;
  notes: string | null;
  user_id: string | null;
}

export interface WinLossEntry {
  id: string;
  deal_id: string | null;
  company: string;
  outcome_type: OutcomeType;
  reason: string | null;
  lesson: string | null;
  competitor_won: string | null;
  revisit_trigger: string | null;
  closed_at: string;
  user_id: string | null;
}

export interface Signal {
  id: string;
  signal_type: SignalType | string;
  source_name: string | null;
  deal_ids: string[];
  account_meaning: string | null;
  business_meaning: string | null;
  so_what: string | null;
  raw_signal: string | null;
  logged_at: string;
  user_id: string | null;
}

export interface MarketWatchEntry {
  id: string;
  category: MarketWatchCategory | string;
  source_name: string | null;
  source_tier: SourceTier;
  headline: string;
  summary: string | null;
  url: string | null;
  deal_ids: string[];
  outreach_hook: string | null;
  peers_to_add: string[];
  impact_rank: number;
  swept_at: string;
  user_id: string | null;
}

export interface FeedItem {
  id: string;
  title: string;
  synthesis: string | null;
  tier: SourceTier;
  confidence: number; // 0..1
  arrival: 'rss' | 'youtube' | 'reddit' | 'share' | 'manual' | 'seed' | string;
  platform: string;
  source_id: string | null;
  source_name: string | null;
  url: string | null;
  /** hash(canonical url) — the dedupe + summary-cache key. */
  url_hash: string | null;
  image_url: string | null;
  byline: string | null;
  published_at: string | null;
  category: string | null;
  vertical_tags: string[];
  deal_ids: string[];
  action: string | null;
  action_tier: SourceTier;
  breaking: boolean;
  cached_at: string;
  user_id: string | null;
}

export interface CcusEvent {
  id: string;
  event_type: CcusEventType | string;
  project_name: string | null;
  state: string | null;
  operator: string | null;
  details: string | null;
  source_url: string | null;
  source_tier: SourceTier;
  deal_ids: string[];
  event_date: string | null;
  logged_at: string;
  user_id: string | null;
}

export interface UserSettings {
  id: string;
  user_id: string;
  theme: 'light' | 'dark';
  source_prefs: SourcePrefs;
  watchlist: Watchlist;
  display_density: 'compact' | 'comfortable' | 'spacious';
  default_map_layer: string;
  notify_market_watch: boolean;
  notify_stall_alert: boolean;
  notify_weekly_recap: boolean;
  updated_at: string;
}

export interface SourcePrefs {
  muted: string[];
  enabled: string[];
  order: string[];
  custom: CustomSource[];
}

export interface CustomSource {
  id: string;
  name: string;
  url: string;
  category: string;
  defaultTier: SourceTier;
}

export interface Watchlist {
  accounts: string[];
  topics: string[];
  verticals: string[];
  utilities: string[];
}

// ── AI plumbing ─────────────────────────────────────────────────

export interface ChatInput {
  system: string;
  user: string;
  maxTokens?: number;
  /** Mark the system prefix as cacheable (Anthropic prompt caching). */
  promptCache?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Utility rate benchmark for one utility territory. */
export interface RateBenchmark {
  utility: string;
  state: string;
  rate_usd_kwh: number | null;
  yoy_change_pct: number | null;
  active_rate_case: string | null;
  affected_deals: { id: string; deal_id: string; company: string }[];
}
