import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  GENERIC_GRID_LABEL, KNOWN_ISOS, MARKET_STRUCTURES, SERVICE_MODELS,
  STATE_MARKET_STRUCTURE, UTILITY_TYPES, coopRisk, isIso, qualificationRisks,
  resolveUtility, standbyRisk, structureForState,
  type UtilityRecord,
} from '@/lib/utility/model';

const MIGRATION = 'supabase/migrations/20260811_utility_structure.sql';

/**
 * THE UTILITY LAYER.
 *
 * Two assumptions broke and both are asserted against here.
 *
 * DEAL-BOUND: every test in this file resolves without a deal. Not one fixture
 * is a Deal, because a market review of a prospect nobody has entered has no
 * deal row, and a resolver reachable only through one gives origination nothing.
 *
 * NAME-BOUND: knowing the name is not knowing the argument. The structure tests
 * pass a named utility and assert that naming alone does NOT advance the level.
 */

function utility(over: Partial<UtilityRecord> = {}): UtilityRecord {
  return {
    key: over.key ?? 'test',
    name: over.name ?? 'Test Power',
    state: over.state ?? 'OK',
    type: over.type ?? 'iou',
    serviceModel: over.serviceModel ?? null,
    iso: over.iso ?? null,
    standbyTariff: over.standbyTariff ?? null,
    departingLoadCharge: over.departingLoadCharge ?? null,
    exitFee: over.exitFee ?? null,
    minimumTake: over.minimumTake ?? null,
    allRequirementsContract: over.allRequirementsContract ?? null,
    notes: over.notes ?? null,
    ...over,
  };
}

describe('level 0 is reachable from a state alone — no deal anywhere', () => {
  it('resolves market structure with nothing but a two-letter code', () => {
    const ctx = resolveUtility({ state: 'TX' });
    expect(ctx.marketStructure).toBe('deregulated');
    expect(ctx.level).toBe(0);
  });

  it('works for a prospect with no utility, no name and no record', () => {
    // The origination case: somebody saw a press release about a plant in
    // Oklahoma and wants to know what the argument looks like.
    const ctx = resolveUtility({ state: 'OK' });
    expect(ctx.marketStructure).toBe('regulated');
    expect(ctx.gridLabel).toBe(GENERIC_GRID_LABEL);
    // And it still produces something to say, not an error.
    expect(ctx.gaps.length).toBeGreaterThan(0);
  });

  it('covers all 51 jurisdictions', () => {
    expect(STATE_MARKET_STRUCTURE).toHaveLength(51);
    expect(new Set(STATE_MARKET_STRUCTURE.map((s) => s.state)).size).toBe(51);
  });

  it('uses all three structures — a single-valued table would prove nothing', () => {
    const used = new Set(STATE_MARKET_STRUCTURE.map((s) => s.structure));
    expect(used).toEqual(new Set(MARKET_STRUCTURES));
  });

  it('every hybrid state carries the caveat that makes it hybrid', () => {
    // "Hybrid" with no note is worse than "regulated": it reads as
    // deregulated-enough and gets argued that way.
    for (const s of STATE_MARKET_STRUCTURE.filter((x) => x.structure === 'hybrid')) {
      expect(s.note, `${s.state} is hybrid with no note`).toBeTruthy();
    }
  });

  it('flags a hybrid market as a question rather than a finding', () => {
    const ctx = resolveUtility({ state: 'CA' });
    expect(ctx.marketStructure).toBe('hybrid');
    expect(ctx.gaps.join(' ')).toMatch(/question to ask, not to assume/);
  });

  it('says so when there is no state, rather than resolving silently', () => {
    const ctx = resolveUtility({});
    expect(ctx.marketStructure).toBeNull();
    expect(ctx.gaps.join(' ')).toMatch(/No state on record/);
  });

  it('treats a placeholder in the state field as no state, not a bad lookup', () => {
    // One seed deal carries state 'multi'. Reporting a missing reference row
    // would blame the lookup table for a gap that is in the deal.
    const ctx = resolveUtility({ state: 'multi' });
    expect(ctx.state).toBeNull();
    expect(ctx.gaps.join(' ')).toMatch(/No state on record/);
    expect(ctx.gaps.join(' ')).not.toMatch(/gap in the reference table/);
  });
});

describe('the ISO guard detects and declines — it never autocorrects', () => {
  it('recognises the ISOs by name', () => {
    for (const iso of KNOWN_ISOS) expect(isIso(iso)).toBe(true);
    expect(isIso('ercot')).toBe(true);
    expect(isIso('CenterPoint')).toBe(false);
  });

  it('refuses to name an ISO as the counterparty', () => {
    const ctx = resolveUtility({ state: 'TX', accountUtility: 'ERCOT' });
    expect(ctx.gridLabel).toBe(GENERIC_GRID_LABEL);
    expect(ctx.utilityName).toBeNull();
  });

  it('does not substitute a utility for it', () => {
    // Which TDU serves a given site is a fact about the site. Turning ERCOT
    // into Oncor would put a fabricated counterparty on a customer-facing card.
    const ctx = resolveUtility({ state: 'TX', accountUtility: 'ERCOT' });
    expect(ctx.isoInField).toBe('ERCOT');
    expect(ctx.gaps.join(' ')).toMatch(/market operator/);
    expect(ctx.gaps.join(' ')).toMatch(/not inferred/);
  });

  it('reports the ISO differently from an empty field — they need different fixes', () => {
    const iso = resolveUtility({ state: 'TX', accountUtility: 'ERCOT' });
    const empty = resolveUtility({ state: 'TX' });
    expect(iso.isoInField).toBe('ERCOT');
    expect(empty.isoInField).toBeNull();
    expect(iso.gaps.join(' ')).not.toEqual(empty.gaps.join(' '));
  });

  it('still resolves Level 0 through the ISO — the guard degrades, it does not block', () => {
    expect(resolveUtility({ state: 'TX', accountUtility: 'ERCOT' }).marketStructure)
      .toBe('deregulated');
  });
});

describe('the beachhead site wins over the account-level field', () => {
  it('prefers the site', () => {
    const ctx = resolveUtility({
      state: 'TX',
      siteUtility: 'CenterPoint',
      accountUtility: 'PG&E',
    });
    expect(ctx.gridLabel).toBe('CenterPoint');
    expect(ctx.nameSource).toBe('site');
  });

  it('falls through to the account when the site has none', () => {
    const ctx = resolveUtility({ state: 'CA', accountUtility: 'PG&E' });
    expect(ctx.nameSource).toBe('account');
  });

  it('falls through past a placeholder at site level', () => {
    const ctx = resolveUtility({ siteUtility: 'multi', accountUtility: 'Dominion' });
    expect(ctx.gridLabel).toBe('Dominion');
    expect(ctx.nameSource).toBe('account');
  });

  it('falls through past an ISO at site level and still flags it', () => {
    const ctx = resolveUtility({ siteUtility: 'ERCOT', accountUtility: 'CenterPoint' });
    expect(ctx.gridLabel).toBe('CenterPoint');
    expect(ctx.isoInField).toBe('ERCOT');
  });

  it('ends at the generic label when nothing names anything', () => {
    const ctx = resolveUtility({ state: 'KS', siteUtility: 'multi', accountUtility: '' });
    expect(ctx.gridLabel).toBe(GENERIC_GRID_LABEL);
    expect(ctx.nameSource).toBe('none');
  });
});

describe('a name is not a level — structure is what advances it', () => {
  it('a named but untyped utility is still level 0', () => {
    const ctx = resolveUtility({ state: 'OK', accountUtility: 'Some Electric' });
    expect(ctx.utilityName).toBe('Some Electric');
    expect(ctx.level).toBe(0);
    expect(ctx.gaps.join(' ')).toMatch(/named but not typed/);
  });

  it('a typed utility reaches level 1', () => {
    expect(resolveUtility({ state: 'OK', record: utility({ type: 'iou' }) }).level).toBe(1);
  });

  it('a service model reaches level 2', () => {
    const ctx = resolveUtility({
      state: 'TX',
      record: utility({ serviceModel: 'wires-only' }),
    });
    expect(ctx.level).toBe(2);
    expect(ctx.serviceModel).toBe('wires-only');
  });

  it('a tariff reaches level 3', () => {
    const ctx = resolveUtility({
      state: 'CA',
      record: utility({ serviceModel: 'vertically-integrated', standbyTariff: 'Schedule S' }),
    });
    expect(ctx.level).toBe(3);
  });

  it('names the missing service model, since it decides one story or two', () => {
    const ctx = resolveUtility({ state: 'OK', record: utility({ serviceModel: null }) });
    expect(ctx.gaps.join(' ')).toMatch(/one story or two/);
  });

  it('never blocks: level 0 still answers at every level above it', () => {
    for (const record of [
      null,
      utility(),
      utility({ serviceModel: 'wires-only' }),
      utility({ serviceModel: 'wires-only', standbyTariff: 'Schedule S' }),
    ]) {
      expect(resolveUtility({ state: 'TX', record }).marketStructure).toBe('deregulated');
    }
  });
});

describe('co-op all-requirements contracts surface at level 1', () => {
  it('fires the moment the type says co-op', () => {
    const r = coopRisk(utility({ type: 'coop' }));
    expect(r?.key).toBe('coop-all-requirements');
    expect(r?.level).toBe(1);
    expect(r?.severity).toBe('no-go-candidate');
  });

  it('treats UNVERIFIED as a live risk, not as absence', () => {
    // The deal this flag exists for is the one nobody has checked. Reading
    // null as "no contract" would silently clear it.
    expect(coopRisk(utility({ type: 'coop', allRequirementsContract: null }))?.answered)
      .toBe(false);
  });

  it('stays open when the contract is confirmed to exist', () => {
    const r = coopRisk(utility({ type: 'coop', allRequirementsContract: true }));
    expect(r?.answered).toBe(false);
    expect(r?.label).toMatch(/confirmed/);
  });

  it('closes only when the contract is confirmed absent', () => {
    expect(coopRisk(utility({ type: 'coop', allRequirementsContract: false }))?.answered)
      .toBe(true);
  });

  it('does not fire for an IOU, a muni or an IPP', () => {
    for (const type of ['iou', 'muni', 'wires-only', 'ipp'] as const) {
      expect(coopRisk(utility({ type })), type).toBeNull();
    }
  });

  it('reaches the qualification surface rather than diligence', () => {
    const ctx = resolveUtility({ state: 'OK', record: utility({ type: 'coop' }) });
    const q = qualificationRisks(ctx);
    expect(q.map((r) => r.key)).toContain('coop-all-requirements');
  });

  it('carries the question that closes it, not just the worry', () => {
    expect(coopRisk(utility({ type: 'coop' }))?.question).toMatch(/all-requirements contract/);
  });
});

describe('standby and departing load are named on every pricing argument', () => {
  it('are open with no utility record at all', () => {
    expect(standbyRisk(null).answered).toBe(false);
  });

  it('are open on a utility whose tariff nobody has read', () => {
    expect(standbyRisk(utility()).answered).toBe(false);
  });

  it('close on either a standby schedule or a departing-load charge', () => {
    expect(standbyRisk(utility({ standbyTariff: 'Schedule S' })).answered).toBe(true);
    expect(standbyRisk(utility({ departingLoadCharge: 'PCIA' })).answered).toBe(true);
  });

  it('appear in EVERY resolution, at every level', () => {
    // The failure this prevents: the card reading as complete while the single
    // largest silent risk in it is unmentioned.
    for (const input of [
      {},
      { state: 'TX' },
      { state: 'TX', accountUtility: 'ERCOT' },
      { state: 'OK', record: utility({ serviceModel: 'vertically-integrated' }) },
    ]) {
      expect(resolveUtility(input).risks.map((r) => r.key)).toContain('standby-departing-load');
    }
  });

  it('are stated as a gap in the resolved context until answered', () => {
    expect(resolveUtility({ state: 'CA' }).gaps.join(' ')).toMatch(/largest silent risk/);
  });

  it('stop being a gap once answered', () => {
    const ctx = resolveUtility({
      state: 'CA',
      record: utility({ standbyTariff: 'Schedule S' }),
    });
    expect(ctx.gaps.join(' ')).not.toMatch(/largest silent risk/);
  });

  it('are an open question, not a no-go — they change the number, not the deal', () => {
    expect(standbyRisk(null).severity).toBe('open-question');
    expect(qualificationRisks(resolveUtility({ state: 'CA' })).map((r) => r.key))
      .not.toContain('standby-departing-load');
  });
});

describe('the prompt carries the structure and the gap into the card', () => {
  it('the pricing defense names open structural risks as a required section', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('Open structural risks');
    expect(src).toContain('NEVER omitted');
    expect(src).toContain('subject to standard diligence');
  });

  it('tells the model to split the comparison for a wires-only utility', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('WIRES-ONLY');
    expect(src).toContain('Do NOT quote an all-in $/MWh');
  });

  it('produces a block even with nothing resolved', async () => {
    const { buildPricingDefenseCardPrompt } = await import('@/lib/prompts/modules');
    const built = buildPricingDefenseCardPrompt({
      deal: { company: 'X', deal_id: 'X-1' } as never,
      posture: { competitor: 'the grid', tier: 'tier-1' },
      utility: null,
    } as never);
    expect(built.user).toContain('STANDBY / DEPARTING LOAD');
  });

  it('carries the wires-only instruction through to the built prompt', async () => {
    const { buildPricingDefenseCardPrompt } = await import('@/lib/prompts/modules');
    const built = buildPricingDefenseCardPrompt({
      deal: { company: 'X', deal_id: 'X-1' } as never,
      posture: { competitor: 'CenterPoint', tier: 'tier-1' },
      utility: resolveUtility({
        state: 'TX',
        accountUtility: 'CenterPoint',
        record: utility({ name: 'CenterPoint', serviceModel: 'wires-only' }),
      }),
    } as never);
    expect(built.user).toContain('WIRES-ONLY');
    expect(built.user).toContain('largest silent risk');
  });
});

describe('the utility layer never joins a deal', () => {
  it('the resolver takes no deal and imports no deal module', async () => {
    const src = await readFile('lib/utility/model.ts', 'utf8');
    expect(src).not.toMatch(/from '@\/lib\/data'/);
    expect(src).not.toMatch(/getDeal/);
  });

  it('the store reads by state and by name, never by deal id', async () => {
    const src = await readFile('lib/utility/store.ts', 'utf8');
    expect(src).not.toMatch(/\.from\('deals'\)/);
    expect(src).not.toMatch(/deal_id/);
  });

  it('the route takes no dealId — origination has none to give', async () => {
    const src = await readFile('app/api/utility/route.ts', 'utf8');
    // The comment explaining WHY there is no dealId is allowed to say the
    // word; reading one as a parameter is what must not happen.
    expect(src).not.toMatch(/get\(['"]dealId['"]\)/);
    expect(src).not.toMatch(/dealId:\s*z\./);
    expect(src).toContain("p.get('state')");
  });

  it('the migration asserts the same thing structurally', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('reachable WITHOUT a deal');
    expect(sql).toContain('DEAL-BOUND');
  });
});

describe('storage stays small on purpose', () => {
  it('seeds only the utilities in the book', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const keys = ['pso', 'sdge', 'centerpoint', 'delmarva', 'dominion', 'pge'];
    for (const k of keys) expect(sql).toContain(`('${k}',`);
    // Six. A comprehensive US reference would be thousands of rows rotting
    // continuously — the same failure mode as the battlecard library.
    expect((sql.match(/^  \('[a-z-]+', '/gm) ?? [])).toHaveLength(keys.length);
  });

  it('seeds NO tariff figures — the gap has to be real', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const seed = sql.slice(sql.indexOf('insert into utilities'), sql.indexOf('-- VERIFICATION'));
    expect(seed).not.toMatch(/standby_tariff|departing_load_charge|exit_fee|minimum_take/);
  });

  it('states are seeded on conflict do nothing, so a reclassification survives', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('on conflict (state) do nothing');
  });
});

describe('the seed and the migration cannot drift apart', () => {
  it('every state in the constant is in the migration, with the same structure', async () => {
    // The constant is the offline fallback and the table is authoritative at
    // runtime. If they disagreed, the app would answer one thing and the
    // database another, and nothing would say which.
    const sql = await readFile(MIGRATION, 'utf8');
    for (const s of STATE_MARKET_STRUCTURE) {
      expect(sql, `${s.state} missing or mismatched`).toContain(`('${s.state}', '${s.structure}'`);
    }
  });

  it('the migration adds no state the constant does not have', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const inSql = [...sql.matchAll(/^ {2}\('([A-Z]{2})', '(regulated|deregulated|hybrid)'/gm)]
      .map((m) => m[1]);
    expect(new Set(inSql)).toEqual(new Set(STATE_MARKET_STRUCTURE.map((s) => s.state)));
  });

  it('schema.sql carries the tables so a fresh instance is not deal-bound either', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain('create table if not exists state_market_structure');
    expect(schema).toContain('create table if not exists utilities');
    expect(schema).toContain('beachhead_utility');
  });
});

describe('the typed sets match the doctrine', () => {
  it('level 1 offers the five entity types', () => {
    expect(UTILITY_TYPES).toEqual(['iou', 'muni', 'coop', 'wires-only', 'ipp']);
  });

  it('level 2 offers the three service models', () => {
    expect(SERVICE_MODELS).toEqual(['vertically-integrated', 'wires-only', 'gnt-member']);
  });

  it('the migration constrains both to those sets', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    for (const t of UTILITY_TYPES) expect(sql).toContain(`'${t}'`);
    for (const m of SERVICE_MODELS) expect(sql).toContain(`'${m}'`);
  });

  it('structureForState is case- and whitespace-insensitive', () => {
    expect(structureForState(' tx ')?.structure).toBe('deregulated');
    expect(structureForState('ZZ')).toBeNull();
  });
});

describe('deals.competition is deprecated as the competitive record', () => {
  it('is marked deprecated where it is declared', async () => {
    const src = await readFile('lib/types.ts', 'utf8');
    expect(src).toContain('@deprecated as the competitive record');
    expect(src).toContain('sole authority');
  });

  it('is not dropped — it is the only copy of what was written before', async () => {
    const src = await readFile('lib/types.ts', 'utf8');
    expect(src).toContain('competition: string | null;');
  });

  it('its one remaining dependency is named rather than left to be rediscovered', async () => {
    const src = await readFile('lib/deals.ts', 'utf8');
    expect(src).toContain('THE LAST DEPENDENCY ON A DEPRECATED FIELD');
    const backlog = await readFile('docs/BACKLOG.md', 'utf8');
    expect(backlog).toContain('`deals.competition` still scores one MEDDPICC point');
  });

  it('days_in_stage was unfrozen by the stage-advancement item, not patched around', async () => {
    // This assertion moved with the fix rather than being deleted. What it
    // protects is the REASON: no derived reset and no backfill, because a
    // number that looks right is what stops anyone fixing the cause.
    const backlog = await readFile('docs/BACKLOG.md', 'utf8');
    const item1 = backlog.slice(
      backlog.indexOf('## 1. Nothing in the application'),
      backlog.indexOf('## 2.'),
    );
    expect(item1).toContain('`days_in_stage` rode on this and is now unfrozen');
    expect(item1).toContain('Nothing was patched around it');
    expect(item1).toContain('That is not backfilled');
  });
});
