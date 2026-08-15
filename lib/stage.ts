import { DEAL_STAGES, TERMINAL_STAGES, type Deal, type DealStage } from '@/lib/types';

/**
 * STAGE MOVEMENT.
 *
 * Nothing in the application ever changed a deal's stage. `PATCH /api/deals/[id]`
 * accepted one and no component called it, so four shipped features ran on a
 * field frozen at creation: stage momentum (15% of deal health), the stalled-30
 * and stalled-60 risk flags, `isAtRisk`, and every "days in stage" reading —
 * which really meant "days since it was created", a different claim that agreed
 * with the label only until the first advance that never came.
 *
 * The SERVER SIDE was already finished. `deals_stage_transition` fires before
 * update, writes the `stage_transitions` row and resets `days_in_stage`, so a
 * plain UPDATE on `deals.stage` is the whole mechanism. Anything here that
 * inserted a transition directly would double-write.
 *
 * This module is the rules, and it is PURE — the control renders them, the
 * route enforces them, and the tests exercise them, which is only safe if all
 * three read the same implementation.
 */

export function isTerminal(stage: DealStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/** Position in the pipeline. -1 for a stage that is not in the ladder. */
export function stageIndex(stage: DealStage): number {
  return DEAL_STAGES.indexOf(stage);
}

export type MoveDirection = 'forward' | 'backward' | 'lateral' | 'terminal' | 'reopen';

/**
 * ⚠️ `Archived` IS THE LAST ELEMENT OF `DEAL_STAGES` AND IS NOT THE FURTHEST
 * ALONG. Any comparison that reads the array positionally inherits that.
 *
 * The ladder ends in OUTCOMES, not progress: Closed-Won, Post-Sale, Archived.
 * A raw index comparison reported `Discovery → Archived` as **forward** —
 * losing a deal scored as advancing it — and the same array shape produced a
 * separate live bug in the headline ranker, where a linear weight ranked
 * headlines about archived accounts above ones in Negotiation.
 *
 * So a move INTO `Archived` is `terminal` and a move OUT of it is `reopen`,
 * neither of which is a position on the ladder. `Closed-Won` and `Post-Sale`
 * keep their positions: those are genuinely later, and a deal does progress
 * from one to the other.
 *
 * The rule, generally: **never compare `DEAL_STAGES` indices without first
 * deciding what a terminal state means in that comparison.** See
 * `IN_FLIGHT_STAGES` in lib/engine/headlines.ts for the same decision made for
 * ranking, and tests/stage.test.ts for the assertion that holds both.
 */
export function directionOf(from: DealStage, to: DealStage): MoveDirection {
  if (to === 'Archived' && from !== 'Archived') return 'terminal';
  if (from === 'Archived' && to !== 'Archived') return 'reopen';

  const a = stageIndex(from);
  const b = stageIndex(to);
  if (a === b) return 'lateral';
  return b > a ? 'forward' : 'backward';
}

export interface MoveConsequence {
  key: 'days-reset' | 'backward' | 'reopen' | 'terminal' | 'closes-deal';
  text: string;
  severity: 'info' | 'warn';
}

export interface MoveVerdict {
  allowed: boolean;
  direction: MoveDirection;
  /** Stated BEFORE the write, never discovered afterwards. */
  consequences: MoveConsequence[];
  /** Set only when allowed is false. */
  blockedReason?: string;
}

/**
 * What moving this deal would do, stated before it happens.
 *
 * Three decisions are encoded here, and all three were open questions in
 * BACKLOG item 1.
 *
 * BACKWARD MOVEMENT IS ALLOWED. Deals genuinely regress — a champion leaves, a
 * budget is pulled, discovery reopens — and a ladder that only went up would
 * force the record to lie about it, which is worse than the regression. It is
 * not silent: the trigger writes a transition row either way, so a reversal is
 * as legible in the history as an advance.
 *
 * POST-SALE DOES NOT FOLLOW CLOSED-WON AUTOMATICALLY. An automatic advance
 * writes a stage transition nobody decided, and the history is the one place
 * that has to be a record of decisions rather than of defaults.
 *
 * REOPENING A CLOSED DEAL IS ALLOWED AND FLAGGED. `log_win_loss()` wrote a
 * `win_loss_log` row on the way in; moving back out leaves that row describing
 * a deal that is live again. The move is still the right one to permit — deals
 * do come back — but the inconsistency is named at the point of the click
 * rather than found later in a report.
 */
export function evaluateMove(deal: Pick<Deal, 'stage' | 'days_in_stage'>, to: DealStage): MoveVerdict {
  const from = deal.stage as DealStage;
  const direction = directionOf(from, to);

  if (from === to) {
    return {
      allowed: false,
      direction,
      consequences: [],
      blockedReason: `Already in ${to}.`,
    };
  }

  if (stageIndex(to) < 0) {
    return {
      allowed: false,
      direction,
      consequences: [],
      blockedReason: `${to} is not a stage in this pipeline.`,
    };
  }

  const consequences: MoveConsequence[] = [];

  // The reason this control exists. Said out loud because the number it fixes
  // has been quietly wrong on every deal in the book.
  consequences.push({
    key: 'days-reset',
    severity: 'info',
    text:
      deal.days_in_stage > 0
        ? `Days in stage resets from ${deal.days_in_stage} to 0, and a transition row records the ${deal.days_in_stage} days spent in ${from}.`
        : `A transition row records the move out of ${from}.`,
  });

  if (direction === 'backward') {
    consequences.push({
      key: 'backward',
      severity: 'warn',
      text: `This moves the deal back from ${from} to ${to}. That is allowed — deals do regress — and the history will show it as a reversal rather than hiding it.`,
    });
  }

  if (isTerminal(from) && !isTerminal(to)) {
    consequences.push({
      key: 'reopen',
      severity: 'warn',
      text: `${from} is a closed stage. Reopening leaves any logged outcome on record describing a deal that is live again — the win-loss entry is not retracted by this move, and nothing else will point that out.`,
    });
  }

  if (!isTerminal(from) && isTerminal(to)) {
    consequences.push({
      key: 'terminal',
      severity: 'warn',
      text:
        to === 'Archived'
          ? 'Archived is a closed stage, and it collapses no-decision, competitive loss and disqualified into one. Use Log outcome instead if you want the reason on record.'
          : `${to} is a closed stage. This does not write a win-loss entry — use Log outcome for that.`,
    });
  }

  return { allowed: true, direction, consequences };
}

/**
 * The stages offered next, ordered so the likely one is first.
 *
 * The immediate next stage leads, because advancing one step is what happens
 * on almost every move. Everything else stays reachable — a deal that skips
 * Intro Call is a normal deal, not an error to design against.
 */
export function stageOptions(current: DealStage): DealStage[] {
  const i = stageIndex(current);
  const rest = DEAL_STAGES.filter((s) => s !== current);
  const next = DEAL_STAGES[i + 1];

  // ⚠️ `Post-Sale` USED TO LEAD WITH `Archived`, because Archived is the array
  // element after it. v3.1.11 says this in so many words: "Never treat
  // `Archived` as something a deal progresses into from `Post-Sale`." It is a
  // terminal state entered by logging an outcome, from any stage — not the
  // eleventh rung. It stays REACHABLE in `rest`; it is simply never the
  // suggested next move.
  if (!next || next === 'Archived') return rest;
  return [next, ...rest.filter((s) => s !== next)];
}
