import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import {
  dealBlock,
  economicsBlock,
  signalsBlock,
  territoryBlock,
  type PromptContext,
} from './shared';

/**
 * COMPETITIVE CARDS — no-decision (3.3) and pricing defense (3.4).
 *
 * Both carry numbers and both are built to go in front of a customer, so two
 * separate requirements hold at once and neither substitutes for the other:
 *
 *   NEVER FABRICATE — a figure that is not in the record does not appear.
 *   TAG EVERY SOURCE — a figure that IS in the record appears with its tier.
 *
 * A blank field naming what it needs is acceptable. A populated field with a
 * cited source is acceptable. An UNTAGGED NUMBER IS NOT — it renders exactly as
 * authoritative as a sourced one, and four rounds of Williams MAPs proved how
 * convincingly fixture data presents.
 *
 * No hard gates. A card built on a sparse record generates and names what is
 * missing. "Cost of delay: not yet quantified — needs annual energy spend and
 * outage cost" is a discovery checklist naming exactly what to go ask for, and
 * that is the intended output rather than a degraded one.
 *
 * The negative header is NOT requested here. It is prepended in code by
 * assembleCard() so no prompt change and no model behaviour can remove it.
 */

const PROVENANCE_RULES = `SOURCE TAGGING — MANDATORY, NO EXCEPTIONS.

Every figure in this card carries its provenance inline, using the same tiering
as the intelligence feed:

  [VERIFIED] primary source — a tariff sheet, a filing, an EIA series, a signed
             quote, a meter reading
  [REPORTED] credible secondary — trade press, an analyst figure, a number the
             buyer told us
  [INFERRED] our estimate, an interpolation, or a scenario output

Format: the number, then the tier, then where it came from.
  "9.4c/kWh [VERIFIED — OG&E tariff sheet, retrieved 2026-07-14]"
  "roughly 18 months to interconnect [INFERRED — from the Economics scenario
   'Williams base case', not a utility commitment]"

TWO SEPARATE RULES, BOTH BINDING:

1. NEVER FABRICATE. If a figure is not in the record below, do not state it.
   Not as an illustration, not as a typical value, not as a range, not with a
   hedge. Write the gap instead, naming the specific input that would close it:
     "Cost of delay: not yet quantified — needs annual energy spend and the
      cost of an outage hour."
   That is a discovery checklist. It is the intended output.

2. TAG EVERY SOURCE. A figure that IS in the record still needs its tier. An
   untagged number renders exactly as authoritative as a sourced one, and the
   reader cannot tell a scenario output from a tariff sheet.

If you cannot tag it, you cannot state it. There is no third option.`;

/**
 * 3.3 — the no-decision card.
 *
 * Do-nothing is live on every deal whether or not any competitor is recorded.
 * It is the thing you lose to when nobody selects anything, which makes this
 * the baseline card rather than one posture among several.
 */
export function buildNoDecisionCardPrompt(
  ctx: PromptContext & { criticalEvent?: string | null; criticalEventDate?: string | null },
): ChatInput {
  const { deal, economics, signals } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Write the no-decision card for ${deal.company}.

The competitor here is the status quo. It is live on every deal whether or not
anyone has named it, and it is what you lose to when nobody selects anything.

WHAT THIS CARD HAS TO DO: make doing nothing legible as a decision with a
price, on a schedule. A flat comparison hides that the status quo escalates.

STRUCTURE — these sections, in this order:
1. What doing nothing costs today, and what it costs in three and five years.
   Use the grid escalation from the economics scenario if one exists. If not,
   say what is needed to compute it.
2. The forcing function — what makes the cost land on a date rather than
   drifting. ${
     ctx.criticalEvent?.trim()
       ? `This deal has one on record: "${ctx.criticalEvent}"${ctx.criticalEventDate ? ` (${ctx.criticalEventDate})` : ' (no date on record)'}. Work from it.`
       : 'This deal has NO critical event on record. Say so plainly and name what would establish one — that absence is the single strongest predictor of the loss this card exists to prevent, and hiding it would defeat the card.'
   }
3. What changes if they wait — queue position, rate case timing, equipment lead
   time, incentive expiry. Only what is in the record.
4. The question to leave them with. One sentence, answerable by them, that makes
   the cost of waiting their number rather than ours.

${PROVENANCE_RULES}

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

${economicsBlock(economics)}

RECENT SIGNALS:
${signalsBlock(signals)}
${ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''}`,
    maxTokens: 5000,
  };
}

/**
 * 3.4 — the pricing defense card, against ONE named posture.
 *
 * The posture is an input, never inferred. The argument against a utility rate
 * and the argument against a bundled integrator offer are different documents,
 * and a card that guessed which one it was writing would be wrong half the time
 * with nothing on the page saying so.
 */
export function buildPricingDefenseCardPrompt(
  ctx: PromptContext & {
    posture: { competitor: string; tier: string; posture?: string | null; whatWasSaid?: string | null; whatLanded?: string | null };
  },
): ChatInput {
  const { deal, economics, signals, posture } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Write the pricing defense card for ${deal.company}, against ONE competitor: ${posture.competitor}.

This card is not a general price defense. It answers the specific argument this
competitor makes in this deal, for the reader who will hear it.

THE COMPETITOR:
  Name    : ${posture.competitor}
  Tier    : ${posture.tier}
  Our posture     : ${posture.posture?.trim() || 'not recorded — say so and name what would establish it'}
  What they said  : ${posture.whatWasSaid?.trim() || 'nothing on record'}
  What landed     : ${posture.whatLanded?.trim() || 'nothing on record'}

WHAT THIS CARD HAS TO DO: move the conversation from the price of equipment to
the cost of failure. Not by defending the number — by making the comparison
whole.

STRUCTURE:
1. The argument as they make it. In their words where the record has them; the
   honest version otherwise. Do not soften it — a defense written against a
   weakened version of the attack does not work in the room.
2. What the headline comparison leaves out for THIS competitor specifically.
   Redundancy overbuild, service interval and downtime, temperature derate,
   permitting timeline, stranded-asset risk — whichever apply here. Not all of
   them; the ones that bear on this opponent.
3. The like-for-like number, if the record supports one. If not, name exactly
   what is needed to build it.
4. What we concede. Every card gets one. A defense with no concession reads as
   marketing and is discounted whole.

${PROVENANCE_RULES}

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

${economicsBlock(economics)}

RECENT SIGNALS:
${signalsBlock(signals)}
${ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''}`,
    maxTokens: 5000,
  };
}
