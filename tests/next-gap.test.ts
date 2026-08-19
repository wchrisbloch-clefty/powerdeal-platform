import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  STAGE_PRIORITY,
  nextGaps,
  resolveKind,
  gapKinds,
  noGapMessage,
} from '@/lib/design/next-gap';
import { meddpiccState } from '@/lib/deals';
import { DEAL_STAGES, MEDDPICC_FIELDS, TERMINAL_STAGES } from '@/lib/types';
import type { Deal, DealStage } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE VERIFIED-EMPTY MARKER AND STAGE-AWARE ORDERING.
 * ═══════════════════════════════════════════════════════════════
 *
 * Two things, and they exist for one reason: the gap system was making a false
 * statement. "Not checked" on twenty-one deals means nobody looked. Somebody
 * looked. A null cannot tell the two apart, so the distinction is recorded.
 */

const bare = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 'x',
    deal_id: 'DEF-001',
    company: 'Ironvale Defense Systems',
    stage: 'Prospecting',
    champion: null,
    economic_buyer: null,
    metrics_known: false,
    decision_criteria: null,
    decision_process: null,
    identified_pain: null,
    decision_mapped: false,
    multi_threaded: false,
    verified_empty: [],
    ...over,
  }) as unknown as Deal;

// ═══════════════════════════════════════════════════════════════
describe('every stage has an order, keyed by name', () => {
  it('covers all eleven stages — nothing falls through to a default', () => {
    /**
     * ⚠️ THE RECORD CAUGHT ME INVENTING A STAGE. The first draft listed
     * 'Closed-Lost' and omitted 'Contracting'. A lookup with a fallback would
     * have handed every Contracting deal an empty list — a live stage silently
     * behaving like a closed one.
     */
    for (const stage of DEAL_STAGES) {
      expect(STAGE_PRIORITY[stage], `${stage} has no priority list`).toBeDefined();
    }
    expect(Object.keys(STAGE_PRIORITY).sort()).toEqual([...DEAL_STAGES].sort());
  });

  it('is keyed BY NAME, so Archived being last in DEAL_STAGES cannot rank it', async () => {
    // Archived sits at the end of DEAL_STAGES, and a linear weight over that
    // array has scored a dead deal as the most advanced one three times in
    // this build. Asserted against the source: no index arithmetic here.
    const src = await readFile('lib/design/next-gap.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toMatch(/DEAL_STAGES\.indexOf|DEAL_STAGES\[/);
  });

  it('gives every terminal stage an EMPTY order, not a short one', () => {
    for (const stage of TERMINAL_STAGES) {
      expect(STAGE_PRIORITY[stage], `${stage} would raise a gap`).toEqual([]);
    }
  });

  it('names only real MEDDPICC fields', () => {
    const known = new Set(MEDDPICC_FIELDS.map((f) => f.key));
    for (const [stage, list] of Object.entries(STAGE_PRIORITY)) {
      for (const key of list) {
        expect(known, `${stage} lists an unknown field: ${key}`).toContain(key);
      }
    }
  });

  it('orders differently across the funnel — otherwise it is one list', () => {
    // If every stage had the same order this would be a global priority with
    // extra steps, and the whole claim ("champion early, paper process late")
    // would be untrue.
    expect(STAGE_PRIORITY.Prospecting[0]).toBe('champion');
    expect(STAGE_PRIORITY.Negotiation[0]).not.toBe('champion');
    expect(STAGE_PRIORITY.Negotiation).toContain('decision_mapped');
    expect(STAGE_PRIORITY.Prospecting).not.toContain('decision_mapped');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('it never manufactures a next move', () => {
  it('returns NOTHING when the stage’s fields are all filled', () => {
    /**
     * ⚠️ THE REQUIREMENT, ASSERTED. It must not reach for a lower-priority
     * field to keep a slot populated. Prospecting cares about champion and
     * pain; with both recorded there is nothing to raise, even though six
     * other fields are still empty.
     */
    const deal = bare({ stage: 'Prospecting', champion: 'T. Reitsma', identified_pain: 'Grid' });
    expect(nextGaps(deal)).toEqual([]);
  });

  it('and the six still-empty fields prove it had somewhere to fall through to', () => {
    const deal = bare({ stage: 'Prospecting', champion: 'T. Reitsma', identified_pain: 'Grid' });
    // Everything not in Prospecting's list is genuinely absent…
    const kinds = gapKinds(deal, null);
    expect(kinds.economic_buyer).not.toBe('recorded');
    expect(kinds.decision_criteria).not.toBe('recorded');
    // …and none of it is raised.
    expect(nextGaps(deal)).toHaveLength(0);
  });

  it('raises nothing at all on a terminal stage', () => {
    for (const stage of TERMINAL_STAGES) {
      expect(nextGaps(bare({ stage })), `${stage} raised a gap`).toEqual([]);
    }
  });

  it('raises nothing for a stage it does not know, rather than guessing an order', () => {
    expect(nextGaps(bare({ stage: 'Renegotiation' as DealStage }))).toEqual([]);
  });

  it('says so plainly instead of leaving a blank', () => {
    expect(noGapMessage('Prospecting')).toMatch(/nothing outstanding/i);
    expect(noGapMessage('Archived')).toMatch(/nothing is in flight/i);
    expect(noGapMessage('Renegotiation')).toMatch(/not one this platform knows/i);
    // And never a number — a gap is where a plausible figure does most damage.
    for (const s of ['Prospecting', 'Archived', 'Renegotiation']) {
      expect(noGapMessage(s)).not.toMatch(/\d/);
    }
  });

  it('caps at the limit and takes them in priority order', () => {
    const deal = bare({ stage: 'Discovery' });
    const two = nextGaps(deal, null, 2);
    expect(two).toHaveLength(2);
    expect(two.map((g) => g.field)).toEqual(['metrics_known', 'decision_criteria']);
  });

  it('carries the prompt that fills it, from the field definition', () => {
    const [first] = nextGaps(bare({ stage: 'Prospecting' }));
    expect(first.label).toBe('Champion');
    expect(first.hint).toBe(MEDDPICC_FIELDS.find((f) => f.key === 'champion')!.hint);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('the marker turns "not checked" into "not recorded"', () => {
  it('defaults to unchecked, because that is true until the operator says otherwise', () => {
    const deal = bare();
    expect(gapKinds(deal, null).economic_buyer).toBe('unchecked');
  });

  it('reports MISSING once the operator has confirmed it is empty', () => {
    const deal = bare({ verified_empty: ['economic_buyer'] });
    expect(gapKinds(deal, null).economic_buyer).toBe('missing');
    // And only that field. A marker is per-field, not a per-deal flag.
    expect(gapKinds(deal, null).decision_criteria).toBe('unchecked');
  });

  it('a RECORDED VALUE always beats a stale marker', () => {
    /**
     * ⚠️ AND IT IS NOT CLEARED ON READ. A read that writes is the silent-write
     * risk this build spent two weeks removing, and a marker left over from
     * before a field was filled is exactly where that convenience would feel
     * natural. The value wins; the marker is ignored and left alone.
     */
    const deal = bare({ economic_buyer: 'A. Buyer', verified_empty: ['economic_buyer'] });
    expect(gapKinds(deal, null).economic_buyer).toBe('recorded');
    expect(deal.verified_empty).toEqual(['economic_buyer']);
  });

  it('never touches the deal it is passed', () => {
    const deal = bare({ verified_empty: ['economic_buyer'] });
    const snapshot = JSON.stringify(deal);
    gapKinds(deal, null);
    nextGaps(deal);
    expect(JSON.stringify(deal)).toBe(snapshot);
  });

  it('a marked field still leads its stage — confirmed-absent is not resolved', () => {
    // A confirmed-absent economic buyer at Qualified is still the most
    // important thing about the deal. The marker changes the WORDS, not the
    // priority.
    const deal = bare({ stage: 'Qualified', verified_empty: ['economic_buyer'] });
    const [first] = nextGaps(deal);
    expect(first.field).toBe('economic_buyer');
    expect(first.kind).toBe('missing');
  });

  it('resolveKind is driven through the REAL scorer, not three literals', () => {
    for (const f of MEDDPICC_FIELDS) {
      const deal = bare();
      const plain = resolveKind(meddpiccState(deal, f.key, null), f.key, []);
      const marked = resolveKind(meddpiccState(deal, f.key, null), f.key, [f.key]);
      // Marking can only ever move `unchecked` to `missing`. It cannot
      // manufacture a `recorded`, and it cannot downgrade one.
      if (plain === 'unchecked') expect(marked).toBe('missing');
      else expect(marked).toBe(plain);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('scoring is untouched, structurally', () => {
  it('nothing in the scoring path reads the column', async () => {
    // The user asked to change what the gap system may CLAIM, not what scores.
    const src = await readFile('lib/deals.ts', 'utf8');
    const scorers = src.slice(src.indexOf('export function computeHealthScore'), src.indexOf('// ── Health presentation'));
    expect(scorers).not.toContain('verified_empty');
  });

  it('and the migration asserts the same thing about the database function', async () => {
    const sql = await readFile('supabase/migrations/20260818_verified_empty.sql', 'utf8');
    expect(sql).toContain('compute_health_score');
    expect(sql).toMatch(/health scoring does not read the column/);
  });

  it('the column is a text array, never jsonb', async () => {
    // jsonb would slip past every numeric-column assertion in this repo while
    // happily holding a number — the same reason pacing position stayed out of
    // one.
    const sql = await readFile('supabase/migrations/20260818_verified_empty.sql', 'utf8');
    expect(sql).toMatch(/verified_empty text\[\]/);
    expect(sql).not.toMatch(/verified_empty\s+jsonb/);
  });

  it('the migration ships a BEHAVIOURAL check, not only structural ones', async () => {
    // Rule 3: a column that exists and does not work passes every structural
    // check ever written.
    const sql = await readFile('supabase/migrations/20260818_verified_empty.sql', 'utf8');
    expect(sql).toMatch(/a marker round-trips/);
    expect(sql).toMatch(/update deals\s+set verified_empty/);
  });

  it('the behavioural check WRITES INSIDE A TRANSACTION AND ROLLS BACK', async () => {
    /**
     * ⚠️ THE SAFETY PROPERTY, NOT THE PRESENCE OF A WRITE.
     *
     * The first version of this check nested a data-modifying CTE inside a
     * UNION ALL branch. PostgreSQL refused it — 0A000 — and the obvious
     * correction, hoisting the CTE to the top level, PARSES and is unsound:
     * two updates to the same row in one statement are unsupported, only one
     * takes effect, and which one is unpredictable.
     *
     * Run against PostgreSQL 16.13, the hoisted form returned zero rows and
     * left the marker written on a real deal. A verification query that
     * silently writes to the data it verifies.
     *
     * So: every write is bracketed by an explicit transaction that rolls back,
     * and the revert is guaranteed by the transaction rather than by a second
     * update racing the first.
     */
    const sql = await readFile('supabase/migrations/20260818_verified_empty.sql', 'utf8');
    const begins = (sql.match(/^begin;/gm) ?? []).length;
    const rollbacks = (sql.match(/^rollback;/gm) ?? []).length;
    expect(begins, 'a write outside a transaction').toBeGreaterThan(0);
    expect(rollbacks, 'a transaction that does not roll back').toBe(begins);
    expect(sql, 'a commit would persist the probe write').not.toMatch(/^commit;/m);

    // And no data-modifying CTE anywhere — the construction that failed.
    expect(sql, 'a data-modifying CTE is back').not.toMatch(/\bas \(\s*update\b/i);
  });

  it('the probe targets ONE row deterministically', async () => {
    /**
     * ⚠️ `order by created_at limit 1` ALONE IS NON-DETERMINISTIC when two
     * rows share a timestamp, so the UPDATE and the read-back can hit
     * different rows and the check reports FAIL on a working column. Observed
     * exactly that on a fixture inserted in a single statement — and on a real
     * database the timestamps usually differ, so it would have passed most of
     * the time, which is the worst way for a check to be wrong.
     */
    /**
     * ⚠️ COMMENTS STRIPPED FIRST. The first version of this scan matched the
     * line in the comment that DESCRIBES the bad form and reported it as the
     * bad form — a check that cannot tell an explanation from an instance,
     * which is the same reason an earlier scan flagged `var(--leading-base)`
     * inside its own token declaration.
     */
    const sql = (await readFile('supabase/migrations/20260818_verified_empty.sql', 'utf8'))
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const orderings = sql.match(/order by created_at[^\n]*limit 1/g) ?? [];
    expect(orderings.length).toBeGreaterThan(0);
    for (const o of orderings) {
      expect(o, `${o} has no tiebreak`).toMatch(/created_at,\s*id/);
    }
  });
});
