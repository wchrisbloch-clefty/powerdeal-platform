import { DEAL_STAGES, MEDDPICC_FIELDS, TERMINAL_STAGES } from '@/lib/types';
import type { Deal, DealStage, MeddpiccFieldKey } from '@/lib/types';
import { meddpiccState } from '@/lib/deals';
import { fromMeddpicc, type GapKind } from './gaps';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH ABSENT FIELD MATTERS MOST, HERE, NOW.
 * ═══════════════════════════════════════════════════════════════
 *
 * Health already carries the recommendation: it caps at 6 for single-threading
 * and again for no critical event, and that mechanism works. What was missing
 * is ORDERING — a card showing eight gaps at equal weight tells the reader what
 * they have not done. It does not tell them what to do next.
 *
 * Champion on a Prospecting deal outranks paper process. At Negotiation the
 * reverse is true. Nothing in the product knew that.
 *
 * ══ ORDERED LISTS, NOT WEIGHTS ══
 *
 * ⚠️ A weight of 0.7 against 0.6 is a fabricated number wearing a decimal
 * point. Nobody can check it, nobody chose the gap between them, and the first
 * thing anyone does with a weighted list is tune the weights until the output
 * matches what they already believed.
 *
 * An ORDER is an editorial judgement stated in the open. A reader can disagree
 * with "champion before paper process at Prospecting" — which is the point,
 * because that is a claim about selling and it should be arguable.
 *
 * ══ IT NEVER INVENTS WORK ══
 *
 * When the fields that matter at this stage are all filled, this returns
 * NOTHING. It does not fall through to a lower-priority field to keep a slot
 * populated. A deal with no outstanding gap at its stage says so — the same
 * non-gating logic inverted: never manufacture a next move to fill a space in a
 * layout.
 *
 * PURE. No fetch, no clock.
 */

/**
 * The order each stage cares about, most consequential first.
 *
 * ⚠️ KEYED BY NAME, NEVER BY POSITION IN `DEAL_STAGES`. `Archived` is last in
 * that array and a linear weight over it has scored a dead deal as the most
 * advanced one three separate times in this build. A `Record` keyed by the
 * stage name cannot do that, and TypeScript fails the build if a stage is
 * added without a list.
 *
 * A list may be SHORTER than the eight fields. Anything omitted is not a gap
 * worth raising at that stage, which is a judgement too — the early stages
 * genuinely do not care about the paper process, and listing it there to be
 * complete would be the eight-at-equal-weight problem again with an order on
 * top.
 */
export const STAGE_PRIORITY: Record<DealStage, readonly MeddpiccFieldKey[]> = {
  // Nothing matters before there is a person. Pain qualifies whether to spend
  // any more time at all.
  Prospecting: ['champion', 'identified_pain'],
  // A named signer is what separates a qualified deal from an interested one.
  Qualified: ['economic_buyer', 'champion', 'identified_pain'],
  // The call is where pain gets specific and the metric gets owned.
  'Intro Call': ['identified_pain', 'metrics_known', 'champion'],
  // Discovery's whole job.
  Discovery: ['metrics_known', 'decision_criteria', 'economic_buyer', 'identified_pain'],
  // You cannot design to criteria nobody has stated.
  'Solution Design': ['decision_criteria', 'competition', 'metrics_known'],
  // A proposal without a named signer and a known alternative is a quote.
  'Economic Proposal': ['economic_buyer', 'competition', 'metrics_known'],
  // Late-stage loss is procedural. This is where paper process outranks
  // everything that mattered at the top of the funnel.
  Negotiation: ['decision_process', 'decision_mapped', 'economic_buyer', 'competition'],
  // Signature path and legal are the whole remaining risk.
  Contracting: ['decision_mapped', 'decision_process'],
  /**
   * ⚠️ TERMINAL STAGES CARRY NO PRIORITIES, AND THE EMPTY LIST IS THE POINT.
   * There is no next move on a closed deal, and a system that produced one
   * would be inventing work — the same failure as filling an empty slot.
   *
   * ⚠️ AND THE RECORD CAUGHT ME INVENTING A STAGE. The first version of this
   * table listed 'Closed-Lost' and omitted 'Contracting'. Neither is what this
   * platform's ladder says, and a lookup with a default would have silently
   * given Contracting deals an empty priority list — a real stage with no next
   * move, indistinguishable from a closed one. `Record<DealStage, …>` made it
   * a type error instead.
   */
  'Closed-Won': [],
  'Post-Sale': [],
  Archived: [],
};

export interface NextGap {
  field: MeddpiccFieldKey;
  label: string;
  /** The one-line prompt that fills it, from MEDDPICC_FIELDS. */
  hint: string;
  kind: GapKind;
}

/**
 * The one or two absent fields worth raising on this deal, at this stage.
 *
 * `verifiedEmpty` is the operator's own record of fields they have checked and
 * found genuinely empty. It changes the KIND reported — `missing` rather than
 * `unchecked` — and deliberately does NOT remove the field from this list: a
 * confirmed-absent economic buyer at Negotiation is still the most important
 * thing about that deal.
 */
export function nextGaps(
  deal: Pick<Deal, 'stage'> & Partial<Deal>,
  competitorCount?: number | null,
  limit = 2,
): NextGap[] {
  const priorities = STAGE_PRIORITY[deal.stage as DealStage];
  // An unrecognised stage is a gap in the data, not a licence to guess an
  // order. Nothing is raised rather than raising the wrong thing.
  if (!priorities) return [];

  const out: NextGap[] = [];
  for (const key of priorities) {
    if (out.length >= limit) break;
    const state = meddpiccState(deal as Deal, key, competitorCount);
    const kind = resolveKind(state, key, deal.verified_empty);
    if (kind === 'recorded') continue;
    const spec = MEDDPICC_FIELDS.find((f) => f.key === key)!;
    out.push({ field: key, label: spec.label, hint: spec.hint, kind });
  }
  return out;
}

/**
 * A field's gap kind, with the operator's own record taken into account.
 *
 * ⚠️ THIS IS THE WHOLE POINT OF THE MARKER. Without it the kind is inferred
 * from the COLUMN TYPE — a null text field reads `unchecked`, a false boolean
 * reads `missing` — and "not checked" on twenty-one deals is a false statement
 * about whether anyone looked.
 *
 * A recorded VALUE always wins over the marker. A stale marker on a field that
 * has since been filled is ignored rather than cleared: a read that writes is
 * the silent-write risk this build spent two weeks removing, and this is
 * exactly where that convenience would be natural.
 */
export function resolveKind(
  state: ReturnType<typeof meddpiccState>,
  field: string,
  verifiedEmpty?: string[] | null,
): GapKind {
  const kind = fromMeddpicc(state);
  if (kind === 'recorded') return 'recorded';
  if (verifiedEmpty?.includes(field)) return 'missing';
  return kind;
}

/** Convenience for a whole deal: the kind of every MEDDPICC field. */
export function gapKinds(
  deal: Deal,
  competitorCount?: number | null,
): Record<MeddpiccFieldKey, GapKind> {
  const out = {} as Record<MeddpiccFieldKey, GapKind>;
  for (const f of MEDDPICC_FIELDS) {
    out[f.key] = resolveKind(
      meddpiccState(deal, f.key, competitorCount),
      f.key,
      deal.verified_empty,
    );
  }
  return out;
}

/**
 * What the surface says when a deal has no outstanding gap at its stage.
 *
 * Said plainly rather than left blank. "Nothing outstanding" is information;
 * an empty space is an unanswered question about whether anything was checked.
 */
export function noGapMessage(stage: string): string {
  if ((TERMINAL_STAGES as readonly string[]).includes(stage)) {
    return `${stage} — no next move. Nothing is outstanding because nothing is in flight.`;
  }
  if (!DEAL_STAGES.includes(stage as DealStage)) {
    return `Stage "${stage}" is not one this platform knows, so no priority order applies to it.`;
  }
  return `Nothing outstanding at ${stage}. Every field that matters at this stage is recorded.`;
}
