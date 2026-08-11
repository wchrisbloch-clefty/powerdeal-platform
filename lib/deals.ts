import type { UtilityContext } from '@/lib/utility/model';
import type { Deal, DealStage } from './types';
import { TERMINAL_STAGES, MEDDPICC_FIELDS } from './types';

/**
 * Deal health scoring.
 *
 * Mirrors compute_health_score() in supabase/schema.sql. Keep the two in step —
 * this one drives instant UI feedback, the trigger is the stored authority.
 *
 * TWO caps, both at 6, both load-bearing:
 *
 *   · single-threaded — a deal with one contact dies when that person changes
 *     jobs, no matter how complete everything else is.
 *
 *   · no critical event — a deal with no forcing function has no reason to
 *     close on any particular date. No-decision is the dominant loss mode in
 *     complex sales, and the absence of a forcing function is its leading
 *     indicator, so it earns the same ceiling.
 *
 * A deal missing both is not penalised twice; the lower ceiling applies.
 */
export function computeHealthScore(deal: Partial<Deal>): number {
  let score = 0;

  // MEDDPICC completeness (max 2.5)
  score += ((deal.meddpicc_score ?? 0) / 8) * 2.5;

  // Multi-threaded (max 2)
  if (deal.multi_threaded) score += 2;

  // Economic buyer named (max 1.5)
  if (deal.economic_buyer) score += 1.5;

  // Stage momentum (max 1.5) — penalize stalls
  const days = deal.days_in_stage ?? 0;
  if (days < 30) score += 1.5;
  else if (days < 60) score += 0.75;

  // Decision process mapped (max 1.5)
  if (deal.decision_mapped) score += 1.5;

  // Champion known (max 1)
  if (deal.champion) score += 1;

  const raw = Math.min(10, score);
  const capped = Math.min(
    raw,
    deal.multi_threaded ? 10 : 6,
    hasCriticalEvent(deal) ? 10 : 6,
  );
  return Math.max(1, Math.round(capped * 10) / 10);
}

/**
 * A critical event is present when it is named. The DATE is optional on
 * purpose — knowing a budget cycle exists without knowing the exact day is
 * still worth more than nothing, and requiring both would push people to
 * invent a date to clear the cap.
 */
export function hasCriticalEvent(deal: Partial<Deal>): boolean {
  return Boolean(deal.critical_event?.trim());
}

/** Derive the MEDDPICC score (0-8) from which pillars are actually populated. */
export function computeMeddpiccScore(deal: Partial<Deal>): number {
  let n = 0;
  if (deal.metrics_known) n++;
  if (deal.economic_buyer) n++;
  if (deal.decision_criteria) n++;
  if (deal.decision_process) n++;
  if (deal.identified_pain) n++;
  if (deal.champion) n++;
  // ⚠️ THE LAST DEPENDENCY ON A DEPRECATED FIELD. `deals.competition` is no
  // longer the competitive record — deal_competitors and the toggle grid are —
  // but this point still reads it. Scoring it off presence instead is not a
  // drop-in: the grid has do-nothing and the grid ON by default, so presence
  // alone would hand every deal a free MEDDPICC point. The rule that works is
  // "a stored row exists", which needs the competitor set threaded through a
  // function the pipeline table calls once per row, and it moves a score on 21
  // live deals. Deliberately not rewired in this pass. See BACKLOG item 6.
  if (deal.competition) n++;
  if (deal.decision_mapped) n++;
  return n;
}

export type MeddpiccState = 'known' | 'gap' | 'unknown';

export function meddpiccState(deal: Deal, key: string): MeddpiccState {
  const value = deal[key as keyof Deal];
  if (typeof value === 'boolean') return value ? 'known' : 'gap';
  if (typeof value === 'string' && value.trim().length > 0) return 'known';
  return 'unknown';
}

export function meddpiccBreakdown(deal: Deal) {
  return MEDDPICC_FIELDS.map((f) => ({
    ...f,
    state: meddpiccState(deal, f.key),
    value: deal[f.key as keyof Deal],
  }));
}

// ── Health presentation ──────────────────────────────────────────

export type HealthBand = 'high' | 'mid' | 'low';

export function healthBand(score: number): HealthBand {
  if (score >= 8) return 'high';
  if (score >= 5) return 'mid';
  return 'low';
}

/** Tailwind token class for a health band. */
export function healthClass(score: number): string {
  const band = healthBand(score);
  return band === 'high'
    ? 'text-health-high'
    : band === 'mid'
      ? 'text-health-mid'
      : 'text-health-low';
}

// ── Risk flags ───────────────────────────────────────────────────

export interface RiskFlag {
  key: string;
  label: string;
  severity: 'warn' | 'danger';
}

/**
 * The structural problems worth interrupting someone over.
 * Ordered most-severe first — the table shows the first one inline.
 */
export function riskFlags(deal: Deal): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const terminal = TERMINAL_STAGES.includes(deal.stage as DealStage);

  if (!deal.multi_threaded && !terminal) {
    flags.push({
      key: 'single-thread',
      label: 'Single-threaded',
      // A single-threaded deal that scores well is the dangerous case —
      // it looks healthy right up until the one contact leaves.
      severity: deal.health_score > 5 ? 'danger' : 'warn',
    });
  }

  if (deal.days_in_stage > 60 && !terminal) {
    flags.push({ key: 'stalled-60', label: `Stalled ${deal.days_in_stage}d`, severity: 'danger' });
  } else if (deal.days_in_stage > 30 && !terminal) {
    flags.push({ key: 'stalled-30', label: `${deal.days_in_stage}d in stage`, severity: 'warn' });
  }

  if (!deal.decision_mapped && !terminal) {
    flags.push({ key: 'unmapped', label: 'Decision unmapped', severity: 'warn' });
  }

  if (!deal.economic_buyer && !terminal) {
    flags.push({ key: 'no-eb', label: 'No economic buyer', severity: 'warn' });
  }

  // Same reasoning as single-thread: a deal with no forcing function that
  // otherwise scores well is the dangerous case, because nothing about the
  // record explains why it would close this quarter rather than never.
  if (!hasCriticalEvent(deal) && !terminal) {
    flags.push({
      key: 'no-critical-event',
      label: 'No critical event',
      severity: deal.health_score > 5 ? 'danger' : 'warn',
    });
  }

  return flags;
}

/**
 * Structural utility risks, as qualification-stage flags.
 *
 * Separate from riskFlags() and deliberately so: riskFlags is pure and
 * synchronous over a Deal, and the utility layer resolves asynchronously from
 * fields that a prospect with no deal row also has. Merging them would drag a
 * database read into a function the pipeline table calls once per row.
 *
 * A CO-OP is the case this exists for. Many distribution co-ops are bound to a
 * G&T under all-requirements contracts that prohibit behind-the-meter
 * generation outright or price the exit punitively. That is discoverable at
 * LEVEL 1 — the moment the type field says 'coop' — and it belongs in
 * qualification rather than in month-five diligence, because nothing
 * downstream of it survives a contract that forbids the project.
 *
 * Unverified counts. A co-op whose contract nobody has read is exactly the
 * deal the flag is for, so `null` raises it just as `true` does.
 */
export function utilityRiskFlags(ctx: UtilityContext | null): RiskFlag[] {
  if (!ctx) return [];
  return ctx.risks
    .filter((r) => !r.answered)
    .map((r) => ({
      key: r.key,
      label: r.label,
      // A NO-GO candidate is not a warning. Everything after it is wasted if
      // the answer comes back the wrong way.
      severity: r.severity === 'no-go-candidate' ? ('danger' as const) : ('warn' as const),
    }));
}

export function isAtRisk(deal: Deal): boolean {
  if (TERMINAL_STAGES.includes(deal.stage as DealStage)) return false;
  return deal.health_score < 5 || deal.days_in_stage > 30;
}

export function isStalled(deal: Deal, thresholdDays = 30): boolean {
  if (TERMINAL_STAGES.includes(deal.stage as DealStage)) return false;
  return deal.days_in_stage > thresholdDays;
}

// ── Deal ID generation ───────────────────────────────────────────

const VERTICAL_PREFIX: Record<string, string> = {
  Defense: 'DEF',
  'Defense/Special': 'DEF',
  'O&G-Down': 'OG',
  'O&G-Mid': 'OG',
  'O&G-Up': 'OG',
  'Industrial-Chemical': 'IND',
  'Industrial-Semicon': 'IND',
  'Industrial-Other': 'IND',
  'Data Center': 'DC',
  'Other-Winery': 'OTH',
  'Other-REIT': 'OTH',
  Other: 'OTH',
};

export function prefixFor(vertical: string): string {
  return VERTICAL_PREFIX[vertical] ?? 'OTH';
}

/** Next free deal_id for a vertical, e.g. DEF-008. */
export function nextDealId(vertical: string, existing: Deal[]): string {
  const prefix = prefixFor(vertical);
  const used = existing
    .map((d) => {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(d.deal_id);
      return m?.[1] ? Number.parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);

  const next = used.length > 0 ? Math.max(...used) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// ── Portfolio rollup ─────────────────────────────────────────────

export interface PortfolioSnapshot {
  activeCount: number;
  totalCount: number;
  totalMw: number;
  totalUsdM: number;
  atRisk: number;
  stalled: number;
  singleThreaded: number;
  avgHealth: number;
  byBand: Record<HealthBand, number>;
  byStage: Record<string, number>;
  byVertical: Record<string, number>;
}

export function portfolioSnapshot(deals: Deal[]): PortfolioSnapshot {
  const active = deals.filter(
    (d) => !TERMINAL_STAGES.includes(d.stage as DealStage),
  );

  const byBand: Record<HealthBand, number> = { high: 0, mid: 0, low: 0 };
  const byStage: Record<string, number> = {};
  const byVertical: Record<string, number> = {};

  for (const d of deals) {
    byStage[d.stage] = (byStage[d.stage] ?? 0) + 1;
    byVertical[d.vertical] = (byVertical[d.vertical] ?? 0) + 1;
  }
  for (const d of active) byBand[healthBand(d.health_score)]++;

  const totalHealth = active.reduce((s, d) => s + d.health_score, 0);

  return {
    activeCount: active.length,
    totalCount: deals.length,
    totalMw: deals.reduce((s, d) => s + (d.size_mw ?? 0), 0),
    totalUsdM: deals.reduce((s, d) => s + (d.size_usd_m ?? 0), 0),
    atRisk: active.filter(isAtRisk).length,
    stalled: active.filter((d) => isStalled(d)).length,
    singleThreaded: active.filter((d) => !d.multi_threaded).length,
    avgHealth: active.length > 0 ? totalHealth / active.length : 0,
    byBand,
    byStage,
    byVertical,
  };
}

// ── Stage presentation ───────────────────────────────────────────

/**
 * Stage pill styling. Uses semantic tokens, not raw colors — Prospecting is
 * neutral, mid-funnel is informational, late-funnel is warning-toned (a deal
 * in Negotiation is where attention pays), Closed-Won is success.
 */
export function stageClass(stage: string): string {
  switch (stage) {
    case 'Prospecting':
      return 'bg-bg-overlay text-text-dim border-rule';
    case 'Qualified':
    case 'Intro Call':
    case 'Discovery':
      return 'bg-accent-bg text-accent-dim border-accent-border';
    case 'Solution Design':
    case 'Economic Proposal':
      return 'bg-bg-overlay text-text border-rule';
    case 'Negotiation':
    case 'Contracting':
      return 'border-transparent text-warning bg-[rgba(191,143,0,0.12)]';
    case 'Closed-Won':
    case 'Post-Sale':
      return 'border-transparent text-success bg-[rgba(39,133,63,0.12)]';
    case 'Archived':
      return 'bg-bg-overlay text-text-faint border-rule';
    default:
      return 'bg-bg-overlay text-text-dim border-rule';
  }
}

export function stageIndex(stage: string): number {
  const order = [
    'Prospecting', 'Qualified', 'Intro Call', 'Discovery', 'Solution Design',
    'Economic Proposal', 'Negotiation', 'Contracting', 'Closed-Won', 'Post-Sale',
  ];
  const i = order.indexOf(stage);
  return i === -1 ? 99 : i;
}
