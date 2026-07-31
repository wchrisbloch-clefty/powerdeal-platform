/**
 * "Ask in Chat" handoff — ported from The Hub, grounded harder.
 *
 * The Hub carries the item. PowerDeal carries the item AND the account it maps
 * to, because the two produce different answers: "what does this rate case
 * mean" is a news question, "what does this rate case mean for BAE Norfolk,
 * whose economic buyer we have not yet named" is a deal question, and only the
 * second one is worth a rep's time.
 *
 * sessionStorage rather than a URL param: the synthesis and the deal record are
 * too long for a query string, and this context is per-tab by nature — two tabs
 * open on two different items should not fight over one chat.
 */

export interface AskContext {
  title: string;
  synthesis?: string | null;
  source?: string | null;
  url?: string | null;
  tier?: string;
  /** Deal this item maps to, so chat can auto-select the account. */
  dealId?: string | null;
  dealLabel?: string | null;
}

const KEY = 'powerdeal:ask-context';

export function setAskContext(ctx: AskContext): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // Private mode or a full quota. The chat still opens, just cold.
  }
}

export function getAskContext(): AskContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AskContext) : null;
  } catch {
    return null;
  }
}

export function clearAskContext(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The grounding block prepended to the first question about an item. */
export function groundingFor(ctx: AskContext): string {
  const lines = [
    'CONTEXT — the reader is asking about this item:',
    `TITLE: ${ctx.title}`,
    ctx.source ? `SOURCE: ${ctx.source}` : null,
    ctx.tier ? `PROVENANCE: ${ctx.tier}` : null,
    ctx.url ? `URL: ${ctx.url}` : null,
    ctx.synthesis ? `SUMMARY: ${ctx.synthesis}` : null,
    ctx.dealLabel ? `MAPPED ACCOUNT: ${ctx.dealLabel}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}
