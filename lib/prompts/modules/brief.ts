import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import {
  dealBlock,
  signalsBlock,
  marketWatchBlock,
  researchBlock,
  territoryBlock,
  getAudienceContext,
  type PromptContext,
} from './shared';

/** Executive Account Brief — the Account Brief standard from the methodology. */
export function buildBriefPrompt(ctx: PromptContext): ChatInput {
  const { deal, signals, marketWatch, research, audiencePersona } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Generate an Executive Account Brief for the following account using the Account Brief standard defined in your instructions. Include every section that standard specifies, in its order. Format for executive readability — thesis first, then support.
${getAudienceContext(audiencePersona)}
ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

RECENT SIGNALS:
${signalsBlock(signals)}

MARKET WATCH HITS ON THIS ACCOUNT:
${marketWatchBlock(marketWatch)}

${researchBlock(research)}

Where the record has a gap, name it as a gap and state the question that closes it. Do not fill gaps with assumed figures.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 8000,
  };
}
