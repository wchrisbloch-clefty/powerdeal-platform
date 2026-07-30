import { POWERDEAL_IDENTITY } from '../system';
import type { ChatInput, Deal } from '@/lib/types';

/**
 * Market Watch — the account-mapped sweep.
 *
 * Routed to Gemini (not Claude) for efficiency: this is signal triage and
 * mapping, not domain reasoning. It uses the compact identity spine rather
 * than the full methodology, since a non-Claude provider may serve it.
 */

export interface MarketWatchItem {
  title: string;
  summary?: string;
  source?: string;
  url?: string;
  published?: string;
}

export function buildMarketWatchPrompt(
  items: MarketWatchItem[],
  deals: Deal[],
  watchlistTopics: string[] = [],
): ChatInput {
  const roster = deals
    .map(
      (d) =>
        `${d.deal_id}|${d.company}|${d.vertical}|${d.state ?? '—'}|${d.utility ?? '—'}`,
    )
    .join('\n');

  const feed = items
    .map(
      (it, i) =>
        `[${i + 1}] ${it.title}\n    source: ${it.source ?? 'unknown'}${
          it.published ? ` · ${it.published}` : ''
        }${it.summary ? `\n    ${it.summary.slice(0, 400)}` : ''}`,
    )
    .join('\n');

  return {
    system: POWERDEAL_IDENTITY,
    user: `Run a Market Watch sweep. For each item below, decide whether it matters to this pipeline and map it.

Return STRICT JSON — an array, no prose, no markdown fence:
[
  {
    "index": <the [n] of the item>,
    "category": "rate-move|capacity-cap-tag|policy|customer-announcement|earnings|grid-stress|value-prop-enhancer|peer-signal|ccus",
    "headline": "<tight restatement, max 120 chars>",
    "summary": "<2 sentences, what happened and why it moves a deal>",
    "impact_rank": <1-10, 10 = act today>,
    "deal_refs": ["<deal_id of every account this actually hits>"],
    "outreach_hook": "<the specific re-engagement line, or null>",
    "peers_to_add": ["<company names surfaced that are NOT already in the pipeline>"],
    "source_tier": "verified|reported|inferred"
  }
]

Rules:
- OMIT items that hit no account and surface no peer. Do not pad the array.
- deal_refs must be deal_ids from the roster. Match on utility territory, state, company name, or vertical. Never invent a deal_id.
- source_tier: government/regulator/filing = verified; trade press = reported; aggregator/social/your own inference = inferred.
- outreach_hook must reference the specific event, not a generic value prop. Null if there is no honest hook.
- Never state a rate, price, or permitting timeline that is not in the item text.

PIPELINE ROSTER (deal_id|company|vertical|state|utility):
${roster}

WATCHLIST TOPICS: ${watchlistTopics.join(', ') || '(none set)'}

FEED ITEMS:
${feed}`,
    maxTokens: 4000,
    promptCache: false,
  };
}
