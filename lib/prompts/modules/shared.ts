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
