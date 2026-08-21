import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderSpine, healthCaps, competitorsByDeal } from '@/lib/spine-export';
import type { Deal, DealCompetitor } from '@/lib/types';

/**
 * SPINE EXPORT — read-only, date-stamped, and it never renders seed data as a
 * pipeline.
 *
 * The pinned Pipeline-Spine.md had already drifted: one account at 6/10 health against
 * a database computing 4 after the critical-event cap. A hand-maintained copy
 * of a computed number is wrong from the first time the computation changes.
 *
 * The assertions that carry weight here are the two about what CANNOT happen:
 * the route has no write handler, and a failed read never emits a deal table.
 */

const NOW = '2026-08-15T14:30:00.000Z';

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 'd1',
    deal_id: 'DEF-001',
    company: 'Ironvale Defense Systems',
    vertical: 'Defense',
    relationship_type: 'Direct',
    geo_tier: 'Primary',
    state: 'CA',
    utility: 'SDG&E',
    beachhead_utility: null,
    beachhead_site: 'San Diego',
    value_prop: 'Grid-fighter',
    stage: 'Discovery',
    size_mw: 12,
    size_usd_m: 40,
    meddpicc_score: 4,
    health_score: 4,
    multi_threaded: true,
    decision_mapped: false,
    days_in_stage: 12,
    next_move: 'Get the one-line diagram',
    next_move_date: '2026-08-22',
    key_risk: null,
    critical_event: null,
    critical_event_date: null,
    metrics_known: true,
    economic_buyer: 'Dana Reyes',
    decision_criteria: null,
    decision_process: null,
    identified_pain: 'Grid reliability',
    champion: 'Sam Okafor',
    competition: null,
    landed_site: null,
    next_target_site: null,
    expansion_mw_captured: 0,
    expansion_mw_addressable: null,
    partner_notes: null,
    notes: null,
    artifacts: [],
    created_at: NOW,
    updated_at: NOW,
    user_id: 'u1',
    ...over,
  }) as Deal;

const competitor = (over: Partial<DealCompetitor> = {}): DealCompetitor =>
  ({
    id: 'c1',
    deal_id: 'd1',
    competitor: 'Enchanted Rock',
    tier: '1B',
    posture: 'Compare our PPA against their bundle, not our machine',
    what_was_said: 'They quoted a turnkey EaaS number',
    what_landed: null,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    user_id: 'u1',
    ...over,
  }) as DealCompetitor;

const populated = { kind: 'populated' as const, count: 1, seeded: 0 };

describe('READ-ONLY is structural, not an intention', () => {
  it('the route exports GET and NOTHING else', async () => {
    // A chat surface that could write back to `deals` is the silent-write risk
    // this build spent two weeks removing, with a friendly interface on it.
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('export async function GET');
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(code, `route exports ${verb}`).not.toMatch(
        new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`),
      );
    }
  });

  it('and performs no mutation of any kind', async () => {
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    for (const op of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(code, `route calls ${op}`).not.toContain(op);
    }
  });

  it('the renderer has no database client at all', async () => {
    // It takes rows and returns a string. There is nothing in it that could
    // acquire a write without a reviewer seeing the import appear.
    const src = await readFile('lib/spine-export.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('supabase');
    expect(code).not.toContain('getAdminClient');
    expect(code).not.toContain('fetch(');
  });

  it('the document itself says nothing can write through this path', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('has no write handler of any kind');
    expect(md).toContain('Editing this file by hand changes nothing in the');
  });
});

describe('a failed read NEVER renders a pipeline', () => {
  it('emits no deal table and says not to pin it', () => {
    // getDeals() substitutes SEED_DEALS on error — right for a dashboard,
    // catastrophic for a file a model reasons from.
    const md = renderSpine({
      deals: [],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'unreadable', reason: 'permission denied for table deals' },
    });
    expect(md).toContain('COULD NOT READ THE PIPELINE');
    expect(md).toContain('this is not an empty pipeline');
    expect(md).toContain('permission denied for table deals');
    expect(md).toContain('Do not pin this file');
    expect(md).not.toContain('## Deals');
  });

  it('SEED data is refused just as loudly', () => {
    const md = renderSpine({
      deals: [deal({ id: 'seed-def-001' })],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'seeded', count: 21 },
    });
    expect(md).toContain('THIS IS SEED DATA, NOT YOUR PIPELINE');
    expect(md).toContain('accounts that do not exist');
    expect(md).toContain('Do not pin this file');
    expect(md).not.toContain('## Deals');
  });

  it('a genuinely empty pipeline says the read SUCCEEDED', () => {
    const md = renderSpine({ deals: [], competitors: [], generatedAt: NOW, state: { kind: 'empty' } });
    expect(md).toContain('The read succeeded and the pipeline is genuinely empty');
    expect(md).not.toContain('Do not pin this file');
  });

  it('a mix names how many rows are seeded rather than hiding them', () => {
    const md = renderSpine({
      deals: [deal()],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'populated', count: 5, seeded: 2 },
    });
    expect(md).toContain('2 of these are seeded demonstration rows');
    // But it still renders — labelled, not withheld.
    expect(md).toContain('## Deals');
  });
});

describe('the stamp is the point', () => {
  it('leads with when it was generated and how many deals', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('**Generated 2026-08-15 14:30 UTC** · 1 deal');
  });

  it('stamps even the failure documents, so a stale error is dateable', () => {
    const md = renderSpine({
      deals: [],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'unreadable', reason: 'x' },
    });
    expect(md).toContain('2026-08-15 14:30 UTC');
  });

  it('tells the reader to re-export rather than trust it indefinitely', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('Re-export before relying on this');
  });
});

describe('health prints the reason, because 6 vs 4 was the whole problem', () => {
  it('names the critical-event cap — the exact disagreement that was found', () => {
    // Multi-threaded, economic buyer, decision mapped, champion, 8 pillars:
    // uncapped is above 6, so the cap is BINDING and holds it down.
    const capped = deal({
      critical_event: null,
      multi_threaded: true,
      economic_buyer: 'A. Buyer',
      decision_mapped: true,
      champion: 'A. Champion',
      meddpicc_score: 8,
      days_in_stage: 5,
    });
    const caps = healthCaps(capped);
    expect(caps).toHaveLength(1);
    expect(caps[0]).toContain('no critical event');
    expect(caps[0]).toContain('holding this at 6');
  });

  it('⚠️ and says the OPPOSITE when the cap binds nothing', () => {
    /**
     * The defect: "capped at 6" printed on every deal missing a critical
     * event, including the twenty that compute to 1.5 — where a cap at 6
     * holds nothing down. The sentence described a rule that was not
     * operating and read as the reason the number was low.
     */
    const flat = deal({
      critical_event: null,
      multi_threaded: true,
      economic_buyer: null,
      decision_mapped: false,
      champion: null,
      meddpicc_score: 0,
      days_in_stage: 5,
    });
    const caps = healthCaps(flat);
    expect(caps).toHaveLength(1);
    expect(caps[0]).toContain('not what is holding this back today');
    expect(caps[0]).not.toContain('holding this at');
  });

  it('names the single-thread cap', () => {
    const caps = healthCaps(deal({ multi_threaded: false, critical_event: 'Budget cycle' }));
    expect(caps[0]).toContain('single-threaded');
  });

  it('names BOTH when both apply', () => {
    expect(healthCaps(deal({ multi_threaded: false, critical_event: null }))).toHaveLength(2);
  });

  it('says so explicitly when no cap applied — silence would read as an omission', () => {
    const md = renderSpine({
      deals: [deal({ multi_threaded: true, critical_event: 'Q4 budget lock' })],
      competitors: [],
      generatedAt: NOW,
      state: populated,
    });
    expect(md).toContain('No caps applied.');
  });

  it('a whitespace-only critical event does not clear the cap', () => {
    expect(healthCaps(deal({ critical_event: '   ' }))[0]).toContain('no critical event');
  });

  it('the score and its reason appear together in the document', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('**Health 4/10**');
    expect(md).toContain('no critical event');
  });
});

describe('everything needed to reason without asking', () => {
  const md = () =>
    renderSpine({
      deals: [
        deal({
          beachhead_utility: 'CenterPoint',
          key_risk: 'Security review may veto',
          critical_event: 'Fiscal year capex lock',
          critical_event_date: '2026-09-30',
        }),
      ],
      competitors: [competitor()],
      generatedAt: NOW,
      state: populated,
    });

  it('carries the deal fields', () => {
    const out = md();
    for (const field of ['DEF-001', 'Ironvale Defense Systems', 'Defense', 'Direct', 'Discovery', 'San Diego']) {
      expect(out, `missing ${field}`).toContain(field);
    }
  });

  it('carries MEDDPICC per pillar WITH ITS VALUE, not just a tick', () => {
    // "Economic Buyer ✅" says a box is ticked. "✅ Dana Reyes" says who to call.
    const out = md();
    expect(out).toContain('MEDDPICC');
    expect(out).toContain('Dana Reyes');
    expect(out).toContain('Sam Okafor');
  });

  it('carries competitor postures verbatim', () => {
    const out = md();
    expect(out).toContain('Enchanted Rock');
    expect(out).toContain('Compare our PPA against their bundle');
    expect(out).toContain('They quoted a turnkey EaaS number');
  });

  it('carries the critical event with its date', () => {
    expect(md()).toContain('Fiscal year capex lock');
    expect(md()).toContain('2026-09-30');
  });

  it('carries the next move and the key risk', () => {
    expect(md()).toContain('Get the one-line diagram');
    expect(md()).toContain('Security review may veto');
  });

  it('prefers the BEACHHEAD utility and says the account-level one differs', () => {
    const out = md();
    expect(out).toContain('CenterPoint');
    expect(out).toContain('account-level is SDG&E');
  });

  it('a critical event with NO date says so rather than printing a blank', () => {
    const out = renderSpine({
      deals: [deal({ critical_event: 'Budget cycle', critical_event_date: null })],
      competitors: [],
      generatedAt: NOW,
      state: populated,
    });
    expect(out).toContain('no date on record');
  });
});

describe('absence is stated, never filled', () => {
  it('ZERO competitor rows is the DEFAULT grid, not an uncontested deal', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('That is the DEFAULT grid');
    expect(md).not.toMatch(/no competitors\b/i);
  });

  it('pipeline value sums only deals that carry a size, and says how many', () => {
    // Summing a column with nulls and presenting the result as the pipeline is
    // a fabricated number.
    const md = renderSpine({
      deals: [deal({ id: 'a', size_usd_m: 40 }), deal({ id: 'b', deal_id: 'DC-002', size_usd_m: null })],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'populated', count: 2, seeded: 0 },
    });
    expect(md).toContain('$40M across 1 of 2 live deals that carry a size');
  });

  it('a missing field renders an em dash, not a zero or a blank', () => {
    const md = renderSpine({
      deals: [deal({ next_move: null, size_mw: null })],
      competitors: [],
      generatedAt: NOW,
      state: populated,
    });
    expect(md).toContain('**Next move** — —');
    // Scoped to the DEAL row, not the whole document: the portfolio Capacity
    // line legitimately reads "0 MW across 0 of 1" when nothing carries a
    // size, and that aggregate IS zero. The failure being guarded against is a
    // per-deal field defaulting, not a true total.
    const sizeRow = md.split('\n').find((l) => l.startsWith('| Size |'))!;
    expect(sizeRow).toBe('| Size | — · $40M |');
  });

  it('flags the deals with no critical event in the portfolio line', () => {
    const md = renderSpine({ deals: [deal()], competitors: [], generatedAt: NOW, state: populated });
    expect(md).toContain('| ⚠️ No critical event | 1 |');
  });
});

describe('terminal deals are counted apart, never folded into the pipeline', () => {
  it('a closed deal does not inflate the live count or the value', () => {
    // Archived sitting last in DEAL_STAGES has already caused two bugs from
    // being treated as a position rather than an outcome.
    const md = renderSpine({
      deals: [
        deal({ id: 'a', stage: 'Discovery', size_usd_m: 40 }),
        deal({ id: 'b', deal_id: 'DEF-002', stage: 'Archived', size_usd_m: 999 }),
      ],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'populated', count: 2, seeded: 0 },
    });
    expect(md).toContain('| Live deals | 1 |');
    expect(md).toContain('| Terminal (Closed-Won / Post-Sale / Archived) | 1 |');
    expect(md).toContain('$40M');
    expect(md).not.toContain('$1039M');
  });

  it('but a terminal deal is still RENDERED, marked as terminal', () => {
    // "Did we already lose this one" is a question the Spine has to answer.
    const md = renderSpine({
      deals: [deal({ stage: 'Archived' })],
      competitors: [],
      generatedAt: NOW,
      state: populated,
    });
    expect(md).toContain('DEF-001');
    expect(md).toContain('*(terminal)*');
  });
});

describe('ordering and indexing', () => {
  it('worst health first, so the file and the pipeline table agree', () => {
    const md = renderSpine({
      deals: [
        deal({ id: 'a', deal_id: 'AAA-001', health_score: 9 }),
        deal({ id: 'b', deal_id: 'BBB-001', health_score: 2 }),
      ],
      competitors: [],
      generatedAt: NOW,
      state: { kind: 'populated', count: 2, seeded: 0 },
    });
    expect(md.indexOf('BBB-001')).toBeLessThan(md.indexOf('AAA-001'));
  });

  it('ties break deterministically, so two exports of the same data match', () => {
    const deals = [
      deal({ id: 'a', deal_id: 'ZZZ-001', health_score: 5 }),
      deal({ id: 'b', deal_id: 'AAA-001', health_score: 5 }),
    ];
    const state = { kind: 'populated' as const, count: 2, seeded: 0 };
    const first = renderSpine({ deals, competitors: [], generatedAt: NOW, state });
    const second = renderSpine({ deals: [...deals].reverse(), competitors: [], generatedAt: NOW, state });
    expect(first).toBe(second);
  });

  it('competitors index by deal without a scan per row', () => {
    const map = competitorsByDeal([
      competitor({ id: 'c1', deal_id: 'd1' }),
      competitor({ id: 'c2', deal_id: 'd1', competitor: 'VoltaGrid' }),
      competitor({ id: 'c3', deal_id: 'd2' }),
    ]);
    expect(map.get('d1')).toHaveLength(2);
    expect(map.get('d2')).toHaveLength(1);
    expect(map.has('d3')).toBe(false);
  });

  it('a competitor row for an unknown deal does not crash the render', () => {
    const md = renderSpine({
      deals: [deal()],
      competitors: [competitor({ deal_id: 'ghost' })],
      generatedAt: NOW,
      state: populated,
    });
    expect(md).toContain('DEF-001');
    expect(md).toContain('That is the DEFAULT grid');
  });
});

describe('the route reads directly, not through the dashboard helper', () => {
  it('does not call getDeals — it substitutes seed data on failure', async () => {
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('getDeals');
  });

  it('does not filter Archived out of the query', async () => {
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain("neq('stage', 'Archived')");
  });

  it('a failed COMPETITOR read is reported, not silently rendered as empty grids', async () => {
    // Otherwise every deal prints "no stored rows — the default grid", which is
    // a confident claim about the competitive picture derived from a failure.
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    expect(src).toContain('Competitive data could not be read');
    expect(src).toContain('is unverified');
  });

  it('answers 200 even on a failed read, with the failure inside the document', async () => {
    const src = await readFile('app/api/spine/export/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/status:\s*5\d\d/);
    expect(code).toContain('status: 200');
  });
});
