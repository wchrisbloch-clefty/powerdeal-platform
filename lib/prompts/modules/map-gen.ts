import { SYSTEM_PROMPT } from '../system';
import type { ChatInput } from '@/lib/types';
import { dealBlock, territoryBlock, type PromptContext } from './shared';

/** Mutual Action Plan — 5-phase flow, owner-coded, Critical Event flagged. */
export function buildMapPrompt(ctx: PromptContext): ChatInput {
  const { deal } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Build a Mutual Action Plan for this account using the MAP standard in your instructions.

Structure it across the five phases:
1. Open & Protect
2. Site Technicals
3. Technoeconomic Review
4. Internal Validation
5. Contracting

For every step give: the step, the owner (coded as ours / theirs / joint), the entry condition, and the exit condition that proves it is done. Flag the Critical Event and work the dates backward from it. Mark any step that depends on a named person we have not yet identified.

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

Current stage is ${deal.stage} — start the MAP from where the deal actually is, not from the top.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 7000,
  };
}
