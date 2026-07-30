import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import {
  dealBlock,
  signalsBlock,
  territoryBlock,
  type PromptContext,
} from './shared';

/** Qualification Gate — PURSUE / CONDITIONAL / NO-GO with a MEDDPICC scorecard. */
export function buildQualifyPrompt(ctx: PromptContext): ChatInput {
  const { deal, signals } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Run the Qualification Gate on this account using the standard in your instructions.

Return, in this order:
1. VERDICT — exactly one of PURSUE / CONDITIONAL / NO-GO, with the one-sentence reason.
2. MEDDPICC SCORECARD — all 8 pillars, each marked KNOWN / GAP / UNKNOWN with the evidence or the missing question. End with the score out of 8.
3. DEAL-KILLERS — what would make this unwinnable, and whether each is already true.
4. NEXT 3 MOVES — specific, owner-assigned, with the trigger for each.

If the verdict is CONDITIONAL, state the exact condition that flips it to PURSUE.

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

SIGNALS ON FILE:
${signalsBlock(signals)}

Score against what is actually evidenced in the record. An unnamed economic buyer is a gap, not an inference.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 5000,
  };
}
