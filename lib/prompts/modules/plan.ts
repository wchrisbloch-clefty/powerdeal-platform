import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import {
  dealBlock,
  signalsBlock,
  marketWatchBlock,
  territoryBlock,
  getAudienceContext,
  type PromptContext,
} from './shared';

/** Account Plan Summary — the deep playbook, full methodology. */
export function buildPlanPrompt(ctx: PromptContext): ChatInput {
  const { deal, signals, marketWatch, audiencePersona } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Build the full Account Plan Summary for this account using the Account Plan standard in your instructions. Work every section the standard defines — company profile, facilities rollup, decision-process module, value-prop diagnosis, land-and-expand path, risks, and the sequenced plan.
${getAudienceContext(audiencePersona)}
ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

SIGNALS ON FILE:
${signalsBlock(signals, 40)}

MARKET WATCH HITS:
${marketWatchBlock(marketWatch, 20)}

This is the working playbook, not a pitch. Where the record is thin, say what is unknown and what closes it — do not invent site counts, load figures, or timelines.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 12000,
  };
}
