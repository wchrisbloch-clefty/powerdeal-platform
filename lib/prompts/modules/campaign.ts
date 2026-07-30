import { SYSTEM_PROMPT } from '../system';
import type { ChatInput, Deal } from '@/lib/types';

export interface CampaignContext {
  /** The account set the campaign runs across. */
  deals: Deal[];
  /** What ties them together — a rate move, a policy shift, a peer win. */
  thesis?: string;
  extra?: string;
}

/** Campaign Mode — one thesis across an account set, sequenced. */
export function buildCampaignPrompt(ctx: CampaignContext): ChatInput {
  const roster = ctx.deals
    .map(
      (d) =>
        `- ${d.deal_id} · ${d.company} · ${d.vertical} · ${d.state ?? '—'} · ` +
        `${d.utility ?? '—'} · stage ${d.stage} · health ${d.health_score} · ` +
        `value prop: ${d.value_prop ?? 'undiagnosed'}`,
    )
    .join('\n');

  return {
    system: SYSTEM_PROMPT,
    user: `Run Campaign Mode across the account set below, using the campaign standard in your instructions.

Deliver:
1. SHARED THESIS — the one claim that is true across this set and worth their attention now.${
      ctx.thesis ? ` The user proposes: "${ctx.thesis}" — sharpen or replace it, and say which you did.` : ''
    }
2. RANKED ACCOUNT SET — ordered by pain-to-lever fit against the thesis, with the fit reason per account. Name any account that does NOT fit and should be dropped from the campaign.
3. SHARED ASSETS — what gets built once and reused, and what must be per-account.
4. SEQUENCING — who gets touched in what order and why that order.
5. SUCCESS METRIC — the single number that says this campaign worked, and the threshold.

ACCOUNT SET (${ctx.deals.length} accounts):
${roster}

Do not pad the ranked set to include every account handed to you — a campaign that targets everyone targets no one.${
      ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''
    }`,
    maxTokens: 7000,
  };
}
