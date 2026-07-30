import { SYSTEM_PROMPT } from '../system';
import type { ChatInput, Deal } from '@/lib/types';
import { dealBlock, getAudienceContext } from './shared';

export interface PersuadeContext {
  /** The draft the user submitted — email, deck narrative, one-pager. */
  content: string;
  deal?: Deal;
  audiencePersona?: string;
}

/** Persuasion Enhancer — Challenger + Gap + Voss stack on submitted content. */
export function buildPersuadePrompt(ctx: PersuadeContext): ChatInput {
  return {
    system: SYSTEM_PROMPT,
    user: `Strengthen the submitted content using the persuasion standard in your instructions — the Challenger, Gap, and Voss stack.

Return:
1. THESIS CHECK — is the thesis in the first two sentences? If not, say what it should be.
2. REWRITE — the improved version, ready to send. Keep the author's voice; do not inflate.
3. WHAT CHANGED — the specific moves you made and the lever each pulls.
4. OBJECTION PRE-EMPTION — the two objections this will draw and how the rewrite already answers them.
5. THE ASK — the single explicit next step this piece is driving to. If the original had no ask, say so.
${getAudienceContext(ctx.audiencePersona)}${
      ctx.deal
        ? `\nACCOUNT CONTEXT:\n${dealBlock(ctx.deal)}\n`
        : ''
    }
SUBMITTED CONTENT:
"""
${ctx.content}
"""

Do not introduce a claim, figure, or reference the original did not have. Persuasion is ordering and framing, not new facts.`,
    maxTokens: 6000,
  };
}
