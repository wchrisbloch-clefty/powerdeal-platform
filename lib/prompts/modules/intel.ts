import { SYSTEM_PROMPT } from '../system';
import type { ChatInput, Deal, Signal } from '@/lib/types';
import {
  dealBlock,
  signalsBlock,
  territoryBlock,
  type PromptContext,
} from './shared';

/**
 * Account & Business Intelligence — the strategic read.
 *
 * Two jobs at once: what this means for the account in front of us, and what
 * it means for the business frame (vertical trends, value-prop performance,
 * moat signals).
 */
export function buildIntelPrompt(ctx: PromptContext): ChatInput {
  const { deal, signals } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Produce a Strategic Read using the Account & Business Intelligence standard in your instructions. Do both jobs:

JOB 1 — ACCOUNT LEVEL: what these signals mean for this specific deal, what changed, and what it forces us to do differently.

JOB 2 — BUSINESS FRAME: what this says about the vertical, how our value prop is performing against the alternatives, and any moat signal (positive or negative) worth carrying to other accounts.

Close with the SO-WHAT: the single action this read demands, and what happens if we don't take it.

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

SIGNALS TO READ:
${signalsBlock(signals, 40)}

Separate what the signals establish from what they merely suggest. Label inference as inference.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 6000,
  };
}

/** Portfolio-wide strategic read — no single account in focus. */
export function buildPortfolioIntelPrompt(
  deals: Deal[],
  signals: Signal[],
  extra?: string,
): ChatInput {
  const roster = deals
    .map(
      (d) =>
        `- ${d.deal_id} · ${d.company} · ${d.vertical} · ${d.stage} · ` +
        `health ${d.health_score} · ${d.days_in_stage}d in stage · ` +
        `${d.multi_threaded ? 'multi-threaded' : 'SINGLE-THREADED'}`,
    )
    .join('\n');

  return {
    system: SYSTEM_PROMPT,
    user: `Produce a portfolio-level Strategic Read across the whole pipeline using the Account & Business Intelligence standard in your instructions.

Cover: where the portfolio is actually strong vs. where it only looks strong, which verticals are converting, how the value props are performing, concentration risk, and the structural problems the stage distribution reveals.

Close with the three moves that most improve the portfolio, ranked.

PIPELINE (${deals.length} accounts):
${roster}

RECENT SIGNALS ACROSS ALL ACCOUNTS:
${signalsBlock(signals, 50)}

Be blunt about weak deals. A pipeline review that flatters the pipeline is worthless.${
      extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${extra}` : ''
    }`,
    maxTokens: 7000,
  };
}
