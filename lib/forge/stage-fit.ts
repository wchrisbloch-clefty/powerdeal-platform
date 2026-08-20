import type { DealStage } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH DOCUMENT THIS DEAL IS ACTUALLY READY FOR.
 * ═══════════════════════════════════════════════════════════════
 *
 * Six documents in one column, at identical weight, in a fixed order that has
 * nothing to do with the deal on screen. A Prospecting account with no champion
 * and a Contracting account three weeks from signature see the same list, in
 * the same order, with the same emphasis.
 *
 * Which is a hierarchy failure of the plainest kind: the surface knows the
 * stage, the stage strongly implies the document, and the surface says nothing.
 *
 * ══ SUGGESTS. DOES NOT GATE. ══
 *
 * ⚠️ EVERY DOCUMENT STAYS AVAILABLE IN EVERY STAGE, ALWAYS. Nothing is hidden,
 * disabled, reordered out of reach, or defaulted away from what the operator
 * last picked. A rep who wants a Pitch Deck for a Prospecting account has a
 * reason and the tool does not need to know it.
 *
 * What this buys is a mark on one option, which is the same trade `nextGaps`
 * makes: ordering rather than pressure. The non-negotiable from that build
 * holds here — nothing blocks, no disabled controls, no fabricated defaults.
 *
 * ══ WHY A MAP AND NOT A SCORE ══
 *
 * A relevance score would rank all six and imply a gradient that does not
 * exist. There is no meaningful sense in which a Pitch Deck is 0.6 relevant in
 * Discovery. One document per stage is the honest resolution, and stages with
 * no obvious answer say so by holding null rather than reaching for the
 * next-best thing — the same rule `nextGaps` follows when a stage's fields are
 * filled.
 */
export const STAGE_FIT: Record<DealStage, string | null> = {
  // Nothing is known yet. The brief is what you take into the first call.
  Prospecting: 'brief',
  Qualified: 'brief',
  'Intro Call': 'outreach',
  // Pain is surfacing and the account needs a written point of view.
  Discovery: 'plan',
  'Solution Design': 'proforma',
  'Economic Proposal': 'proforma',
  // Both sides now need to agree on who does what, by when.
  Negotiation: 'map',
  Contracting: 'map',
  // Nothing to forge. Saying null is the point — a suggestion invented for a
  // closed deal is noise wearing the same mark as a real one.
  'Closed-Won': null,
  'Post-Sale': null,
  Archived: null,
};

/** The suggested action id for a stage, or null when there is no honest one. */
export function suggestedAction(stage: string): string | null {
  return STAGE_FIT[stage as DealStage] ?? null;
}

/** Why it is suggested, in one line. Rendered beside the mark. */
export function suggestionReason(stage: string): string | null {
  const id = suggestedAction(stage);
  if (!id) return null;
  return `Usually the next document at ${stage}.`;
}
