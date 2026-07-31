import type { FeedItem, SourceTier } from '@/lib/types';
import { route, canRun } from './model-routing';

/**
 * Contradiction detection — ported from The Hub, and the highest-value block on
 * an entity page for BD.
 *
 * Competitors list sources. We grade them. This goes one further: when sources
 * disagree, say so and show the disagreement, weighted by tier — a VERIFIED
 * source contradicting two INFERRED ones is not a 2-1 loss.
 *
 * Why it earns its place here specifically: a live disagreement about whether a
 * rate case passes, or whether a Class VI permit clears, is exactly what you
 * want to walk into a customer meeting already holding. "Two outlets say
 * approved, the commission docket says still pending" is a conversation. A
 * consensus summary is not.
 */

export interface Conflict {
  claim: string;
  counterClaim: string;
  sources: string[];
  /** Strongest tier involved — how much the disagreement should worry you. */
  tier: SourceTier;
}

export interface Consensus {
  /** What most sources agree on, if anything. */
  agreement: string;
  agreeCount: number;
  conflicts: Conflict[];
  /** True when there is genuinely nothing to compare. */
  insufficient: boolean;
  aiGenerated: boolean;
}

export interface Comparable {
  title: string;
  synthesis: string;
  source: string;
  tier: SourceTier;
}

const SYSTEM = `You compare how several sources cover the SAME story in energy
infrastructure, power markets and industrial decarbonisation. Report only what
the supplied snippets actually say — never outside knowledge.
Respond as strict JSON, no markdown:
{
 "agreement": "the claim most sources support, one sentence (empty string if none)",
 "agreeCount": <how many sources support it>,
 "conflicts": [
   {"claim":"what source A asserts","counterClaim":"what source B asserts that conflicts",
    "sources":["Source A","Source B"]}
 ]
}
A conflict means a genuine factual disagreement — different capacity or price
figures, opposite regulatory outcomes, contested timelines or causes.
Differences of emphasis or wording are NOT conflicts.
If the sources simply don't overlap enough to compare, return empty conflicts.`;

const TIER_RANK: Record<SourceTier, number> = { verified: 3, reported: 2, inferred: 1 };

const EMPTY: Consensus = {
  agreement: '',
  agreeCount: 0,
  conflicts: [],
  insufficient: true,
  aiGenerated: false,
};

export async function findContradictions(
  topic: string,
  items: Comparable[],
): Promise<Consensus> {
  const usable = items.filter((i) => i.title && i.source).slice(0, 8);
  // One source cannot disagree with itself. Saying "no conflicts found" off a
  // single article would read as agreement that was never established.
  if (usable.length < 2) return EMPTY;

  if (!canRun('synthesize')) {
    return { ...EMPTY, insufficient: false, aiGenerated: false };
  }

  const block = usable
    .map((i, n) => `[${n + 1}] ${i.source} (${i.tier}): ${i.title} — ${i.synthesis}`)
    .join('\n');

  let text: string;
  try {
    const result = await route('synthesize', {
      system: SYSTEM,
      user: `TOPIC: ${topic}\n\nSOURCES:\n${block}`,
      maxTokens: 900,
    });
    text = result.text;
  } catch (err) {
    console.warn('[contradiction] route failed:', (err as Error).message);
    return { ...EMPTY, insufficient: false, aiGenerated: false };
  }

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as {
      agreement?: string;
      agreeCount?: number;
      conflicts?: { claim?: string; counterClaim?: string; sources?: string[] }[];
    };

    const tierOf = (names: string[]): SourceTier => {
      const involved = usable.filter((u) =>
        names.some((n) => u.source.includes(n) || n.includes(u.source)),
      );
      return involved.reduce<SourceTier>(
        (best, cur) => (TIER_RANK[cur.tier] > TIER_RANK[best] ? cur.tier : best),
        'inferred',
      );
    };

    return {
      agreement: String(parsed.agreement ?? '').trim(),
      agreeCount: Number(parsed.agreeCount ?? 0) || 0,
      conflicts: (parsed.conflicts ?? [])
        .filter((c) => c?.claim)
        .slice(0, 5)
        .map((c) => ({
          claim: String(c.claim),
          counterClaim: String(c.counterClaim ?? ''),
          sources: (c.sources ?? []).map(String),
          tier: tierOf(c.sources ?? []),
        })),
      insufficient: false,
      aiGenerated: true,
    };
  } catch {
    // A model that returned prose instead of JSON. Better to say nothing than
    // to show a half-parsed disagreement.
    return { ...EMPTY, insufficient: false, aiGenerated: false };
  }
}

/** Convenience for feed rows. */
export function toComparable(items: FeedItem[]): Comparable[] {
  return items.map((i) => ({
    title: i.title,
    synthesis: i.synthesis ?? '',
    source: i.source_name ?? 'Unknown',
    tier: i.tier,
  }));
}
