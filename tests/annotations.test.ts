import { describe, expect, it } from 'vitest';
import { forAudience, withheldFrom, external, internal } from '@/lib/annotations';
import { planAnnotations, starterPlan } from '@/lib/map/schedule';
import { mapToMarkdown } from '@/lib/map/export';
import type { MapPlan } from '@/lib/map/schedule';

/**
 * AUDIENCE SPLIT — the leak test.
 *
 * This file exists because the split was verified twice with throwaway scripts
 * and both times the verification was the flaw rather than the code. Every
 * scenario tested had ZERO external annotations, so a forAudience() that
 * unconditionally returned [] would have passed all of them: the filter was
 * proven to block internal and never proven to pass external.
 *
 * The mixed record below is the fixture that separates those two failures. It
 * carries one annotation of each class at once, so a filter that drops
 * everything fails just as loudly as one that leaks.
 *
 * Adding a new annotation to planAnnotations() should mean adding a case here.
 */

const TODAY = '2026-08-09';

/**
 * One milestone triggering each class.
 *
 *   discovery    — done, dated in the FUTURE  → internal (our record is wrong)
 *   load-profile — not done, date already PAST → external (they are late)
 */
function mixedRecord(): MapPlan {
  const base = starterPlan();
  return {
    ...base,
    milestones: base.milestones.map((m) => {
      if (m.id === 'discovery') {
        return { ...m, owner: 'R. Okafor (Bloom)', status: 'done' as const, date: '2026-08-23' };
      }
      if (m.id === 'load-profile') {
        return {
          ...m,
          owner: 'D. Prewitt (Williams)',
          status: 'in-progress' as const,
          date: '2026-07-27',
        };
      }
      return m;
    }),
  };
}

describe('forAudience', () => {
  const items = [
    external('ext', 'error', 'External thing', 'Visible to the reader.'),
    internal('int', 'warn', 'Internal thing', 'Operator only.'),
  ];

  it('passes external annotations through — not an empty array', () => {
    const out = forAudience(items, 'external');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ext');
  });

  it('withholds internal annotations from an external audience', () => {
    expect(forAudience(items, 'external').some((a) => a.audience === 'internal')).toBe(false);
  });

  it('shows everything to an internal audience', () => {
    expect(forAudience(items, 'internal')).toHaveLength(2);
  });

  it('defaults to withholding: an unmarked audience never reaches external', () => {
    // Guards the deny-by-default direction. If the filter is ever rewritten as
    // a denylist, this fails.
    const odd = [{ ...items[1], audience: 'something-else' } as unknown as (typeof items)[number]];
    expect(forAudience(odd, 'external')).toHaveLength(0);
  });
});

describe('planAnnotations on a record carrying both classes', () => {
  const plan = mixedRecord();
  const all = planAnnotations(plan, TODAY);
  const ext = forAudience(all, 'external');
  const held = withheldFrom(all, 'external');

  it('the app surface sees exactly two annotations', () => {
    expect(all).toHaveLength(2);
  });

  it('exactly one is external and one is internal', () => {
    expect(all.filter((a) => a.audience === 'external')).toHaveLength(1);
    expect(all.filter((a) => a.audience === 'internal')).toHaveLength(1);
  });

  it('the export receives exactly one — not zero', () => {
    expect(ext).toHaveLength(1);
  });

  it('the one it receives is the external one', () => {
    expect(ext[0].audience).toBe('external');
    expect(ext[0].id).toBe('overdue');
  });

  it('the withheld list is exactly the internal one', () => {
    expect(held).toHaveLength(1);
    expect(held[0].audience).toBe('internal');
  });

  it('a past-due milestone is external, a future-dated done is internal', () => {
    expect(all.find((a) => a.id === 'overdue')?.audience).toBe('external');
    expect(all.find((a) => a.id.startsWith('done-in-future'))?.audience).toBe('internal');
  });
});

describe('the exported document', () => {
  const md = mapToMarkdown(mixedRecord(), {
    company: 'Williams',
    dealId: 'OG-019',
    today: TODAY,
  });

  it('carries the external warning', () => {
    expect(md).toContain('past due');
  });

  it('names the overdue milestone so the reader can act on it', () => {
    expect(md).toContain('Load profile + site data received.');
  });

  it('does not leak the internal message', () => {
    expect(md).not.toContain('future');
    expect(md.toLowerCase()).not.toContain('marked done');
  });

  it('says nothing about correcting our record', () => {
    expect(md).not.toContain('corrected');
  });
});

describe('a clean record produces no annotations at all', () => {
  it('emits nothing when nothing is wrong', () => {
    const base = starterPlan();
    // Everything pending and future-dated: nothing overdue, nothing falsely done.
    expect(planAnnotations(base, TODAY)).toHaveLength(0);
  });
});
