import type { SourceTier } from '@/lib/types';

/**
 * VerticalConfig — the whole domain surface of the product in one object.
 *
 * Adding a vertical means adding one file to lib/verticals/ that satisfies this
 * interface. No component changes. Components read the active vertical via
 * lib/active-vertical.ts and render whatever it declares.
 */

/** Module IDs that can appear in the nav. PowerDeal adds pipeline/maps/ccus/pricing/forge/chat. */
export type ModuleId =
  // Inherited from The Hub
  | 'feed'
  | 'social'
  | 'assess'
  | 'alerts'
  | 'sources'
  | 'settings'
  | 'chat'
  // PowerDeal-specific
  | 'pipeline'
  | 'maps'
  | 'ccus'
  | 'pricing'
  | 'forge';

export type SourcePlatform = 'rss' | 'reddit' | 'youtube' | 'linkedin' | 'manual';

/** core = enters the main feed. discovery = gap detection only, never the main feed. */
export type SourceRole = 'core' | 'discovery';

export interface Category {
  id: string;
  label: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  platform: SourcePlatform;
  url: string;
  /** Trust grade applied to items from this source before any AI adjustment. */
  defaultTier: SourceTier;
  category: string;
  role: SourceRole;
  /** Discovery sources are opt-in; core sources are on unless muted. */
  enabledByDefault?: boolean;
  /** Why this source earns a slot — shown in Settings › Sources. */
  rationale: string;
  /**
   * Known-broken sources, marked rather than deleted.
   *
   * A source that 403s from Vercel's IP ranges is not a bad source — it is a
   * source we currently cannot reach, and the distinction matters. Deleting it
   * makes the gap invisible; leaving it unmarked makes the feed look healthier
   * than it is. `blocked` says the coverage is missing AND why, so the Sources
   * tab can show the hole instead of hiding it.
   */
  status?: 'active' | 'blocked';
  /** Required when status is 'blocked' — what is actually wrong. */
  blockedReason?: string;
}

export interface TickerEntry {
  id: string;
  kind: 'value' | 'delta';
  label: string;
  symbol?: string;
}

export interface TickerConfig {
  enabled: boolean;
  label: string;
  entries: TickerEntry[];
}

export interface AssessmentDimension {
  key: string;
  label: string;
}

export interface AssessmentQuestion {
  key: string;
  dimension: string;
  prompt: string;
  /** Ordered worst → best. Index maps to score. */
  options: string[];
}

export interface AssessmentLevel {
  min: number;
  label: string;
}

export interface AssessmentConfig {
  dimensions: AssessmentDimension[];
  questions: AssessmentQuestion[];
  levels: AssessmentLevel[];
}

export interface Vocabulary {
  subject: string;
  period: string;
  event: string;
}

export interface VerticalTheme {
  accent: string;
}

export interface VerticalConfig {
  id: string;
  name: string;
  tagline: string;
  description: string;
  categories: Category[];
  modules: ModuleId[];
  sources: SourceConfig[];
  /** Never enters the main feed — used only to detect coverage gaps. */
  discovery: SourceConfig[];
  /** Domains worth watching for blue-ocean opportunity detection. */
  watchedDomains: string[];
  ticker: TickerConfig;
  assessment: AssessmentConfig;
  vocabulary: Vocabulary;
  theme: VerticalTheme;
}
