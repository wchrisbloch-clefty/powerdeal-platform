import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { terminalStageFor } from '@/lib/win-loss';
import { OUTCOME_TYPES, TERMINAL_STAGES, type DealStage } from '@/lib/types';

const MIGRATION = 'supabase/migrations/20260810_win_loss_verbatim.sql';

/**
 * WIN-LOSS — the close must be atomic.
 *
 * The defect this guards against, stated concretely: win_loss_log says the deal
 * was lost while deals.stage still says Discovery. Two records disagreeing
 * about the same fact, with no error raised — the outcome is logged and the
 * pipeline shows an open deal forever.
 *
 * Verified against a real PostgreSQL before shipping, including the negative
 * case. Reverting log_win_loss() to insert-only produced exactly that state and
 * the migration's own verification block raised:
 *
 *   ERROR: FAIL: outcome logged but deal stage is Discovery, not Archived
 */

describe('terminal stage is derived, never chosen', () => {
  it('maps Won to Closed-Won', () => {
    expect(terminalStageFor('Won')).toBe('Closed-Won');
  });

  it('maps every non-Won outcome to Archived', () => {
    for (const o of OUTCOME_TYPES.filter((x) => x !== 'Won')) {
      expect(terminalStageFor(o)).toBe('Archived');
    }
  });

  it('always lands on a stage the rest of the app treats as terminal', () => {
    // Guards a subtle break: renaming a stage without updating this mapping
    // would close deals into a stage that stall detection still considers live,
    // so a closed deal would keep accruing days_in_stage and alerting.
    for (const o of OUTCOME_TYPES) {
      expect(TERMINAL_STAGES).toContain(terminalStageFor(o) as DealStage);
    }
  });

  it('covers every outcome type — a new one cannot slip through untyped', () => {
    for (const o of OUTCOME_TYPES) {
      expect(['Closed-Won', 'Archived']).toContain(terminalStageFor(o));
    }
  });
});

describe('the migration keeps both writes in one transaction', () => {
  it('sets the stage inside the same function that inserts the outcome', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const fn = sql.slice(
      sql.indexOf('create or replace function log_win_loss'),
      sql.indexOf('$$ language plpgsql;'),
    );
    expect(fn).toContain('insert into win_loss_log');
    expect(fn).toContain('update deals set stage');
  });

  it('derives the stage in SQL rather than accepting it as a parameter', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const signature = sql.slice(
      sql.indexOf('create or replace function log_win_loss'),
      sql.indexOf('returns win_loss_log'),
    );
    // A p_stage parameter would let a caller log a loss and leave the deal
    // open — the same disagreement, one argument apart.
    expect(signature).not.toMatch(/p_stage/);
    expect(sql).toContain("case when p_outcome_type = 'Won' then 'Closed-Won' else 'Archived' end");
  });

  it('rejects an outcome type outside the enum', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain("raise exception 'Invalid outcome_type");
  });

  it('is idempotent on every creating statement', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const adds = sql.match(/alter table win_loss_log add column/g) ?? [];
    const guarded = sql.match(/alter table win_loss_log add column if not exists/g) ?? [];
    expect(adds).toHaveLength(guarded.length);
    const idx = sql.match(/create index /g) ?? [];
    const idxGuarded = sql.match(/create index if not exists /g) ?? [];
    expect(idx).toHaveLength(idxGuarded.length);
  });

  it('ships a behavioural verification, not only structural checks', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    // Structural checks alone pass on a function that never touches the stage —
    // demonstrated: reverting to insert-only left two of three structural
    // checks green.
    expect(sql).toContain('prove the close is actually atomic');
    expect(sql).toContain('FAIL: outcome logged but deal stage is');
    expect(sql).toContain('delete from deals where id = v_deal');
  });

  it('carries the verbatim through the function', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('p_buyer_verbatim');
    expect(sql).toContain('buyer_verbatim');
  });
});

describe('schema.sql and the migration agree', () => {
  it('both declare buyer_verbatim', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain('buyer_verbatim  text');
  });
});
