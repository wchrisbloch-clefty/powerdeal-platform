import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  GAP_KINDS,
  PRESENTATION,
  describeGap,
  fromMeddpicc,
  isGap,
  rankGaps,
  type GapKind,
} from '@/lib/design/gaps';
import { meddpiccState } from '@/lib/deals';
import type { Deal } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE GAP SYSTEM — FIVE STATES THAT MUST NEVER COLLAPSE.
 * ═══════════════════════════════════════════════════════════════
 *
 * Every silent failure this build has found was two states printing the same
 * words. These assertions exist to make that impossible by construction rather
 * than by care:
 *
 *   · a failed read rendering as "no results"
 *   · 21 seeded deals rendering as 21 real ones
 *   · an unscored MEDDPICC pillar rendering as a missing one
 *   · a vertical with no playbook served the nearest neighbour's
 */

describe('the five kinds are five, and no two render alike', () => {
  it('has exactly the five, listed so a sixth is a decision', () => {
    expect(GAP_KINDS).toEqual(['recorded', 'missing', 'unchecked', 'unavailable', 'blocked']);
  });

  it('gives every kind a presentation — the renderer is total', () => {
    for (const k of GAP_KINDS) {
      expect(PRESENTATION[k], `${k} has no presentation`).toBeDefined();
    }
    expect(Object.keys(PRESENTATION).sort()).toEqual([...GAP_KINDS].sort());
  });

  it('NO TWO GAP KINDS SHARE A MARK — collapsing them is the defect', () => {
    // The whole point. If `unchecked` and `missing` printed the same word, the
    // vocabulary would be decoration over a two-state system.
    const marks = GAP_KINDS.filter(isGap).map((k) => PRESENTATION[k].mark);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('never relies on colour alone — the mark differs before the tone does', () => {
    // Two kinds share the `quiet` tone deliberately. They must still be
    // distinguishable to someone who cannot separate the hues.
    const quiet = GAP_KINDS.filter((k) => isGap(k) && PRESENTATION[k].tone === 'quiet');
    expect(quiet.length).toBeGreaterThan(1);
    expect(new Set(quiet.map((k) => PRESENTATION[k].mark)).size).toBe(quiet.length);
  });

  it('draws no slot for a recorded value', () => {
    expect(isGap('recorded')).toBe(false);
    expect(PRESENTATION.recorded.rule).toBe('none');
    for (const k of GAP_KINDS.filter((k) => k !== 'recorded')) {
      expect(isGap(k), `${k} should be a gap`).toBe(true);
    }
  });
});

describe('the copy says which kind of nothing this is', () => {
  it('BLOCKED never says there are none', () => {
    const c = describeGap('blocked', 'deals', undefined, 'JWT issued at future.');
    expect(c.title).toMatch(/could not read/i);
    expect(c.body).toContain('not that there is none');
    expect(c.body).toContain('JWT issued at future.');
    expect(c.body).not.toMatch(/\bno deals\b|\bempty\b|\bnothing here\b/i);
  });

  it('UNCHECKED says absent evidence, not evidence of absence', () => {
    const c = describeGap('unchecked', 'Competition');
    expect(c.body).toContain('not the same as being empty');
    // The specific defect: a fully worked competitive grid reported as a gap
    // because the competitor set was never passed to the scorer.
    expect(c.body).not.toMatch(/\bnobody has\b|\bmissing\b/i);
  });

  it('UNAVAILABLE names the absence and refuses a substitute', () => {
    // Defense has no vertical playbook. The instruction was that it be named
    // absent rather than served the nearest neighbour's.
    const c = describeGap('unavailable', 'playbook for Defense');
    expect(c.title).toMatch(/that is correct/i);
    expect(c.body).toContain('Nothing stands in for it');
  });

  it('MISSING carries the action when it has one, and admits it when it does not', () => {
    const withAction = describeGap('missing', 'champion', 'Ask who loses if this slips.');
    expect(withAction.body).toBe('Ask who loses if this slips.');

    const without = describeGap('missing', 'champion');
    expect(without.body).toMatch(/has not been written down/i);
    // ⚠️ It must NOT invent a next step. An absent action is itself a gap.
    expect(without.body).not.toMatch(/ask |call |email |schedule /i);
  });

  it('never puts a number in gap copy, for any kind', () => {
    /**
     * ⚠️ A GAP IS WHERE A FABRICATED FIGURE WOULD DO THE MOST DAMAGE.
     * "Typically 3–5 contacts at this stage" is exactly the kind of plausible,
     * uncheckable number this build exists to refuse, and an empty state is its
     * most natural habitat — there is nothing on screen to contradict it.
     */
    for (const k of GAP_KINDS) {
      const c = describeGap(k, 'champion', 'Ask who loses if this slips.', 'the read failed');
      expect(`${c.title} ${c.body}`, `${k} copy contains a digit`).not.toMatch(/\d/);
    }
  });

  it('produces a distinct title for every kind', () => {
    const titles = GAP_KINDS.map((k) => describeGap(k, 'champion').title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('it is a superset of MeddpiccState, not a parallel invention', () => {
  it('maps all three, totally', () => {
    expect(fromMeddpicc('known')).toBe('recorded');
    expect(fromMeddpicc('gap')).toBe('missing');
    expect(fromMeddpicc('unknown')).toBe('unchecked');
  });

  it('every state a real deal can produce maps to a kind', async () => {
    // Driven through the ACTUAL scorer rather than the three literals, so a
    // fourth MeddpiccState added later fails here instead of falling through.
    const deal = {
      id: 'x', champion: null, economic_buyer: 'A. Buyer', metrics_known: null,
      decision_criteria: null, decision_process: null, identified_pain: null,
      decision_mapped: false,
    } as unknown as Deal;

    for (const key of ['champion', 'economic_buyer', 'competition', 'decision_mapped']) {
      for (const competitors of [null, 0, 3]) {
        const state = meddpiccState(deal, key, competitors);
        const kind = fromMeddpicc(state);
        expect(GAP_KINDS, `${key}/${competitors} produced ${kind}`).toContain(kind);
      }
    }
  });

  it('an unsupplied competitor set is UNCHECKED, never MISSING', () => {
    // The defect this distinction exists for, asserted end to end.
    const deal = { champion: null } as unknown as Deal;
    expect(fromMeddpicc(meddpiccState(deal, 'competition', null))).toBe('unchecked');
    expect(fromMeddpicc(meddpiccState(deal, 'competition', 0))).toBe('missing');
    expect(fromMeddpicc(meddpiccState(deal, 'competition', 2))).toBe('recorded');
  });
});

describe('gaps are ranked by what can be done about them', () => {
  it('a platform fault leads, the reader’s own work follows', () => {
    const ranked = rankGaps([
      { kind: 'unchecked' as GapKind, id: 'c' },
      { kind: 'missing' as GapKind, id: 'b' },
      { kind: 'blocked' as GapKind, id: 'a' },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops what is not a gap to act on', () => {
    const ranked = rankGaps([
      { kind: 'recorded' as GapKind, id: 'r' },
      { kind: 'unavailable' as GapKind, id: 'u' },
      { kind: 'missing' as GapKind, id: 'm' },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['m']);
  });

  it('is stable for equal kinds, so the list does not reshuffle on rerender', () => {
    const input = [
      { kind: 'missing' as GapKind, id: '1' },
      { kind: 'missing' as GapKind, id: '2' },
      { kind: 'missing' as GapKind, id: '3' },
    ];
    expect(rankGaps(input).map((r) => r.id)).toEqual(['1', '2', '3']);
  });
});

describe('the renderer honours the vocabulary', () => {
  it('offers a call to action ONLY where one can be acted on', async () => {
    // A "Try again" under `unavailable` invites the reader to fix something
    // that is correct; under `blocked` it usually just fails again.
    const src = await readFile('components/ui/gap.tsx', 'utf8');
    expect(src).toContain("kind === 'missing' || kind === 'unchecked'");
  });

  it('uses the gap rule token, never the separator rule, for the slot', async () => {
    const src = await readFile('components/ui/gap.tsx', 'utf8');
    expect(src).toContain('border-gap-rule');
  });

  it('renders nothing at all for a recorded value', async () => {
    const src = await readFile('components/ui/gap.tsx', 'utf8');
    expect(src).toContain('if (!isGap(kind)) return null;');
  });
});
