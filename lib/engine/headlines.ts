import { DEAL_STAGES, TERMINAL_STAGES, type Deal, type DealStage, type FeedItem, type SourceTier } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * HEADLINES — what to read first, and why.
 * ═══════════════════════════════════════════════════════════════
 *
 * Every ingredient already existed and none of them were joined. `deal_ids` is
 * written on every swept item. Trending computes account impact. The outreach
 * hook is on the row. What was missing was the one question a BD rep actually
 * opens a feed to answer: of these sixty items, which three matter to MY
 * pipeline this morning?
 *
 * ══ THE SCORE IS EXPLAINED, NOT ASSERTED ══
 *
 * Every headline carries `reasons` — the specific clauses that lifted it, in
 * the order they contributed. A ranking a reader cannot audit is a ranking
 * they either trust blindly or ignore entirely, and both are worse than a
 * reverse-chronological list they understand.
 *
 * The score is an ORDERING DEVICE, never a claim about the world. It is not
 * displayed as a number, a percentage, or a confidence. It has no units.
 *
 * ══ NOTHING IS FABRICATED AND NOTHING IS INVENTED TO FILL A GAP ══
 *
 * A deal with no `size_usd_m` contributes no size term — it does not get an
 * assumed one. An item with no matched account is ranked on what it has and
 * says so. Absence is reported in `gaps` and never defaulted.
 *
 * ══ NOTHING GATES ══
 *
 * `rankHeadlines` takes an empty item list and an empty deal list and returns
 * an empty array. It never throws, never requires trending to have run, and
 * never requires a summary to exist. The caller renders the real state.
 *
 * PURE. No fetch, no database, no clock of its own — `now` is a parameter so
 * the recency term is testable rather than untestable-by-construction.
 */

export interface HeadlineAccount {
  dealId: string;
  company: string;
  stage: string;
  /** Null when the deal carries no size. NEVER defaulted to a number. */
  sizeUsdM: number | null;
}

export interface Headline {
  item: FeedItem;
  /**
   * Ordering only. Unitless, never rendered as a figure, never compared across
   * two different runs — the recency term makes it time-relative by design.
   */
  score: number;
  /** Why it ranked here, most significant first. Rendered verbatim. */
  reasons: string[];
  /** Pipeline accounts this item touches, resolved from `deal_ids`. */
  accounts: HeadlineAccount[];
  /** The outreach hook already computed at sweep time. Null is normal. */
  hook: string | null;
  /**
   * What this item does NOT have, named rather than silently absent. The rule
   * across this build: flag the gap inside the output, never refuse to produce
   * the output and never invent a value.
   */
  gaps: string[];
}

const TIER_POINTS: Record<SourceTier, number> = {
  verified: 12,
  reported: 5,
  inferred: 0,
};

/**
 * A headline about a deal one step from signature outranks the same headline
 * about a deal nobody has qualified yet.
 *
 * ⚠️ `Archived` IS THE LAST ELEMENT OF DEAL_STAGES AND IS NOT THE FURTHEST
 * ALONG. A naive linear weight across the array ranks a headline about an
 * archived account above one about a deal in Negotiation, because the ladder
 * ends with outcomes rather than progress: Closed-Won, Post-Sale, Archived.
 *
 * So progression is measured across the IN-FLIGHT stages only. Terminal
 * stages get a small fixed weight instead of a position — a headline about a
 * closed account is still worth reading (expansion, reference risk, a peer
 * watching) but it is not a deal one step from signature.
 *
 * Derived from DEAL_STAGES rather than a second hand-maintained list, so a
 * renamed stage cannot leave a stale copy here.
 */
const IN_FLIGHT_STAGES = DEAL_STAGES.filter(
  (s) => !TERMINAL_STAGES.includes(s),
);

/** Terminal deals still rank, at roughly a mid-ladder weight. Never top. */
const TERMINAL_STAGE_WEIGHT = 3;

function stageWeight(stage: string): number {
  if (TERMINAL_STAGES.includes(stage as DealStage)) return TERMINAL_STAGE_WEIGHT;
  const index = IN_FLIGHT_STAGES.indexOf(stage as (typeof IN_FLIGHT_STAGES)[number]);
  if (index < 0) return 0;
  // Deliberately gentle: stage should break ties between items that both hit
  // accounts, not outrank hitting an account at all.
  return Math.round((index / Math.max(1, IN_FLIGHT_STAGES.length - 1)) * 10);
}

/** Half-life decay in days. A week-old item ranks well below this morning's. */
const RECENCY_HALF_LIFE_DAYS = 3;

function recencyPoints(item: FeedItem, now: number): number {
  const stamp = item.published_at ?? item.cached_at;
  const parsed = Date.parse(stamp ?? '');
  // An unparseable date scores ZERO rather than "now". Treating an unknown
  // date as the present would float every malformed row to the top — the
  // benign-looking default that becomes the loudest bug.
  if (!Number.isFinite(parsed)) return 0;
  const ageDays = Math.max(0, (now - parsed) / 86_400_000);
  return Math.round(20 * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
}

export interface RankOptions {
  limit?: number;
  /**
   * Include items that touch no pipeline account. Default true: an item about
   * a utility rate case matters even before it is mapped to a deal, and
   * filtering it out would make the view quietly narrower than the feed.
   */
  includeUnmapped?: boolean;
}

export function rankHeadlines(
  items: FeedItem[],
  deals: Deal[],
  now: number = Date.now(),
  options: RankOptions = {},
): Headline[] {
  const { limit = 12, includeUnmapped = true } = options;
  const byId = new Map(deals.map((d) => [d.id, d]));

  const scored: Headline[] = [];

  for (const item of items) {
    const accounts: HeadlineAccount[] = [];
    for (const id of item.deal_ids ?? []) {
      const deal = byId.get(id);
      // A deal_id pointing at a deal that no longer exists is dropped, not
      // rendered as a blank account chip. Counted in `gaps` below.
      if (deal) {
        accounts.push({
          dealId: deal.id,
          company: deal.company,
          stage: String(deal.stage),
          sizeUsdM: deal.size_usd_m,
        });
      }
    }

    if (!includeUnmapped && accounts.length === 0) continue;

    const reasons: string[] = [];
    const gaps: string[] = [];
    let score = 0;

    // ── Account impact. The dominant term, because it is the question. ──
    if (accounts.length > 0) {
      const points = 30 + (accounts.length - 1) * 15;
      score += points;
      reasons.push(
        accounts.length === 1
          ? `Touches ${accounts[0].company}`
          : `Touches ${accounts.length} accounts: ${accounts.map((a) => a.company).join(', ')}`,
      );

      const furthest = accounts.reduce(
        (best, a) => (stageWeight(a.stage) > stageWeight(best.stage) ? a : best),
        accounts[0],
      );
      const sw = stageWeight(furthest.stage);
      if (sw > 0) {
        score += sw;
        reasons.push(`${furthest.company} is at ${furthest.stage}`);
      }

      // Size is a TIEBREAK and only when the number is real.
      const sized = accounts.filter((a) => a.sizeUsdM != null);
      if (sized.length > 0) {
        const largest = Math.max(...sized.map((a) => a.sizeUsdM!));
        score += Math.min(10, Math.round(largest / 10));
        reasons.push(`$${largest}M largest exposure`);
      } else {
        gaps.push('No deal size on the matched accounts — size did not affect this ranking.');
      }
    }

    const orphaned = (item.deal_ids?.length ?? 0) - accounts.length;
    if (orphaned > 0) {
      gaps.push(
        `${orphaned} mapped deal ID${orphaned === 1 ? '' : 's'} no longer resolve to a deal.`,
      );
    }

    // ── Provenance. A verified source outranks an inferred one. ──
    const tierPoints = TIER_POINTS[item.tier] ?? 0;
    if (tierPoints > 0) {
      score += tierPoints;
      reasons.push(item.tier === 'verified' ? 'Verified source' : 'Reported');
    }

    if (item.breaking) {
      score += 15;
      reasons.push('Breaking');
    }

    const recency = recencyPoints(item, now);
    score += recency;
    if (recency >= 10) reasons.push('Published in the last two days');
    if (!item.published_at && !item.cached_at) {
      gaps.push('No date on this item — recency did not affect its ranking.');
    }

    // ── The hook. Already computed at sweep time; never regenerated here. ──
    const hook = item.action;
    if (hook) {
      score += 8;
      reasons.push('Has an outreach hook');
    }

    // A missing summary is a GAP, not a disqualification. The item is the
    // artifact; the summary is an enhancement. It must still be rankable.
    if (!item.synthesis) {
      gaps.push('No summary — the item ranks on its headline, source and mapping.');
    }

    scored.push({ item, score, reasons, accounts, hook, gaps });
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Deterministic tiebreak. Two items with the same score must not reorder
      // between renders — a list that shuffles on refresh reads as broken.
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit);
}

/**
 * The one-line answer to "what happened overnight".
 *
 * Returns null when there is nothing to say, so the caller renders the real
 * empty state rather than a sentence built around zero.
 */
export function headlineSummary(headlines: Headline[]): string | null {
  if (headlines.length === 0) return null;

  const withAccounts = headlines.filter((h) => h.accounts.length > 0);
  const companies = [...new Set(withAccounts.flatMap((h) => h.accounts.map((a) => a.company)))];

  if (companies.length === 0) {
    return `${headlines.length} item${headlines.length === 1 ? '' : 's'} ranked — none mapped to a pipeline account.`;
  }

  const named = companies.slice(0, 3).join(', ');
  const rest = companies.length - Math.min(3, companies.length);
  return (
    `${withAccounts.length} of ${headlines.length} touch the pipeline — ` +
    `${named}${rest > 0 ? ` and ${rest} more` : ''}.`
  );
}
