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
 * BUSINESS CASE — written for the champion's reader, not for us.
 *
 * The gap this closes: every other artifact PowerDeal produces is written for
 * the seller. None are written for the champion to carry into a room the seller
 * is not in. Complex deals stall because the buyer lacks the internal tools to
 * build consensus, not because the product does not fit.
 *
 * So the audience is the champion's finance or procurement reader. That reader
 * has never met us, is not excited about fuel cells, and is looking for a
 * reason to say no. Vendor language is the fastest way to give them one.
 *
 * Generates with whatever exists. A missing economics scenario produces a named
 * gap in the document, never a refusal and never an illustrative number.
 */
export function buildBusinessCasePrompt(ctx: PromptContext): ChatInput {
  const { deal, economics, signals } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Write a business case for ${deal.company} that our champion can circulate internally.

AUDIENCE: the champion's finance or procurement reader. Not the champion, and
not us. That reader has never spoken to us, has no stake in this succeeding,
and is scanning for a reason to decline. Write in their language.

STRUCTURE — these six sections, in this order, no others:
1. The problem in their terms — current cost trajectory, reliability exposure,
   the constraint they already feel. Not our capability.
2. The proposal. One paragraph.
3. The economics.
4. The incentive stack, itemized. Never a single lumped figure — eligibility
   varies and a rolled-up number is what collapses under diligence. Reproduce
   every condition attached to a line item, including any REC fuel pathway.
5. Risk and mitigation. Name the real risks. A business case with no risks
   section reads as marketing and gets treated as marketing.
6. What we need, and by when.

RULES:
- Under two pages. This gets read in a meeting, not studied.
- Every number traceable to a scenario below or to a cited source. If a figure
  is not in the record, it does not appear in the document.
- No vendor language. No superlatives. No "industry-leading", no "transformative",
  no "partner" as a verb. Plain declarative sentences.
- Where the record has a gap, name the gap and state what would close it. Do not
  fill gaps with assumed figures.

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

${economicsBlock(economics)}

RECENT SIGNALS:
${signalsBlock(signals)}
${ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''}`,
    maxTokens: 6000,
  };
}
