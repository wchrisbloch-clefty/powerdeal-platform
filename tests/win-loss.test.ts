import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { terminalStageFor } from '@/lib/win-loss';
import { OUTCOME_TYPES, TERMINAL_STAGES, type DealStage, type WinLossEntry } from '@/lib/types';

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

/**
 * ═══════════════════════════════════════════════════════════════
 * `Archived` COLLAPSES THREE DIFFERENT LOSSES.
 * ═══════════════════════════════════════════════════════════════
 *
 * The collapse itself is correct — DEAL_STAGES has no lost stage and
 * `win_loss_log.outcome_type` preserves the distinction. What was missing was
 * the join that reads it back, which matters because the doctrine gives the
 * three different cures: a no-decision needs a forcing function, a competitive
 * loss needs a different argument, a disqualification needs better
 * qualification earlier. `Archived` prescribes none of them.
 */
describe('an archived deal says WHICH loss it was', () => {
  const entry = (over: Partial<WinLossEntry> = {}): WinLossEntry =>
    ({
      id: 'w1',
      deal_id: 'd1',
      company: 'Acme',
      outcome_type: 'No-Decision',
      reason: null,
      lesson: null,
      competitor_won: null,
      revisit_trigger: null,
      closed_at: '2026-08-01T00:00:00Z',
      ...over,
    }) as WinLossEntry;

  it('names the outcome the stage cannot', async () => {
    const { archivedOutcome } = await import('@/lib/win-loss');
    expect(archivedOutcome('d1', [entry({ outcome_type: 'Competitive' })]).label).toBe(
      'Archived — Competitive',
    );
  });

  it('carries the doctrine cure for THAT loss, and they differ', async () => {
    const { archivedOutcome } = await import('@/lib/win-loss');
    const nd = archivedOutcome('d1', [entry({ outcome_type: 'No-Decision' })]).cure!;
    const comp = archivedOutcome('d1', [entry({ outcome_type: 'Competitive' })]).cure!;
    const dq = archivedOutcome('d1', [entry({ outcome_type: 'Disqualified' })]).cure!;

    expect(nd).toContain('forcing function');
    expect(comp).toContain('different argument');
    expect(dq).toContain('qualification earlier');
    // Three distinct cures, not one sentence with the category substituted in.
    expect(new Set([nd, comp, dq]).size).toBe(3);
  });

  it('a Won deal is not "Archived" and has no cure', async () => {
    const { archivedOutcome } = await import('@/lib/win-loss');
    const r = archivedOutcome('d1', [entry({ outcome_type: 'Won' })]);
    expect(r.label).toBe('Won');
    expect(r.cure).toBeNull();
  });

  it('a deal with NO log row returns null, never a guessed outcome', async () => {
    // An archived deal moved by hand has no recorded outcome. Inventing the
    // most common one would put a fabricated cure in front of a rep.
    const { archivedOutcome } = await import('@/lib/win-loss');
    const r = archivedOutcome('missing', [entry()]);
    expect(r.outcome).toBeNull();
    expect(r.cure).toBeNull();
    expect(r.label).toContain('not recorded');
  });

  it('a reopened-and-reclosed deal reports its LATEST outcome', async () => {
    const { archivedOutcome } = await import('@/lib/win-loss');
    const r = archivedOutcome('d1', [
      entry({ id: 'old', outcome_type: 'No-Decision', closed_at: '2026-01-01T00:00:00Z' }),
      entry({ id: 'new', outcome_type: 'Won', closed_at: '2026-08-01T00:00:00Z' }),
    ]);
    expect(r.outcome).toBe('Won');
  });

  it('indexes by deal so a table does not rescan per row', async () => {
    const { outcomesByDeal } = await import('@/lib/win-loss');
    const map = outcomesByDeal([
      entry({ deal_id: 'd1', outcome_type: 'Competitive' }),
      entry({ deal_id: 'd2', outcome_type: 'Disqualified' }),
    ]);
    expect(map.get('d1')!.outcome).toBe('Competitive');
    expect(map.get('d2')!.outcome).toBe('Disqualified');
    expect(map.has('d3')).toBe(false);
  });

  it('a log row with a null deal_id does not become a map key', async () => {
    const { outcomesByDeal } = await import('@/lib/win-loss');
    expect(outcomesByDeal([entry({ deal_id: null })]).size).toBe(0);
  });

  it('an empty log produces an empty index rather than throwing', async () => {
    const { outcomesByDeal } = await import('@/lib/win-loss');
    expect(outcomesByDeal([]).size).toBe(0);
  });
});
