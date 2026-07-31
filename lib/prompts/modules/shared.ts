import type { Deal, Signal, MarketWatchEntry } from '@/lib/types';

/**
 * Shared context builders for the prompt modules.
 *
 * These assemble the ACCOUNT FACTS a task needs. They never state the
 * methodology — that lives entirely in the system prompt (GLOBAL RULE 6).
 * Each module's job is to name the standard and hand over the record.
 */

export interface PromptContext {
  deal: Deal;
  signals?: Signal[];
  marketWatch?: MarketWatchEntry[];
  /** Ingested last30days items for this account, engagement-scored. */
  research?: ResearchContextItem[];
  /** Audience calibration for the Document Forge. */
  audiencePersona?: string;
  /** Free-text the user supplied alongside the request. */
  extra?: string;
}

/** The deal record, minus noise the model doesn't need. */
export function dealBlock(deal: Deal): string {
  const {
    id: _id,
    user_id: _userId,
    artifacts: _artifacts,
    ...rest
  } = deal;
  void _id;
  void _userId;
  void _artifacts;
  return JSON.stringify(rest, null, 2);
}

export function signalsBlock(signals: Signal[] = [], limit = 20): string {
  if (signals.length === 0) return '(no signals logged for this account)';
  return signals
    .slice(0, limit)
    .map((s) => {
      const parts = [`- [${s.signal_type}] ${s.raw_signal ?? ''}`];
      if (s.so_what) parts.push(`  so-what: ${s.so_what}`);
      if (s.source_name) parts.push(`  source: ${s.source_name}`);
      return parts.join('\n');
    })
    .join('\n');
}

export function marketWatchBlock(entries: MarketWatchEntry[] = [], limit = 12): string {
  if (entries.length === 0) return '(no market watch entries mapped to this account)';
  return entries
    .slice(0, limit)
    .map(
      (m) =>
        `- [${m.category} · ${m.source_tier}] ${m.headline}` +
        (m.outreach_hook ? `\n  hook: ${m.outreach_hook}` : ''),
    )
    .join('\n');
}

/**
 * RECENT MARKET RESEARCH — ingested last30days items for this account.
 *
 * Kept in its own block, clearly separated from editorial sources, and every
 * line carries its tier. That separation is the whole safety mechanism: these
 * items are engagement-scored from social and community sources, and a model
 * handed them undifferentiated will state a viral Reddit claim as fact in a
 * document a customer reads.
 *
 * Engagement is printed because reach is genuinely useful context — "everyone
 * in the industry is talking about this" is worth knowing — but the instruction
 * below says plainly that it is reach, not accuracy.
 *
 * Capped at 10 so context stays lean and the Claude bill stays predictable.
 */
export function researchBlock(items: ResearchContextItem[] = [], limit = 10): string {
  if (items.length === 0) return '';

  const lines = items
    .slice(0, limit)
    .map(
      (r) =>
        `[${r.tier.toUpperCase()}] ${r.title} — ${r.source ?? 'unknown'}` +
        (r.engagement ? ` · ${r.engagement}` : '') +
        (r.url ? ` · ${r.url}` : ''),
    )
    .join('\n');

  return [
    `RECENT MARKET RESEARCH (last30days, engagement-scored${items[0]?.runAt ? `, run ${items[0].runAt.slice(0, 10)}` : ''}):`,
    lines,
    '',
    'Research items above are engagement-scored from social and community sources.',
    'Treat tier badges as the trust signal — engagement counts indicate reach, not',
    'accuracy. INFERRED items may inform a hypothesis or a discovery question but',
    'must never be stated as fact in a customer-facing document. Attribute anything',
    'you use.',
  ].join('\n');
}

export interface ResearchContextItem {
  title: string;
  source: string | null;
  url: string | null;
  tier: string;
  engagement: string | null;
  runAt?: string;
}

/** Territory framing every account-level task shares. */
export function territoryBlock(deal: Deal): string {
  return [
    `Utility territory: ${deal.utility ?? 'unknown'}`,
    `State: ${deal.state ?? 'unknown'}`,
    `Geo tier: ${deal.geo_tier ?? 'unclassified'}`,
    `Vertical: ${deal.vertical}`,
    `Relationship: ${deal.relationship_type}`,
    `Value prop in play: ${deal.value_prop ?? 'not yet diagnosed'}`,
  ].join('\n');
}

/**
 * Audience calibration prepended to Forge output requests.
 * Each entry says what to LEAD with — it reorders the argument, it does not
 * change the underlying facts.
 */
const PERSONA_MAP: Record<string, string> = {
  CFO: 'Lead with economics and payback. Show US$ before specs. 20-yr TCO is the headline.',
  'Plant GM':
    'Lead with reliability and O&M reduction. Zero planned downtime is the hook.',
  Sustainability:
    'Lead with Scope 1/2 progress and ESG metrics. Net-zero commitments are the frame.',
  'Energy Manager':
    'Lead with cost certainty and operational control.',
  Security:
    'Lead with domestic supply chain, no rare earth, no combustion. OPSEC-compatible.',
  Procurement:
    'Lead with PPA structure (zero capital), total cost of ownership, contract terms.',
};

export const AUDIENCE_PERSONAS = Object.keys(PERSONA_MAP);

export function getAudienceContext(persona?: string): string {
  if (!persona) return '';
  const line = PERSONA_MAP[persona];
  if (!line) return '';
  return `\nAUDIENCE CALIBRATION — reader is ${persona}:\n${line}\n`;
}
