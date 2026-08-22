import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { computeHealthScore, computeMeddpiccScore } from '@/lib/deals';
import { healthComposition, healthSentence } from '@/lib/health-composition';
import type { Deal } from '@/lib/types';
import { codeOnly } from './helpers/source';

const MIGRATION = 'supabase/migrations/20260822_health_recompute.sql';

/**
 * ═══════════════════════════════════════════════════════════════
 * TWO IMPLEMENTATIONS OF ONE SCORE.
 * ═══════════════════════════════════════════════════════════════
 *
 * `computeHealthScore` in lib/deals.ts and `compute_health_score` in
 * supabase/schema.sql compute the same number. POST and PATCH write the
 * TypeScript answer; the `deals_health_score` trigger overwrites it with the
 * SQL answer. Whichever writes last wins, and if they ever disagree the UI
 * shows one number while the table holds another.
 *
 * ⚠️ THE SECOND COPY IS UNAVOIDABLE HERE, WHICH IS WHY IT IS ASSERTED. Health
 * is a stored, indexed, sorted column, so the database has to be able to
 * compute it; the UI needs the number before a round trip, so TypeScript has to
 * as well. The repo's rule for an unavoidable second copy is not "be careful",
 * it is "make them unable to disagree" — the same treatment as the case
 * vocabulary and the TS/SQL seed pair.
 *
 * ⚠️ THIS IS A SOURCE-LEVEL PARITY CHECK AND IT HAS A CEILING. It reads the SQL
 * text and asserts the same terms, weights and caps appear. It does NOT execute
 * PostgreSQL — that happens in the migration's own verification block, run
 * against a real server. What this catches is a change to one implementation
 * that was not made to the other, which is the way they will actually drift.
 */

const blank = (over: Partial<Deal> = {}): Partial<Deal> => ({
  meddpicc_score: 0,
  multi_threaded: false,
  decision_mapped: false,
  metrics_known: false,
  economic_buyer: null,
  decision_criteria: null,
  decision_process: null,
  identified_pain: null,
  champion: null,
  critical_event: null,
  days_in_stage: 5,
  ...over,
});

describe('the TypeScript and SQL health rules use the same terms', () => {
  it('every weight in the SQL function appears in the TypeScript one', async () => {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const fn = /create or replace function compute_health_score[\s\S]*?\$\$ language plpgsql/.exec(sql);
    expect(fn, 'compute_health_score was not found in schema.sql').toBeTruthy();

    const ts = await readFile('lib/deals.ts', 'utf8');
    const tsFn = /export function computeHealthScore[\s\S]*?\n\}/.exec(ts);
    expect(tsFn).toBeTruthy();

    // The six terms, by their weights. A weight changed on one side and not the
    // other is the drift this exists to catch.
    for (const weight of ['2.5', '2', '1.5', '1']) {
      expect(fn![0], `SQL is missing the ${weight} term`).toContain(weight);
      expect(tsFn![0], `TypeScript is missing the ${weight} term`).toContain(weight);
    }
  });

  it('both cap at 6 for multi-threading AND for the critical event', async () => {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const fn = /create or replace function compute_health_score[\s\S]*?\$\$ language plpgsql/.exec(sql)![0];

    // Two INDEPENDENT caps. One `least(6, …)` would be a single cap and the
    // difference is invisible in the output for a deal missing only one.
    expect([...fn.matchAll(/least\(6,/g)]).toHaveLength(2);

    const ts = await readFile('lib/deals.ts', 'utf8');
    const tsFn = /export function computeHealthScore[\s\S]*?\n\}/.exec(ts)![0];
    expect(tsFn).toContain('multi_threaded ? 10 : 6');
    expect(tsFn).toContain('hasCriticalEvent(deal) ? 10 : 6');
  });

  it('both floor at 1 and round to one decimal', async () => {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const fn = /create or replace function compute_health_score[\s\S]*?\$\$ language plpgsql/.exec(sql)![0];
    expect(fn).toContain('greatest(1, round(score, 1))');

    const ts = await readFile('lib/deals.ts', 'utf8');
    expect(ts).toContain('Math.max(1, Math.round(capped * 10) / 10)');
  });

  it('the MEDDPICC mirror counts the same eight pillars', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const fn = /create or replace function compute_meddpicc_score[\s\S]*?\$\$ language sql stable/.exec(sql);
    expect(fn, 'compute_meddpicc_score was not found').toBeTruthy();

    for (const pillar of [
      'metrics_known', 'economic_buyer', 'decision_criteria', 'decision_process',
      'identified_pain', 'champion', 'decision_mapped',
    ]) {
      expect(fn![0], `SQL mirror omits ${pillar}`).toContain(pillar);
    }
    // The 'C' pillar scores off the competitor SET, not the deprecated column —
    // backlog item 6. A SQL mirror reading `d.competition` would silently
    // reintroduce a defect that was closed.
    expect(fn![0]).toContain('deal_competitors');
    expect(fn![0]).not.toMatch(/d\.competition\b/);
  });
});

describe('the TypeScript rule, on the shapes that actually exist', () => {
  /**
   * ⚠️ THESE ARE THE LIVE PIPELINE'S SHAPES, not invented ones. Twenty of
   * twenty-one deals are a name, a vertical, a stage and nothing else — the
   * "1.5" case below is the entire book, and it was rendering as 3s and 4s.
   */
  it('a deal with only a stage scores 1.5, not 3', () => {
    expect(computeHealthScore(blank())).toBe(1.5);
  });

  it('a champion alone adds 1, and the MEDDPICC point adds 0.3 more', () => {
    // DEF-001's exact shape after the first fact was written: 2.8.
    expect(computeHealthScore(blank({ champion: 'Trevor Reitsma', meddpicc_score: 1 }))).toBe(2.8);
  });

  it('a stale deal loses the momentum term rather than gaining a penalty', () => {
    expect(computeHealthScore(blank({ days_in_stage: 45 }))).toBe(1);
    expect(computeHealthScore(blank({ days_in_stage: 90 }))).toBe(1);
  });

  it('never returns a whole number by accident often enough to look designed', () => {
    /**
     * The tell that exposed the whole defect: twenty-one stored scores, none
     * with a decimal, from a function that returns round(score, 1). This walks
     * the reachable space and records how rare that is.
     */
    const scores = new Set<number>();
    for (const meddpicc of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const mt of [false, true]) {
        for (const eb of [null, 'x']) {
          for (const dm of [false, true]) {
            for (const ch of [null, 'x']) {
              for (const ce of [null, 'x']) {
                for (const days of [5, 45, 90]) {
                  scores.add(
                    computeHealthScore(
                      blank({
                        meddpicc_score: meddpicc,
                        multi_threaded: mt,
                        economic_buyer: eb,
                        decision_mapped: dm,
                        champion: ch,
                        critical_event: ce,
                        days_in_stage: days,
                      }),
                    ),
                  );
                }
              }
            }
          }
        }
      }
    }
    const whole = [...scores].filter((s) => Number.isInteger(s));
    // Whole numbers are reachable — but they are a minority of the space, and
    // twenty-one rows landing on them exclusively is what should have been
    // impossible to believe.
    expect(whole.length).toBeGreaterThan(0);
    expect(whole.length / scores.size).toBeLessThan(0.5);
  });

  it('MEDDPICC counts pillars, and competition is unscored without a count', () => {
    expect(computeMeddpiccScore(blank())).toBe(0);
    expect(computeMeddpiccScore(blank({ champion: 'x' }))).toBe(1);
    // No competitor count supplied: the pillar is unscored, which adds nothing
    // — the same NUMBER the SQL mirror produces from a zero count.
    expect(computeMeddpiccScore(blank({ champion: 'x' }), null)).toBe(1);
    expect(computeMeddpiccScore(blank({ champion: 'x' }), 2)).toBe(2);
  });
});

describe('the migration verifies the re-score rather than the rule', () => {
  it('asserts stored equals computed on real rows', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('health_score is distinct from compute_health_score');
    expect(sql).toContain('meddpicc_score is distinct from compute_meddpicc_score');
  });

  it('treats an empty table as a FAIL, not a PASS', async () => {
    // Rule 10 in a new place: an assertion over zero rows proves nothing, and
    // reporting PASS for it is how a re-score migration ships having done
    // nothing at all.
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain("'FAIL — no rows, so this proves nothing'");
  });

  it('recomputes explicitly rather than relying on the trigger it repairs', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('update deals d set meddpicc_score = compute_meddpicc_score(d)');
    expect(sql).toContain('update deals d set health_score   = compute_health_score(d)');
    /**
     * ⚠️ COMMENTS STRIPPED FIRST, AND THAT IS THE THIRD TIME. The migration's
     * prose quotes `set updated_at = updated_at` while explaining why the
     * PREVIOUS migration's use of it was the defect — so the raw text contains
     * the string this asserts against. See tests/helpers/source.ts: a codebase
     * whose comments name the exact strings its tests search for will produce
     * this collision indefinitely unless they are removed first.
     */
    expect(codeOnly(sql, 'sql')).not.toContain('set updated_at = updated_at');
  });

  it('reads pg_trigger rather than information_schema', async () => {
    // information_schema.triggers HIDES disabled triggers, so "exists but
    // switched off" and "never created" look identical through it — and that
    // distinction is the diagnosis.
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('from pg_trigger');
    expect(sql).toContain('tgenabled');
  });

  it('rule 20 is written down where migrations get checked', async () => {
    const readme = await readFile('supabase/migrations/README.md', 'utf8');
    expect(readme).toContain('## 20. Verify the RE-SCORE, not the rule');
    expect(readme).toContain('all twenty');
  });
});

describe('the cap message distinguishes binding from inert', () => {
  /**
   * ⚠️ THE DEFECT: "capped at 6" rendered whenever the condition was absent,
   * including on the twenty deals computing 1.5 — where a cap at 6 holds
   * nothing down. Two different facts, one sentence.
   */
  it('a flat deal reports the cap as NOT binding', () => {
    const c = healthComposition(blank());
    expect(c.final).toBe(1.5);
    expect(c.caps).toHaveLength(2);
    expect(c.bindingCaps).toEqual([]);
    expect(healthSentence(blank())).not.toContain('held at');
  });

  it('a strong deal missing only a critical event reports it as binding', () => {
    const strong = blank({
      multi_threaded: true,
      economic_buyer: 'A. Buyer',
      decision_mapped: true,
      champion: 'A. Champion',
      meddpicc_score: 8,
    });
    const c = healthComposition(strong);
    expect(c.uncapped).toBeGreaterThan(6);
    expect(c.final).toBe(6);
    expect(c.bindingCaps.map((b) => b.key)).toEqual(['critical_event']);
    expect(healthSentence(strong)).toContain('held at 6');
  });

  it('the composition sums to the same number computeHealthScore returns', () => {
    // Rule: a third reading of the rule must not become a third ANSWER.
    for (const d of [
      blank(),
      blank({ champion: 'x', meddpicc_score: 1 }),
      blank({ multi_threaded: true, critical_event: 'x', meddpicc_score: 8, economic_buyer: 'x', decision_mapped: true, champion: 'x' }),
      blank({ days_in_stage: 45, multi_threaded: true, critical_event: 'x' }),
      blank({ meddpicc_score: 8, multi_threaded: true }),
    ]) {
      expect(healthComposition(d).final, JSON.stringify(d)).toBe(computeHealthScore(d));
    }
  });

  it('no surface still promises a cap it cannot know binds', async () => {
    for (const f of [
      'lib/deals.ts',
      'components/modules/deal-detail.tsx',
      'components/ui/deal-card.tsx',
      'lib/spine-export.ts',
    ]) {
      const src = codeOnly(await readFile(f, 'utf8'));
      expect(src, `${f} still says "capped at 6"`).not.toContain('capped at 6');
    }
  });
});

describe('nothing carries a THIRD implementation of either score', () => {
  /**
   * ⚠️ THE AUDIT THE OPERATOR ASKED FOR, AS AN ASSERTION. The defect was two
   * implementations of one score with last-writer-wins. A third would be the
   * same failure with more places to look, and the point of writing it down is
   * that "we checked once" decays and a test does not.
   */
  it('health is written only by computeHealthScore or the SQL trigger', async () => {
    const files = [
      'lib/seed-data.ts',
      'app/api/deals/route.ts',
      'app/api/deals/[id]/route.ts',
      'lib/health-composition.ts',
    ];
    for (const f of files) {
      const code = codeOnly(await readFile(f, 'utf8'));
      /*
        A literal assignment — `health_score: 3` — is the shape that produced
        this whole incident. The seed builder carried exactly that as a
        placeholder the return statement overwrote: never shipped, one refactor
        from shipping.
      */
      const literals = [...code.matchAll(/health_score:\s*(-?\d+(\.\d+)?)\b/g)];
      expect(literals.map((m) => m[0]), `${f} assigns a literal health_score`).toEqual([]);

      const meddpiccLiterals = [...code.matchAll(/meddpicc_score:\s*(-?\d+)\b/g)];
      expect(
        meddpiccLiterals.map((m) => m[0]),
        `${f} assigns a literal meddpicc_score`,
      ).toEqual([]);
    }
  });

  it('the edge functions only READ the scores', async () => {
    // They receive deals over PostgREST and act on them. A write here would be
    // a fourth path, outside both the TypeScript and the trigger.
    for (const f of ['supabase/functions/stall-alert/index.ts', 'supabase/functions/_shared/appState.ts']) {
      const code = codeOnly(await readFile(f, 'utf8'));
      expect(code, `${f} writes health_score`).not.toMatch(/health_score\s*[:=]\s*[^;\n]*compute/i);
      expect(code, `${f} assigns a literal health_score`).not.toMatch(/health_score:\s*-?\d/);
    }
  });

  it('the MEDDPICC "C" pillar is scored the same way in both implementations', async () => {
    /**
     * ⚠️ THE INTERACTION THE OPERATOR FLAGGED. Backlog item 6 moved the 'C'
     * pillar off the deprecated `deals.competition` text column and onto the
     * `deal_competitors` set. `compute_meddpicc_score` in SQL had to make the
     * same move or the two would score the same deal differently — which is the
     * two-implementations problem with a different column in it.
     */
    const ts = codeOnly(await readFile('lib/deals.ts', 'utf8'));
    const tsFn = /export function meddpiccResult[\s\S]*?\n\}/.exec(ts)![0];
    expect(tsFn).toContain('competitorCount');
    expect(tsFn, 'TypeScript scores the deprecated column').not.toMatch(/deal\.competition/);

    const sql = codeOnly(await readFile(MIGRATION, 'utf8'), 'sql');
    const sqlFn = /create or replace function compute_meddpicc_score[\s\S]*?language sql stable/.exec(sql)![0];
    expect(sqlFn).toContain('deal_competitors');
    expect(sqlFn, 'SQL scores the deprecated column').not.toMatch(/d\.competition\b/);
  });
});
