import type { Deal } from './types';
import { hasCriticalEvent } from './deals';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT THE NUMBER IS MADE OF, AND WHETHER THE CAP IS DOING ANYTHING.
 * ═══════════════════════════════════════════════════════════════
 *
 * Two problems, and they turned out to be one.
 *
 * ══ THE CAP MESSAGE WAS TRUE AND USELESS ══
 *
 * "Single-threaded — health capped at 6" rendered on every deal missing a
 * second thread. Twenty of twenty-one deals compute to 1.5. A cap at 6 on a
 * deal scoring 1.5 holds nothing down; the sentence describes a rule that is
 * not currently operating, and it reads as the reason the number is low.
 *
 * ⚠️ A CAP THAT BINDS AND A CAP THAT DOES NOT ARE DIFFERENT FACTS, and they had
 * identical copy. Same class as everything else in this build: two states, one
 * rendering. A reader chasing "capped at 6" on a 1.5 deal goes and finds a
 * second contact, and the number moves by nothing.
 *
 * ══ AND THE COMPOSITION WAS NOWHERE ══
 *
 * The fix for one is the fix for the other. Once the terms are listed with what
 * each is worth and whether it was earned, "the cap is not what is holding this
 * back" stops needing to be said — it is visible. The cap line then only has to
 * carry the case where the cap IS the binding constraint.
 *
 * PURE. Mirrors `computeHealthScore` in lib/deals.ts and
 * `compute_health_score()` in supabase/schema.sql — a third reading of the same
 * rule, which is one more than anybody wants. It is here rather than inside
 * `computeHealthScore` because that function returns a number and this returns
 * an account of it, and tests/health-parity.test.ts holds the three together.
 */

export interface HealthTerm {
  key: string;
  label: string;
  /**
   * ⚠️ AUTHORED, NOT `label.toLowerCase()`. The mid-sentence form is written
   * out because deriving it destroys case that carries meaning — "MEDDPICC
   * completeness" becomes "meddpicc completeness", which is the exact damage
   * lib/design/casing.ts exists to catch. It caught this, in the commit that
   * introduced it.
   */
  inline: string;
  /** What this term is worth when earned. */
  worth: number;
  /** What it contributed on this deal. */
  earned: number;
  /** What would earn it, when it was not earned. Null when it was. */
  toEarn: string | null;
}

export interface HealthCap {
  key: 'multi_threaded' | 'critical_event';
  label: string;
  /** Mid-sentence form, authored. See the note on HealthTerm.inline. */
  inline: string;
  /** The consequence, stated only when it is actually a consequence. */
  why: string;
  /**
   * ⚠️ THE FIELD THE OLD COPY DID NOT HAVE. True only when the uncapped score
   * exceeds 6 — that is, when removing this condition would actually raise the
   * number. False means the condition is absent and irrelevant today.
   */
  binding: boolean;
}

export interface HealthComposition {
  terms: HealthTerm[];
  /** Before either cap and before the floor. */
  uncapped: number;
  /** After both caps and the floor — the stored value. */
  final: number;
  caps: HealthCap[];
  /** Caps that are actually holding the number down right now. */
  bindingCaps: HealthCap[];
  /** The single largest unearned term. Null when everything is earned. */
  nextBest: HealthTerm | null;
}

export function healthComposition(deal: Partial<Deal>): HealthComposition {
  const days = deal.days_in_stage ?? 0;
  const meddpicc = deal.meddpicc_score ?? 0;

  const terms: HealthTerm[] = [
    {
      key: 'meddpicc',
      label: `MEDDPICC completeness (${meddpicc} of 8)`,
      inline: 'MEDDPICC completeness',
      worth: 2.5,
      earned: (meddpicc / 8) * 2.5,
      toEarn: meddpicc < 8 ? `${8 - meddpicc} more pillar${8 - meddpicc === 1 ? '' : 's'}` : null,
    },
    {
      key: 'multi_threaded',
      label: 'Multi-threaded',
      inline: 'a second thread',
      worth: 2,
      earned: deal.multi_threaded ? 2 : 0,
      toEarn: deal.multi_threaded ? null : 'a real second relationship',
    },
    {
      key: 'economic_buyer',
      label: 'Economic buyer named',
      inline: 'a named economic buyer',
      worth: 1.5,
      earned: deal.economic_buyer ? 1.5 : 0,
      toEarn: deal.economic_buyer ? null : 'the name of the person who approves the spend',
    },
    {
      /*
        ⚠️ MOMENTUM IS EARNED BY DEFAULT AND LOST OVER TIME, which is worth
        naming because it is the term every one of the twenty flat deals is
        living on. A brand-new deal scores 1.5 for having been touched
        recently — it is not evidence of anything except recency.
      */
      key: 'momentum',
      label: `Stage momentum (${days} day${days === 1 ? '' : 's'} in stage)`,
      inline: 'stage momentum',
      worth: 1.5,
      earned: days < 30 ? 1.5 : days < 60 ? 0.75 : 0,
      toEarn: days < 30 ? null : 'movement — this decays at 30 and 60 days',
    },
    {
      key: 'decision_mapped',
      label: 'Decision process mapped',
      inline: 'a mapped decision process',
      worth: 1.5,
      earned: deal.decision_mapped ? 1.5 : 0,
      toEarn: deal.decision_mapped ? null : 'the approval chain, end to end',
    },
    {
      key: 'champion',
      label: 'Champion known',
      inline: 'a known champion',
      worth: 1,
      earned: deal.champion ? 1 : 0,
      toEarn: deal.champion ? null : 'someone inside who advocates',
    },
  ];

  const uncapped = Math.min(10, terms.reduce((n, t) => n + t.earned, 0));

  const allCaps: HealthCap[] = [
    {
      key: 'multi_threaded',
      label: 'Single-threaded',
      inline: 'single-threaded',
      why: 'the deal dies when one contact changes jobs',
      binding: !deal.multi_threaded && uncapped > 6,
    },
    {
      key: 'critical_event',
      label: 'No critical event',
      inline: 'no critical event',
      why: 'nothing forces a decision on any date',
      binding: !hasCriticalEvent(deal) && uncapped > 6,
    },
  ];

  // Only the conditions that are actually absent get a row at all.
  const caps = allCaps.filter((c) =>
    c.key === 'multi_threaded' ? !deal.multi_threaded : !hasCriticalEvent(deal),
  );

  const ceiling = Math.min(
    deal.multi_threaded ? 10 : 6,
    hasCriticalEvent(deal) ? 10 : 6,
  );
  const final = Math.max(1, Math.round(Math.min(uncapped, ceiling) * 10) / 10);

  const unearned = terms
    .filter((t) => t.earned < t.worth)
    .sort((a, b) => b.worth - b.earned - (a.worth - a.earned));

  return {
    terms,
    uncapped: Math.round(uncapped * 10) / 10,
    final,
    caps,
    bindingCaps: caps.filter((c) => c.binding),
    nextBest: unearned[0] ?? null,
  };
}

/**
 * The one-line account of a health score, for surfaces with no room for a table.
 *
 * ⚠️ IT SAYS WHAT IS ACTUALLY HOLDING THE NUMBER DOWN. On a deal scoring 1.5,
 * that is not the cap — it is that nothing has been earned. Naming the cap
 * there sent readers to find a second contact for no gain.
 */
export function healthSentence(deal: Partial<Deal>): string {
  const c = healthComposition(deal);

  if (c.bindingCaps.length > 0) {
    const names = c.bindingCaps.map((b) => b.inline).join(', ');
    return `${c.uncapped} on the terms, held at ${c.final} — ${names}.`;
  }

  if (c.nextBest) {
    const gap = Math.round((c.nextBest.worth - c.nextBest.earned) * 10) / 10;
    return `${c.final} of 10. The largest thing missing is ${c.nextBest.inline} — worth ${gap}.`;
  }

  return `${c.final} of 10, with every term earned.`;
}
