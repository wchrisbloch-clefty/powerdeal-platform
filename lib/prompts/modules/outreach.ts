import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import {
  dealBlock,
  signalsBlock,
  marketWatchBlock,
  researchBlock,
  territoryBlock,
  type PromptContext,
} from './shared';

/** Account Outreach Plan — ranked by pain-to-lever fit, never by convenience. */
export function buildOutreachPrompt(ctx: PromptContext): ChatInput {
  const { deal, signals, marketWatch, research } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Build an Account Outreach Plan for this account using the outreach standard in your instructions.

Rank contacts and entry points by PAIN-TO-LEVER FIT — whose pain our lever actually relieves — not by who is easiest to reach. State the ranking basis explicitly for each.

For each target give: the person or role, the pain we relieve, the channel, the touch sequence with spacing, the hook (the specific reason to reply now), and the goal of the sequence (the meeting we are trying to earn, not "awareness").

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

SIGNALS — use these for the hook where they fit:
${signalsBlock(signals)}

MARKET WATCH HITS — live re-engagement angles:
${marketWatchBlock(marketWatch)}

${researchBlock(research)}

If there is no credible hook for a target, say so rather than manufacturing urgency.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 6000,
  };
}
