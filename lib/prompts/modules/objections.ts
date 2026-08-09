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
 * OBJECTION SCRIPTS — for the champion, not for us.
 *
 * These are explicitly NOT seller battlecards. A battlecard arms the seller for
 * a conversation the seller is in. These arm the champion for the conversation
 * that happens after we leave the room, where the pushback comes from their own
 * security lead, their own PM, their own CFO competing for the same budget.
 *
 * The honest answer is the requirement. A script that spins loses the champion
 * the moment their colleague catches it, and the champion is the one who pays
 * for that — which is why they will not use a script they cannot defend.
 */
export function buildObjectionsPrompt(ctx: PromptContext): ChatInput {
  const { deal, economics, signals } = ctx;

  return {
    system: SYSTEM_PROMPT,
    user: `Write objection scripts for our champion at ${deal.company}.

AUDIENCE: the champion, preparing for pushback from inside their own
organization. These are not battlecards for us — they are what the champion
says when their security lead, their project manager, or a peer competing for
the same budget pushes back and we are not in the room.

PRIORITIZE the categories that kill deals internally, in this order:
1. Security and compliance
2. Implementation risk
3. Budget competition — the other thing this money could buy

Then any objection specific to this account's vertical (${deal.vertical}) or to
what the record below shows has already been raised.

FORMAT — per objection, exactly three parts:
  WHAT GETS SAID     — the objection in the colleague's own words, blunt
  THE HONEST ANSWER  — what is actually true, including where we are weaker
  THE SUPPORT        — the specific number or source that backs it

RULES:
- The honest answer is the requirement, not a style note. If the honest answer
  is "yes, that is a real cost and here is why it is worth paying", write that.
  A script the champion cannot defend gets them burned, and they will know it
  on first read and not use any of them.
- Never invent a number for THE SUPPORT. If no figure in the record supports the
  answer, write "No figure in the record supports this yet — " and name the one
  thing that would.
- No vendor language. The champion has to say these words out loud to people who
  know them.

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

${economicsBlock(economics)}

RECENT SIGNALS:
${signalsBlock(signals)}

Where the record is thin, generate what it supports and then name, in one short
closing list, what would sharpen these scripts. Do not pad with generic
objections to reach a count.${ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''}`,
    maxTokens: 6000,
  };
}
