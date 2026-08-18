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

/**
 * Which fight this deal is, from §1A and the Spine schema in v3.1.10.
 *
 * Grid-fighter      rate / reliability / queue pain
 * Combustion-fighter emissions / permitting pain
 * Integrator-fighter a bundle, not a machine — the comparison is our PPA/EaaS
 *                   structure against theirs, and a heat-rate argument lands
 *                   flat because the buyer already decided not to own or operate
 * Multiple          more than one at once
 *
 * 'Both' was the old third arm and is renamed rather than kept alongside
 * 'Multiple': two names for one concept is the defect the tier rename just
 * removed. The data migration is in 20260811_value_prop_integrator.sql.
 */
export const VALUE_PROPS = [
  'Grid-fighter', 'Combustion-fighter', 'Integrator-fighter', 'Multiple',
] as const;
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

/**
 * The competitive set, from section 1A of the system prompt.
 *
 * Tier 1B is INTEGRATORS — VoltaGrid, Enchanted Rock, PowerSecure, Conduit,
 * Aggreko, ProEnergy, Liberty, APR Energy, Williams. They compete on commercial
 * model rather than specification: a buyer comparing an integrator has already
 * decided not to own or operate anything, so heat rate and emissions land flat
 * and the comparison is our PPA/EaaS structure against their bundle.
 *
 * Hard rule 17 is the binding form — never answer an integrator with a heat
 * rate — and it arrived with prompts/powerdeal-v3.1.10-system-prompt.md. Before
 * that sync the repo carried v3.1.8, which contained the word "integrator" zero
 * times, and a Tier 1B card generated against the standing instruction to lead
 * with what grid and combustion cannot do: a heat-rate argument, which is the
 * one answer doctrine forbids here.
 */
/**
 * The doctrine's competitive set, in doctrine order.
 *
 * 'tier-1b' rather than 'integrator': one concept must not have two names, and
 * the methodology's name wins. It also sorts correctly — 'integrator' sorted
 * ahead of 'tier-1' in every `order by tier`, putting the fourth tier first.
 */
export const COMPETITOR_TIERS = ['tier-1', 'tier-1b', 'tier-2', 'tier-3'] as const;
export type CompetitorTier = (typeof COMPETITOR_TIERS)[number];

export const TIER_LABELS: Record<CompetitorTier, string> = {
  'tier-1': 'Tier 1 — primary',
  'tier-1b': 'Tier 1B — integrators',
  'tier-2': 'Tier 2 — situational',
  'tier-3': 'Tier 3 — on request',
};

/**
 * 'not-present' is how a DEFAULT-ON competitor is switched off.
 *
 * Distinct from 'eliminated', which means we beat them. 'not-present' means
 * they were never in this deal at all — a remote off-grid site where the real
 * fight is a recip engine and grid supply was never an option.
 */
export const COMPETITOR_STATUSES = [
  'active',
  'eliminated',
  'lost-to',
  'won-against',
  'not-present',
] as const;
export type CompetitorStatus = (typeof COMPETITOR_STATUSES)[number];

/**
 * One competitor in one deal. A deal holds a SET of these.
 *
 * Per-deal rather than per-account, and Williams is why: it is simultaneously a
 * midstream customer and an integrator competitor. A single account-level
 * posture cannot hold both, and whichever half it held would be wrong for the
 * other.
 */
export interface DealCompetitor {
  id: string;
  deal_id: string;
  competitor: string;
  tier: CompetitorTier;
  /** What WE argue against this competitor in this deal. */
  posture: string | null;
  /** What the competitor, or the buyer relaying them, actually said. */
  what_was_said: string | null;
  /** Which of our arguments actually moved them. The compounding half. */
  what_landed: string | null;
  status: CompetitorStatus;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

// ── Deal (the Pipeline Spine row) ───────────────────────────────

export interface Deal {
  /**
   * Field keys the operator has confirmed are genuinely empty.
   *
   * ⚠️ TURNS "not checked" INTO "not recorded" AND NOTHING ELSE. Never read by
   * scoring — see supabase/migrations/20260818_verified_empty.sql. Optional and
   * opt-in per field; an empty array is the honest default, because
   * "unchecked" is true of everything until the operator says otherwise.
   */
  verified_empty?: string[] | null;
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
  /**
   * Utility territory of the beachhead site, which WINS over the account-level
   * `utility` field in the resolver.
   *
   * On a national account the account-level field describes the company; the
   * beachhead is where the electrons and the tariff actually are, and those are
   * routinely different. Null is normal — resolution falls through to the
   * account level and then to the generic label.
   */
  beachhead_utility: string | null;
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

  /**
   * The forcing function that makes doing nothing expensive.
   *
   * Absence caps health at 6. A deal with no critical event has no reason to
   * close on any particular date, which is the shape most no-decision losses
   * have in hindsight.
   */
  critical_event: string | null;
  /** Null is allowed — the event without its date still beats nothing. */
  critical_event_date: string | null;

  // MEDDPICC breakdown
  metrics_known: boolean;
  economic_buyer: string | null;
  decision_criteria: string | null;
  decision_process: string | null;
  identified_pain: string | null;
  champion: string | null;
  /**
   * @deprecated as the competitive record. `deal_competitors` plus the toggle
   * grid is the sole authority for who is in a deal.
   *
   * Free text cannot hold a SET of postures, cannot say which competitor an
   * argument was aimed at, and cannot be switched off — and every one of those
   * is something the card generator needs. Nothing generated reads this field.
   *
   * The column is kept and still displayed as a legacy note, because it is
   * where whatever was written before this table existed still lives. Dropping
   * it would delete the only copy. Its one remaining behavioural role is the
   * MEDDPICC 'C' point — see docs/BACKLOG.md item 6.
   */
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
  /**
   * What the buyer actually said, in their words.
   *
   * Never a paraphrase, never a category. The point is that it is quotable —
   * a buyer's own sentence about why they did not buy carries weight no
   * vendor-authored claim can, and it compounds across closes.
   */
  buyer_verbatim: string | null;
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
