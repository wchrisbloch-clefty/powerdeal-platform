import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CATALOG, CATALOG_BY_KEY, cardControls, gridCompetitorName, gridNameIsGeneric,
  gridNameGap, otherPostureNames, presenceGrid, presenceWrite,
} from '@/lib/competitor-catalog';
import { COMPETITOR_TIERS, TIER_LABELS, type DealCompetitor } from '@/lib/types';

const MIGRATION = 'supabase/migrations/20260810_deal_competitors.sql';

/**
 * PER-DEAL COMPETITIVE STATE, entered as a toggle grid.
 *
 * Two traps are being avoided here.
 *
 * The first: testing multi-posture with one competitor, which proves a list can
 * hold an item and nothing about whether the model supports incompatible
 * simultaneous arguments. The Williams-shaped fixture carries three.
 *
 * The second, and the one this build keeps re-learning: a check that can only
 * fail in one direction. "The grid is on" passes on a grid that is on because
 * everything is on, so the defaults are asserted as a SET — what is on and what
 * is off, together — and every toggle is exercised in both directions.
 */

function competitor(over: Partial<DealCompetitor>): DealCompetitor {
  return {
    id: over.id ?? 'c1',
    deal_id: 'd1',
    competitor: over.competitor ?? 'Grid supply',
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

const WILLIAMS = { utility: 'CenterPoint' };
const MULTI = { utility: 'multi' };

const on = (deal: { utility: string | null }, cs: DealCompetitor[] = []) =>
  presenceGrid(deal, cs).filter((r) => r.on).map((r) => r.key);

const entry = (key: string) => CATALOG_BY_KEY.get(key)!;

describe('the zero-click state is already right for the common deal', () => {
  it('turns on exactly do-nothing and the grid, and nothing else', () => {
    // Asserted as a whole set. Checking only that the grid is on would pass
    // just as well on a grid where every competitor defaulted to on.
    expect(on(WILLIAMS)).toEqual(['no-decision', 'grid']);
  });

  it('leaves combustion off — the default is the common case, not the union', () => {
    const rows = presenceGrid(WILLIAMS, []);
    expect(rows.find((r) => r.key === 'turbines')?.on).toBe(false);
    expect(rows.find((r) => r.key === 'recips')?.on).toBe(false);
  });

  it('shows combustion at the top level anyway — it is the other Tier 1 enemy', () => {
    const top = presenceGrid(WILLIAMS, []).filter((r) => r.topLevel).map((r) => r.key);
    expect(top).toEqual(['no-decision', 'grid', 'turbines', 'recips', 'tier-1b']);
  });

  it('collapses only the situational tiers', () => {
    const collapsed = CATALOG.filter((e) => !e.topLevel).map((e) => e.tier);
    expect(new Set(collapsed)).toEqual(new Set(['tier-2', 'tier-3']));
  });

  it('keeps Tier 1B at the top level — it dominates data-center deals', () => {
    // Burying the most likely opponent in the fastest-growing segment behind
    // a disclosure would make it the one competitor nobody switches on.
    const row = presenceGrid(WILLIAMS, []).find((r) => r.key === 'tier-1b');
    expect(row?.topLevel).toBe(true);
    expect(row?.on).toBe(false);
  });

  it('has no Bloom row in any state — Bloom is aligned, not a competitor', () => {
    expect(CATALOG.some((e) => /bloom/i.test(e.name))).toBe(false);
  });
});

describe('do-nothing is a condition, not a choice', () => {
  it('is on with an empty record', () => {
    expect(presenceGrid(MULTI, []).find((r) => r.key === 'no-decision')?.on).toBe(true);
  });

  it('cannot be switched off', () => {
    expect(presenceGrid(MULTI, []).find((r) => r.key === 'no-decision')?.toggleable).toBe(false);
  });

  it('is not stored as a row — storing it would make it look optional', async () => {
    const src = await readFile('lib/competitive.ts', 'utf8');
    expect(src).toContain('deliberately NOT stored as');
  });

  it('carries the one posture that is doctrine rather than a per-deal fact', () => {
    expect(CATALOG_BY_KEY.get('no-decision')?.posture).toMatch(/compounding cost/);
  });
});

describe('the grid is on by default and absence means present', () => {
  it('is on with no row at all', () => {
    expect(presenceGrid(WILLIAMS, []).find((r) => r.key === 'grid')?.on).toBe(true);
  });

  it('goes off when a not-present row exists', () => {
    const rows = presenceGrid(WILLIAMS, [
      competitor({ competitor: 'Grid supply', status: 'not-present' }),
    ]);
    expect(rows.find((r) => r.key === 'grid')?.on).toBe(false);
    // And the rest of the grid is unaffected — a toggle is not a reset.
    expect(rows.find((r) => r.key === 'no-decision')?.on).toBe(true);
  });

  it('switching it off writes a row rather than deleting one', () => {
    expect(presenceWrite(entry('grid'), false, null)).toEqual({
      action: 'upsert',
      status: 'not-present',
    });
  });

  it('switching it back on DELETES the row, restoring the true default', () => {
    // Not "upsert active". Storing the default as data makes an empty table
    // indistinguishable from an unconfigured one.
    const stored = competitor({ competitor: 'Grid supply', status: 'not-present' });
    expect(presenceWrite(entry('grid'), true, stored)).toEqual({ action: 'delete' });
  });

  it('is a no-op when already at its default with nothing stored', () => {
    expect(presenceWrite(entry('grid'), true, null)).toEqual({ action: 'none' });
  });
});

describe('everything else is off by default', () => {
  it('switching on writes an active row', () => {
    expect(presenceWrite(entry('turbines'), true, null)).toEqual({
      action: 'upsert',
      status: 'active',
    });
  });

  it('switching off again deletes it when nothing was recorded', () => {
    const stored = competitor({ id: 'c9', competitor: 'Wind', tier: 'tier-2' });
    expect(presenceWrite(entry('wind'), false, stored)).toEqual({ action: 'delete' });
  });

  it('an active row turns its catalog entry on', () => {
    const rows = presenceGrid(WILLIAMS, [
      competitor({ id: 'c2', competitor: 'Batteries / storage', tier: 'tier-2' }),
    ]);
    expect(rows.find((r) => r.key === 'battery')?.on).toBe(true);
  });
});

describe('two seconds of toggling cannot destroy a recorded posture', () => {
  it('switching off a row WITH detail preserves it as not-present', () => {
    const stored = competitor({
      id: 'c3',
      competitor: 'Combustion turbines (GE LM / Solar)',
      posture: 'Heat rate degrades at part load and the permit runs 14 months.',
    });
    expect(presenceWrite(entry('turbines'), false, stored)).toEqual({
      action: 'upsert',
      status: 'not-present',
    });
  });

  it('the same is true for a buyer verbatim', () => {
    const stored = competitor({
      id: 'c4',
      competitor: 'Wind',
      tier: 'tier-2',
      what_was_said: 'Their siting study came back at 30 months.',
    });
    expect(presenceWrite(entry('wind'), false, stored)).not.toEqual({ action: 'delete' });
  });

  it('and for what landed — the compounding half', () => {
    const stored = competitor({
      id: 'c5',
      competitor: 'Grid supply',
      what_landed: 'The 4CP exposure number moved them.',
    });
    // Back to its default, but detail exists, so the row stays.
    expect(presenceWrite(entry('grid'), true, stored)).toEqual({
      action: 'upsert',
      status: 'active',
    });
  });
});

describe('the grid is named from the record, and identity is not the name', () => {
  it('uses the utility when the record has one', () => {
    expect(gridCompetitorName({ utility: 'CenterPoint' })).toBe('CenterPoint');
  });

  it('falls back to "the grid" for the multi-territory placeholder', () => {
    // 13 of 21 deals carry 'multi'. Without this the majority of the book
    // would produce cards titled "pricing defense vs. multi".
    expect(gridCompetitorName({ utility: 'multi' })).toBe('the grid');
    expect(gridNameIsGeneric({ utility: 'multi' })).toBe(true);
  });

  it('falls back when the field is empty or missing', () => {
    expect(gridCompetitorName({ utility: '' })).toBe('the grid');
    expect(gridCompetitorName({ utility: null })).toBe('the grid');
    expect(gridCompetitorName({ utility: '  ' })).toBe('the grid');
  });

  it('declines an ISO rather than naming it as the counterparty', () => {
    // Two deals carry ERCOT. It is a market operator — it bills nobody, and a
    // BTM project displaces no ERCOT charge. Naming it would put a
    // counterparty on a customer-facing card that does not sell them power.
    expect(gridCompetitorName({ utility: 'ERCOT' })).toBe('the grid');
  });

  it('and does NOT autocorrect the ISO into a utility', () => {
    // Which TDU serves a given site is a fact about the site. Guessing Oncor
    // or CenterPoint from "ERCOT" would fabricate a counterparty; the guard
    // detects and declines, and the gap says why.
    expect(gridNameGap({ utility: 'ERCOT' })).toMatch(/market operator/);
    expect(gridNameGap({ utility: 'ERCOT' })).toMatch(/not inferred/);
  });

  it('prefers the beachhead site over the account-level field', () => {
    // A national account's Utility Territory describes the company; the
    // beachhead is where the electrons and the tariff actually are.
    expect(
      gridCompetitorName({ utility: 'multi', beachhead_utility: 'CenterPoint' }),
    ).toBe('CenterPoint');
  });

  it('falls through to the account level when the site has none', () => {
    expect(gridCompetitorName({ utility: 'PG&E', beachhead_utility: null })).toBe('PG&E');
  });

  it('falls through past an ISO at site level to a real account-level name', () => {
    expect(
      gridCompetitorName({ utility: 'CenterPoint', beachhead_utility: 'ERCOT' }),
    ).toBe('CenterPoint');
  });

  it('keeps a switched-off grid switched off when the utility is renamed', () => {
    // The failure this prevents: storing the row under the display name, then
    // the Spine's Utility Territory changes and the row is orphaned — the grid
    // silently turns itself back on with nothing saying it moved.
    const off = [competitor({ competitor: 'Grid supply', status: 'not-present' })];
    expect(presenceGrid({ utility: 'CenterPoint' }, off).find((r) => r.key === 'grid')?.on).toBe(false);
    expect(presenceGrid({ utility: 'PG&E' }, off).find((r) => r.key === 'grid')?.on).toBe(false);
    expect(presenceGrid({ utility: 'multi' }, off).find((r) => r.key === 'grid')?.on).toBe(false);
  });

  it('relabels the same row when the utility changes', () => {
    const label = (u: string) =>
      presenceGrid({ utility: u }, []).find((r) => r.key === 'grid')!.label;
    expect(label('CenterPoint')).toBe('CenterPoint');
    expect(label('PG&E')).toBe('PG&E');
    expect(label('multi')).toBe('the grid');
  });
});

describe('posture is a set — a Williams-shaped deal holds three at once', () => {
  const williams = [
    competitor({ id: 'c1', competitor: 'Reciprocating engines (Wärtsilä / INNIO / CAT)' }),
    competitor({ id: 'c2', competitor: 'Packaged integrator', tier: 'tier-1b' }),
  ];

  it('carries grid, combustion and integrator simultaneously', () => {
    expect(on(WILLIAMS, williams)).toEqual(['no-decision', 'grid', 'recips', 'tier-1b']);
  });

  it('spans more than one tier — a single-tier fixture would prove nothing', () => {
    const tiers = new Set(
      presenceGrid(WILLIAMS, williams).filter((r) => r.on).map((r) => r.tier),
    );
    expect(tiers.size).toBeGreaterThan(1);
  });

  it('drops an eliminated competitor from the live set', () => {
    const withDead = [
      ...williams,
      competitor({ id: 'c3', competitor: 'Batteries / storage', tier: 'tier-2', status: 'eliminated' }),
    ];
    expect(on(WILLIAMS, withDead)).not.toContain('battery');
  });
});

describe('a hand-typed competitor is not flattened into a catalog bucket', () => {
  const named = [
    competitor({ id: 'x1', competitor: 'Wärtsilä via Burns & McDonnell', tier: 'tier-1' }),
  ];

  it('appears in the grid under its own name', () => {
    const row = presenceGrid(WILLIAMS, named).find((r) => r.custom);
    expect(row?.label).toBe('Wärtsilä via Burns & McDonnell');
    expect(row?.on).toBe(true);
  });

  it('is keyed by its row id, since it has no catalog key', () => {
    expect(presenceGrid(WILLIAMS, named).find((r) => r.custom)?.key).toBe('x1');
  });

  it('does not duplicate a catalog entry that already claimed its row', () => {
    // A stored row matching a catalog name must appear ONCE, as that catalog
    // entry — not twice, as itself and as a stray hand-typed addition.
    const rows = presenceGrid(WILLIAMS, [competitor({ competitor: 'Grid supply' })]);
    expect(rows.filter((r) => r.on && /grid|CenterPoint/i.test(r.label))).toHaveLength(1);
    expect(rows.some((r) => r.custom)).toBe(false);
  });

  it('matches the catalog name case-insensitively', () => {
    const rows = presenceGrid(WILLIAMS, [
      competitor({ competitor: 'grid supply', status: 'not-present' }),
    ]);
    expect(rows.find((r) => r.key === 'grid')?.on).toBe(false);
    expect(rows.some((r) => r.custom)).toBe(false);
  });
});

describe('the card buttons derive from the toggle state', () => {
  it('every deal has at least two cards with no entry required', () => {
    const cards = cardControls(MULTI, []);
    expect(cards.map((c) => c.label)).toEqual(['Do nothing', 'the grid']);
  });

  it('names the utility on the grid card when the record has one', () => {
    expect(cardControls(WILLIAMS, []).map((c) => c.label)).toEqual(['Do nothing', 'CenterPoint']);
  });

  it('routes do-nothing to its own task and everything else to pricing defense', () => {
    const cards = cardControls(WILLIAMS, []);
    expect(cards[0].task).toBe('no-decision-card');
    expect(cards[1].task).toBe('pricing-defense-card');
  });

  it('gains a button the moment a competitor is switched on', () => {
    const before = cardControls(WILLIAMS, []).length;
    const after = cardControls(WILLIAMS, [
      competitor({ id: 'c2', competitor: 'Wind', tier: 'tier-2' }),
    ]).length;
    expect(after).toBe(before + 1);
  });

  it('loses it again when switched off', () => {
    const cards = cardControls(WILLIAMS, [
      competitor({ id: 'c2', competitor: 'Wind', tier: 'tier-2', status: 'not-present' }),
    ]);
    expect(cards.map((c) => c.label)).not.toContain('Wind');
  });

  it('marks a posture with nothing recorded as thin — a hint, never a gate', () => {
    expect(cardControls(WILLIAMS, []).every((c) => c.thin)).toBe(true);
    const fat = cardControls(WILLIAMS, [
      competitor({ id: 'c2', competitor: 'Wind', tier: 'tier-2', posture: 'Siting timeline.' }),
    ]);
    expect(fat.find((c) => c.label === 'Wind')?.thin).toBe(false);
  });

  it('uses a stable postureKey, not the display name', () => {
    // The key survives a utility rename; the label does not.
    expect(cardControls(WILLIAMS, [])[1].postureKey).toBe('grid');
    expect(cardControls(MULTI, [])[1].postureKey).toBe('grid');
  });
});

describe('the negative header reads the toggle set, not the stored rows', () => {
  it('names the grid even though no row exists for it', () => {
    // The failure this prevents: the header omitting the single posture most
    // likely to be the real one, because the common case stores nothing.
    const others = otherPostureNames(WILLIAMS, [], 'no-decision');
    expect(others).toEqual(['CenterPoint']);
  });

  it('names do-nothing when the card is a pricing defense', () => {
    expect(otherPostureNames(WILLIAMS, [], 'grid')).toEqual(['Do nothing']);
  });

  it('updates when a competitor is switched on', () => {
    const others = otherPostureNames(
      WILLIAMS,
      [competitor({ id: 'c2', competitor: 'Packaged integrator', tier: 'tier-1b' })],
      'grid',
    );
    expect(others).toEqual(['Do nothing', 'Packaged integrator']);
  });

  it('drops a competitor that was switched off', () => {
    const others = otherPostureNames(
      WILLIAMS,
      [competitor({ id: 'c2', competitor: 'Wind', tier: 'tier-2', status: 'not-present' })],
      'grid',
    );
    expect(others).not.toContain('Wind');
  });

  it('never names the posture the card is addressing', () => {
    for (const key of ['no-decision', 'grid']) {
      const label = presenceGrid(WILLIAMS, []).find((r) => r.key === key)!.label;
      expect(otherPostureNames(WILLIAMS, [], key)).not.toContain(label);
    }
  });
});

describe('one implementation of "who is in this deal"', () => {
  it('the card picker is derived, not a second maintained list', async () => {
    const src = await readFile('lib/cards.ts', 'utf8');
    expect(src).toContain('DERIVED, not maintained');
    expect(src).not.toContain('export function cardablePostures');
  });

  it('the toggle decision is pure, so panel, API and tests share it', async () => {
    const src = await readFile('lib/competitive.ts', 'utf8');
    expect(src).toContain('presenceWrite');
    expect(src).toContain('lib/competitor-catalog');
  });
});

describe('tiers track the doctrine', () => {
  it('every tier has a label', () => {
    for (const t of COMPETITOR_TIERS) {
      expect(TIER_LABELS[t]).toBeTruthy();
    }
  });

  it('every catalog entry carries a declared tier', () => {
    for (const e of CATALOG) expect(COMPETITOR_TIERS).toContain(e.tier);
  });

  it('the three doctrine tiers exist in the system prompt', async () => {
    const prompt = await readFile('prompts/powerdeal-v3.1.8-system-prompt.md', 'utf8');
    expect(prompt).toContain('TIER 1 — PRIMARY');
    expect(prompt).toContain('TIER 2 — SECONDARY');
    expect(prompt).toContain('TIER 3 — TERTIARY');
  });

  it('names the four tiers in doctrine order', () => {
    // 'integrator' sorted ahead of 'tier-1' in every `order by tier`, which put
    // the fourth tier first in every read of the table.
    expect(COMPETITOR_TIERS).toEqual(['tier-1', 'tier-1b', 'tier-2', 'tier-3']);
    expect([...COMPETITOR_TIERS].sort()).toEqual([...COMPETITOR_TIERS]);
  });

  it('carries no second name for Tier 1B anywhere in the code', async () => {
    // One concept, one name. The rename is cheap while it is only a CHECK
    // constraint and a handful of literals.
    for (const f of ['lib/types.ts', 'lib/competitor-catalog.ts', 'supabase/schema.sql']) {
      const src = await readFile(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\/|--.*|\/\/.*/g, '');
      expect(code, `${f} still carries the retired tier name`).not.toMatch(/'integrator'/);
    }
  });

  /**
   * Deliberately asserts a GAP, not a property.
   *
   * Tier 1B EXISTS in doctrine — v3.1.9 gave integrators full framing and
   * v3.1.10 propagated it. The repo's prompt file is two versions behind and
   * contains the word zero times, so a Tier 1B card generates with nothing to
   * draw on. When the prompt is synced this test FAILS, which is the signal to
   * delete it and the warning comments beside it.
   */
  it('the shipped prompt is BEHIND doctrine on Tier 1B — failing here is the fix landing', async () => {
    const prompt = await readFile('prompts/powerdeal-v3.1.8-system-prompt.md', 'utf8');
    expect(prompt).not.toMatch(/integrator/i);
  });

  it('says so on the toggle itself, where someone is about to switch it on', () => {
    // The one line of doctrine that IS known: never answer an integrator with
    // a heat-rate argument.
    expect(CATALOG_BY_KEY.get('tier-1b')?.hint).toMatch(/heat-rate/i);
  });

  it('records the prompt-sync gap where the enum is declared', async () => {
    const src = await readFile('lib/types.ts', 'utf8');
    expect(src).toContain('ABSENT FROM THE');
    expect(src).toContain('v3.1.10');
    // It is a prompt sync, not a code change — global rule 6.
    expect(src).toContain('never generated or inferred in code');
  });
});

describe('the migration', () => {
  it('constrains tier to the declared set', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    for (const t of COMPETITOR_TIERS) expect(sql).toContain(`'${t}'`);
    expect(sql).toContain('check (tier in');
  });

  it('admits not-present, which is how a default-on competitor is switched off', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain("'not-present'");
    expect(sql).toContain('check (status in');
  });

  it('repairs the constraint on a table that predates not-present', async () => {
    // `create table if not exists` is a no-op on an existing table, CHECK
    // constraints included, so re-running would appear to succeed and the
    // failure would surface the first time somebody switched the grid off.
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('drop constraint if exists deal_competitors_status_check');
    expect(sql).toContain('add constraint deal_competitors_status_check');
    // Drop-then-add, so the pair is idempotent; add alone is not.
    expect(sql.indexOf('drop constraint if exists deal_competitors_status_check'))
      .toBeLessThan(sql.indexOf('add constraint deal_competitors_status_check'));
  });

  it('verifies the repair rather than assuming it', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('NO not-present IN THE STATUS CONSTRAINT');
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

  it('renames integrator to tier-1b, rows and constraint together', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain("update deal_competitors set tier = 'tier-1b' where tier = 'integrator'");
    // Order matters: 'tier-1b' violates the OLD constraint, so the drop has to
    // come first and the add afterwards.
    const drop = sql.indexOf('drop constraint if exists deal_competitors_tier_check');
    const upd = sql.indexOf("set tier = 'tier-1b'");
    const add = sql.indexOf('add constraint deal_competitors_tier_check');
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(upd);
    expect(upd).toBeLessThan(add);
  });

  it('verifies the rename rather than assuming it', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('two names for one concept');
    expect(sql).toContain('zero rows on the retired tier name');
    expect(sql).toContain("FAIL: the retired tier name ''integrator'' was accepted");
  });

  it('ships a behavioural verification that exercises every constraint', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    // Structural checks alone pass on a table with no unique constraint.
    expect(sql).toContain('FAIL: duplicate competitor was accepted');
    expect(sql).toContain('FAIL: an undefined tier was accepted');
    // The status constraint was WIDENED to admit not-present, and widening is
    // where a typo stops being caught.
    expect(sql).toContain('FAIL: an undefined status was accepted');
    expect(sql).toContain('ACTIVE competitors');
  });
});

describe('schema.sql carries the table too', () => {
  it('a fresh instance gets deal_competitors without the migration', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain('create table if not exists deal_competitors');
  });

  it('and gets the widened status constraint with it', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain("'not-present'");
  });
});
