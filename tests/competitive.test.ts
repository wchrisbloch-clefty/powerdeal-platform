import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { COMPETITOR_TIERS, TIER_LABELS, type DealCompetitor } from '@/lib/types';

const MIGRATION = 'supabase/migrations/20260810_deal_competitors.sql';

/**
 * PER-DEAL COMPETITIVE STATE.
 *
 * The trap being avoided: testing multi-posture with one competitor, which
 * proves a list can hold an item and nothing about whether the model supports
 * incompatible simultaneous arguments. Every fixture here carries three.
 */

function competitor(over: Partial<DealCompetitor>): DealCompetitor {
  return {
    id: over.id ?? 'c1',
    deal_id: 'd1',
    competitor: over.competitor ?? 'The Grid',
    tier: over.tier ?? 'tier-1',
    posture: over.posture ?? null,
    what_was_said: over.what_was_said ?? null,
    what_landed: over.what_landed ?? null,
    status: over.status ?? 'active',
    created_at: '2026-08-10T00:00:00Z',
    updated_at: '2026-08-10T00:00:00Z',
    user_id: null,
    ...over,
  };
}

/** Williams-shaped: grid, combustion and an integrator in one deal. */
function threePostures(): DealCompetitor[] {
  return [
    competitor({ id: 'c1', competitor: 'The Grid', tier: 'tier-1' }),
    competitor({ id: 'c2', competitor: 'Wartsila recip', tier: 'tier-1' }),
    competitor({ id: 'c3', competitor: 'Packaged integrator', tier: 'integrator' }),
  ];
}

describe('posture is a set, not a value', () => {
  it('carries three incompatible postures in one deal', async () => {
    const { postures } = await import('@/lib/competitive');
    const p = postures(threePostures());
    // Three recorded plus do-nothing.
    expect(p).toHaveLength(4);
    expect(p.filter((x) => x.recorded)).toHaveLength(3);
  });

  it('spans more than one tier — a single-tier fixture would prove nothing', () => {
    const tiers = new Set(threePostures().map((c) => c.tier));
    expect(tiers.size).toBeGreaterThan(1);
  });

  it('excludes eliminated competitors from the live posture set', async () => {
    const { postures } = await import('@/lib/competitive');
    const withDead = [
      ...threePostures(),
      competitor({ id: 'c4', competitor: 'Battery', tier: 'tier-2', status: 'eliminated' }),
    ];
    expect(postures(withDead).map((p) => p.competitor)).not.toContain('Battery');
  });
});

describe('do-nothing is always present', () => {
  it('appears even when the deal has no recorded competitors', async () => {
    const { postures } = await import('@/lib/competitive');
    const p = postures([]);
    expect(p).toHaveLength(1);
    expect(p[0].competitor).toBe('Do nothing');
  });

  it('is marked unrecorded, so the UI can say it was never entered', async () => {
    const { postures } = await import('@/lib/competitive');
    expect(postures(threePostures()).find((p) => p.key === 'no-decision')?.recorded).toBe(false);
  });

  it('is not stored as a row — it is a condition, not an entry', async () => {
    const src = await readFile('lib/competitive.ts', 'utf8');
    // Storing it would make a permanent condition look optional.
    expect(src).toContain('deliberately NOT stored as a row');
  });
});

describe('every card names the postures it is not addressing', () => {
  it('lists the others, including do-nothing', async () => {
    const { otherPostures } = await import('@/lib/competitive');
    const others = otherPostures(threePostures(), 'c1');
    expect(others).toContain('Do nothing');
    expect(others).toContain('Wartsila recip');
    expect(others).toContain('Packaged integrator');
    expect(others).not.toContain('The Grid');
  });

  it('still names the others when the current card IS do-nothing', async () => {
    const { otherPostures } = await import('@/lib/competitive');
    const others = otherPostures(threePostures(), 'no-decision');
    expect(others).toHaveLength(3);
    expect(others).not.toContain('Do nothing');
  });
});

describe('tiers track the doctrine', () => {
  it('every tier has a label', () => {
    for (const t of COMPETITOR_TIERS) {
      expect(TIER_LABELS[t]).toBeTruthy();
    }
  });

  it('the three doctrine tiers exist in the system prompt', async () => {
    const prompt = await readFile('prompts/powerdeal-v3.1.8-system-prompt.md', 'utf8');
    expect(prompt).toContain('TIER 1 — PRIMARY');
    expect(prompt).toContain('TIER 2 — SECONDARY');
    expect(prompt).toContain('TIER 3 — TERTIARY');
  });

  /**
   * Deliberately asserts a GAP, not a property.
   *
   * The integrator category was moved out of code and into the methodology and
   * has not landed there. A card generated against this tier has no framing to
   * draw on. When the prompt gains the fourth category this test FAILS, which
   * is the signal to delete it and the warning comments beside it.
   */
  it('integrator has no doctrine yet — this failing is the good outcome', async () => {
    const prompt = await readFile('prompts/powerdeal-v3.1.8-system-prompt.md', 'utf8');
    expect(prompt).not.toMatch(/TIER 1B|TIER 4|INTEGRATOR —/i);
  });
});

describe('the migration', () => {
  it('constrains tier to the declared set', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    for (const t of COMPETITOR_TIERS) expect(sql).toContain(`'${t}'`);
    expect(sql).toContain('check (tier in');
  });

  it('enforces one row per competitor per deal', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('unique (deal_id, competitor)');
  });

  it('cascades so competitors cannot outlive their deal', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('references deals(id) on delete cascade');
  });

  it('is idempotent', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('create table if not exists deal_competitors');
    const idx = sql.match(/create index /g) ?? [];
    const guarded = sql.match(/create index if not exists /g) ?? [];
    expect(idx).toHaveLength(guarded.length);
  });

  it('ships a behavioural verification that exercises the constraints', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    // Structural checks alone pass on a table with no unique constraint.
    expect(sql).toContain('FAIL: duplicate competitor was accepted');
    expect(sql).toContain('FAIL: an undefined tier was accepted');
    expect(sql).toContain('competitors on one deal');
  });
});

describe('schema.sql carries the table too', () => {
  it('a fresh instance gets deal_competitors without the migration', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain('create table if not exists deal_competitors');
  });
});
