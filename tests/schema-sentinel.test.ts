import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { SCHEMA_REVISION, readSentinel } from '@/lib/schema-revision';
import { codeOnly } from './helpers/source';

const SCHEMA = 'supabase/schema.sql';
const SCHEDULE = 'supabase/functions/schedule.sql';
const INVENTORY = 'supabase/migrations/20260823_schema_sentinel.sql';

/**
 * ═══════════════════════════════════════════════════════════════
 * "IT RAN" AND "IT RAN TO COMPLETION" WERE THE SAME OBSERVATION.
 * ═══════════════════════════════════════════════════════════════
 *
 * The live database held ONE of the three triggers schema.sql declares. The
 * missing one was `deals_health_score`, which is why twenty-one stored health
 * scores were hand-written values no function had ever produced — found five
 * weeks later, from the opposite end, by noticing none of them had a decimal.
 */

describe('the guard is in the file whose work needs it', () => {
  it('schema.sql only NOTICES about the extensions', async () => {
    const sql = await readFile(SCHEMA, 'utf8');
    const guard = /unnest\(array\['pg_cron', 'pg_net'\]\)[\s\S]*?end \$\$;/.exec(sql);
    expect(guard, 'the extension check was not found in schema.sql').toBeTruthy();
    expect(guard![0]).toContain('raise notice');
    /*
      ⚠️ THE WHOLE POINT. `raise exception` here aborts at line 54, above every
      table, function and trigger the file declares — and eight later commits'
      worth of changes with them.
    */
    expect(guard![0]).not.toContain('raise exception');
  });

  it('schedule.sql REFUSES without them', async () => {
    const sql = await readFile(SCHEDULE, 'utf8');
    const guard = /unnest\(array\['pg_cron', 'pg_net'\]\)[\s\S]*?end \$\$;/.exec(sql);
    expect(guard, 'the extension check is not in schedule.sql').toBeTruthy();
    expect(guard![0]).toContain('raise exception');
  });

  it('and schema.sql declares no cron job of its own to justify the old guard', async () => {
    // If schema.sql itself used cron.schedule, aborting there would have been
    // defensible. It does not, which is what made the old placement wrong.
    const sql = codeOnly(await readFile(SCHEMA, 'utf8'), 'sql');
    expect(sql).not.toContain('cron.schedule');
  });
});

describe('the sentinel is the last statement and records a revision', () => {
  it('schema.sql ends with the sentinel', async () => {
    const sql = await readFile(SCHEMA, 'utf8');
    const at = sql.lastIndexOf('create or replace function schema_applied_through');
    expect(at, 'the sentinel is not in schema.sql').toBeGreaterThan(0);

    /*
      ⚠️ NOTHING EXECUTABLE MAY FOLLOW IT. A statement after the sentinel would
      be claimed as applied by a sentinel written before it ran — worse than
      having no sentinel, because it would report completion falsely.
    */
    const after = codeOnly(sql.slice(at), 'sql');
    const statements = after.split(';').filter((s) => s.trim().length > 0);
    // The sentinel itself, plus its `comment on`. Nothing else.
    expect(statements).toHaveLength(2);
    expect(statements[1]).toContain('comment on function schema_applied_through');
  });

  it('the revision in schema.sql matches SCHEMA_REVISION', async () => {
    /**
     * ⚠️ A BUMP IN ONE PLACE AND NOT THE OTHER would make the drift check
     * report "behind" on a current database — and a check that cries wolf is
     * one a reader learns to ignore, which is the same failure as a flaky gate.
     */
    const sql = await readFile(SCHEMA, 'utf8');
    const literal = /function schema_applied_through\(\)\s*\nreturns integer as \$\$ select (\d+) \$\$/.exec(sql);
    expect(literal, 'could not parse the revision out of schema.sql').toBeTruthy();
    expect(Number(literal![1])).toBe(SCHEMA_REVISION);
  });

  it('the migration installs the same revision', async () => {
    const sql = await readFile(INVENTORY, 'utf8');
    const literal = /function schema_applied_through\(\)\s*\nreturns integer as \$\$ select (\d+) \$\$/.exec(sql);
    expect(literal).toBeTruthy();
    expect(Number(literal![1])).toBe(SCHEMA_REVISION);
  });
});

describe('never-completed is its own state', () => {
  it('an absent sentinel is NOT "behind"', () => {
    // "Behind by some revisions" and "stopped partway, we do not know where"
    // call for different actions: re-run the file, versus find what aborted it
    // — because re-running will abort in the same place.
    const s = readSentinel(null);
    expect(s.state).toBe('never-completed');
    expect(s.detail).toContain('never run to completion');
    expect(s.detail).toContain('20260823_schema_sentinel.sql');
  });

  it('reports current, behind and ahead distinctly', () => {
    expect(readSentinel(SCHEMA_REVISION).state).toBe('current');
    expect(readSentinel(SCHEMA_REVISION - 1).state).toBe('behind');
    // Ahead is a rollback, not an error — reported rather than swallowed.
    expect(readSentinel(SCHEMA_REVISION + 1).state).toBe('ahead');
  });

  it('every state carries a detail a reader can act on', () => {
    for (const applied of [null, SCHEMA_REVISION, SCHEMA_REVISION - 1, SCHEMA_REVISION + 1]) {
      expect(readSentinel(applied).detail.length).toBeGreaterThan(30);
    }
  });
});

describe('the inventory counts stay in step with the schema', () => {
  /**
   * ⚠️ THE INVENTORY HARDCODES ITS EXPECTED COUNTS AND WILL GO STALE. It runs
   * in a SQL editor with no file access, so it cannot derive them from
   * schema.sql. This is the check that catches the staleness in CI rather than
   * leaving it to a reader who assumed the numbers were maintained.
   */
  it('the table count matches what schema.sql declares', async () => {
    const sql = await readFile(SCHEMA, 'utf8');
    const declared = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(10);

    const inv = await readFile(INVENTORY, 'utf8');
    const expected = /count\(\*\)::text \|\| ' of (\d+)' as observed/.exec(inv);
    expect(expected, 'could not parse the table count from the inventory').toBeTruthy();
    expect(Number(expected![1])).toBe(declared.length);
  });

  it('and every declared table is named in the inventory list', async () => {
    const sql = await readFile(SCHEMA, 'utf8');
    const declared = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
    const inv = await readFile(INVENTORY, 'utf8');
    for (const t of declared) {
      expect(inv, `the inventory omits ${t}`).toContain(`'${t}'`);
    }
  });

  it('the inventory names the exact triggers schema.sql declares', async () => {
    /**
     * ⚠️ BY NAME, BECAUSE THE COUNT WAS WRONG ON ITS FIRST FRESH RUN. The
     * inventory counted every trigger on `deals` and reported "4 of 3" —
     * migration 20260821 adds `deals_field_history`. A count is satisfied by
     * the wrong set as easily as the right one: three triggers of which one is
     * unrelated reads identically to the three this file declares.
     */
    const sql = await readFile(SCHEMA, 'utf8');
    const declared = [...sql.matchAll(/create trigger (\w+) before [\w\s]*on deals/g)].map(
      (m) => m[1],
    );
    expect(declared).toHaveLength(3);

    const inv = await readFile(INVENTORY, 'utf8');
    for (const name of declared) {
      expect(inv, `the inventory omits the trigger ${name}`).toContain(`'${name}'`);
    }
    // And it must not be counting indiscriminately any more.
    expect(inv).not.toMatch(/tgrelid = 'deals'::regclass and not tgisinternal/);
  });

  it('and NO migration reaches a verdict from an unnamed trigger count', async () => {
    /**
     * ⚠️ THE SAME DEFECT WAS ALSO IN §0 OF 20260822 — the block that produced
     * the "1 of 3" reading this whole repair started from. It counted every
     * non-internal trigger on `deals`, which includes `deals_field_history`
     * from 20260821. So "1 of 3" could have been one of schema.sql's three, or
     * ZERO of them plus the unrelated one, and those are different findings.
     *
     * Fixing the one instance is not the same as the pattern not recurring, so
     * this asserts over every migration rather than over the file that had it.
     * `not tgisinternal` is still allowed where it feeds an INFORMATIONAL
     * listing — what may not happen is a verdict resting on the count.
     */
    const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(5);

    for (const f of files) {
      const sql = codeOnly(await readFile(`supabase/migrations/${f}`, 'utf8'), 'sql');
      const blocks = sql.split(/\bunion all\b/i);
      for (const b of blocks) {
        if (!/not tgisinternal/.test(b)) continue;
        expect(
          /'informational'/.test(b) || /tgname not in \(/.test(b),
          `${f} reaches a verdict from a trigger count that names nothing`,
        ).toBe(true);
      }
    }
  });
});

describe('re-running schema.sql cannot undo a migration', () => {
  /**
   * ═══════════════════════════════════════════════════════════════
   * A REPAIR INSTRUCTION THAT DAMAGES.
   * ═══════════════════════════════════════════════════════════════
   *
   * The remedy for a half-applied schema is "re-run schema.sql". That is only
   * safe if the file carries the CURRENT definition of everything a migration
   * has since changed.
   *
   * 20260822 replaced `deals_set_health` with a version that maintains
   * meddpicc_score as well as health_score. schema.sql still held the old
   * one-line version — so re-running it, on the advice this repo was about to
   * give, would silently revert that migration. `meddpicc_score` would stop
   * being maintained: the number keeps updating and stops being right, which
   * is the exact defect the migration existed to fix, reintroduced by the fix
   * for a different one.
   *
   * Caught by reading what the recommendation would actually do, before
   * sending it.
   */
  /**
   * ⚠️ indexOf RATHER THAN A REGEX, because the first version's escaping was
   * mangled on the way into the file and it reported "deals_set_health was not
   * found" about a function that is plainly there. A matcher that fails to
   * match reads exactly like the defect it was written to catch.
   */
  const bodyOf = (sql: string, name: string): string => {
    const head = `create or replace function ${name}()`;
    const at = sql.indexOf(head);
    expect(at, `${name} was not found`).toBeGreaterThan(-1);
    const end = sql.indexOf('$$ language', at);
    expect(end, `${name} has no terminator`).toBeGreaterThan(at);
    return sql.slice(at, end).replace(/\s+/g, ' ').trim();
  };

  it('schema.sql and the migration define deals_set_health identically', async () => {
    const schema = await readFile(SCHEMA, 'utf8');
    const migration = await readFile(
      'supabase/migrations/20260822_health_recompute.sql',
      'utf8',
    );
    expect(bodyOf(schema, 'deals_set_health')).toBe(bodyOf(migration, 'deals_set_health'));
  });

  it('and schema.sql carries compute_meddpicc_score at all', async () => {
    const schema = await readFile(SCHEMA, 'utf8');
    expect(schema).toContain('create or replace function compute_meddpicc_score');
    // Order is load-bearing inside the trigger; assert it here too, because a
    // reversed pair computes health from the previous MEDDPICC score and
    // nothing anywhere says so.
    const fn = bodyOf(schema, 'deals_set_health');
    expect(fn.indexOf('meddpicc_score')).toBeLessThan(fn.indexOf('health_score :='));
  });

  it('the inventory counts the function the migration added', async () => {
    const inv = await readFile(INVENTORY, 'utf8');
    expect(inv).toContain("'compute_meddpicc_score'");
  });
});
