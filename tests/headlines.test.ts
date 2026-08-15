import { describe, expect, it } from 'vitest';
import { rankHeadlines, headlineSummary } from '@/lib/engine/headlines';
import type { Deal, FeedItem } from '@/lib/types';

/**
 * HEADLINES — the join that was missing.
 *
 * Every ingredient existed: `deal_ids` on every swept item, account impact in
 * trending, the outreach hook on the row. Nothing put them together to answer
 * the question a rep opens a feed to ask — of these sixty items, which matter
 * to MY pipeline this morning?
 *
 * The tests that matter here are the ones about absence. A ranker that only
 * works on complete rows is a ranker that breaks on the 33 items with no
 * summary, the deals with no size, and the empty first morning.
 */

const NOW = Date.parse('2026-08-15T12:00:00Z');

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: 'i1',
  title: 'Something happened',
  synthesis: 'A summary.',
  tier: 'reported',
  confidence: 0.7,
  arrival: 'rss',
  platform: 'rss',
  source_id: 's',
  source_name: 'Wire',
  url: 'https://example.com/1',
  url_hash: 'h1',
  image_url: null,
  byline: null,
  published_at: '2026-08-15T09:00:00Z',
  category: 'power-markets',
  vertical_tags: [],
  deal_ids: [],
  action: null,
  action_tier: 'inferred',
  breaking: false,
  cached_at: '2026-08-15T10:00:00Z',
  user_id: 'u1',
  ...over,
});

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 'd1',
    deal_id: 'DC-001',
    company: 'Acme Data',
    vertical: 'Data Center',
    stage: 'Discovery',
    size_usd_m: null,
    ...over,
  }) as Deal;

describe('nothing gates — the empty morning renders, it does not fail', () => {
  it('no items and no deals returns an empty list, not a throw', () => {
    expect(rankHeadlines([], [], NOW)).toEqual([]);
  });

  it('items with NO deals at all still rank', () => {
    const out = rankHeadlines([item(), item({ id: 'i2' })], [], NOW);
    expect(out).toHaveLength(2);
  });

  it('the summary line is null when there is nothing to say', () => {
    // Null, so the caller renders a real empty state rather than a sentence
    // built around zero.
    expect(headlineSummary([])).toBeNull();
  });

  it('says so plainly when items ranked but none touched the pipeline', () => {
    const out = rankHeadlines([item()], [], NOW);
    expect(headlineSummary(out)).toContain('none mapped to a pipeline account');
  });
});

describe('account impact is the dominant term, because it is the question', () => {
  it('an item touching an account outranks a newer one that does not', () => {
    const out = rankHeadlines(
      [
        item({ id: 'newer', published_at: '2026-08-15T11:59:00Z' }),
        item({ id: 'mapped', deal_ids: ['d1'], published_at: '2026-08-14T09:00:00Z' }),
      ],
      [deal()],
      NOW,
    );
    expect(out[0].item.id).toBe('mapped');
  });

  it('two accounts outrank one', () => {
    const out = rankHeadlines(
      [
        item({ id: 'one', deal_ids: ['d1'] }),
        item({ id: 'two', deal_ids: ['d1', 'd2'] }),
      ],
      [deal(), deal({ id: 'd2', company: 'Beta Corp' })],
      NOW,
    );
    expect(out[0].item.id).toBe('two');
  });

  it('names the companies in the reason, so the rank is auditable', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal()], NOW);
    expect(out[0].reasons[0]).toContain('Acme Data');
  });
});

describe('Archived is an OUTCOME, not the furthest stage', () => {
  it('a headline about an archived account does NOT outrank one in Negotiation', () => {
    // DEAL_STAGES ends Closed-Won, Post-Sale, Archived. A linear weight across
    // the raw array ranks Archived highest, which is exactly backwards.
    const out = rankHeadlines(
      [
        item({ id: 'archived', deal_ids: ['d1'] }),
        item({ id: 'negotiating', deal_ids: ['d2'] }),
      ],
      [
        deal({ id: 'd1', stage: 'Archived', company: 'Dead Co' }),
        deal({ id: 'd2', stage: 'Negotiation', company: 'Live Co' }),
      ],
      NOW,
    );
    expect(out[0].item.id).toBe('negotiating');
  });

  it('but an archived account still ranks — it is not filtered out', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal({ stage: 'Archived' })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].accounts).toHaveLength(1);
  });

  it('later in-flight stages do outrank earlier ones', () => {
    const out = rankHeadlines(
      [
        item({ id: 'early', deal_ids: ['d1'] }),
        item({ id: 'late', deal_ids: ['d2'] }),
      ],
      [
        deal({ id: 'd1', stage: 'Prospecting' }),
        deal({ id: 'd2', stage: 'Contracting' }),
      ],
      NOW,
    );
    expect(out[0].item.id).toBe('late');
  });

  it('an unrecognised stage contributes nothing rather than throwing', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal({ stage: 'Whatever' })], NOW);
    expect(out).toHaveLength(1);
  });
});

describe('gaps are named, never defaulted', () => {
  it('a missing summary is a GAP, not a disqualification', () => {
    // 33 of the first 60 swept items had no synthesis. They must rank.
    const out = rankHeadlines([item({ synthesis: null, deal_ids: ['d1'] })], [deal()], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].gaps.join(' ')).toContain('No summary');
  });

  it('a deal with no size does not get an assumed one', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal({ size_usd_m: null })], NOW);
    expect(out[0].gaps.join(' ')).toContain('No deal size');
    expect(out[0].reasons.join(' ')).not.toContain('$');
  });

  it('a real size is used and stated', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal({ size_usd_m: 45 })], NOW);
    expect(out[0].reasons.join(' ')).toContain('$45M');
    expect(out[0].gaps.join(' ')).not.toContain('No deal size');
  });

  it('a deal_id pointing at a deal that no longer exists is reported, not rendered blank', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1', 'ghost'] })], [deal()], NOW);
    expect(out[0].accounts).toHaveLength(1);
    expect(out[0].gaps.join(' ')).toContain('no longer resolve');
  });
});

describe('an unparseable date scores zero, not "now"', () => {
  it('a malformed date does not float to the top', () => {
    // Treating an unknown date as the present is the benign-looking default
    // that puts every broken row above every good one.
    const out = rankHeadlines(
      [
        item({ id: 'broken', published_at: 'not-a-date', cached_at: 'also-not' }),
        item({ id: 'fine', published_at: '2026-08-15T11:00:00Z' }),
      ],
      [],
      NOW,
    );
    expect(out[0].item.id).toBe('fine');
  });

  it('an older item ranks below a newer one, all else equal', () => {
    const out = rankHeadlines(
      [
        item({ id: 'old', published_at: '2026-08-01T09:00:00Z' }),
        item({ id: 'new', published_at: '2026-08-15T09:00:00Z' }),
      ],
      [],
      NOW,
    );
    expect(out[0].item.id).toBe('new');
  });
});

describe('provenance and breaking contribute, and say that they did', () => {
  it('verified outranks inferred', () => {
    const out = rankHeadlines(
      [item({ id: 'inf', tier: 'inferred' }), item({ id: 'ver', tier: 'verified' })],
      [],
      NOW,
    );
    expect(out[0].item.id).toBe('ver');
    expect(out[0].reasons).toContain('Verified source');
  });

  it('breaking lifts an item and is named', () => {
    const out = rankHeadlines(
      [item({ id: 'plain' }), item({ id: 'brk', breaking: true })],
      [],
      NOW,
    );
    expect(out[0].item.id).toBe('brk');
    expect(out[0].reasons).toContain('Breaking');
  });

  it('an outreach hook is carried through verbatim, never regenerated', () => {
    const out = rankHeadlines([item({ action: 'Call Acme about the rate case.' })], [], NOW);
    expect(out[0].hook).toBe('Call Acme about the rate case.');
  });
});

describe('the ordering is stable and bounded', () => {
  it('two identically-scored items do not reorder between runs', () => {
    // A list that shuffles on refresh reads as broken.
    const items = [item({ id: 'b' }), item({ id: 'a' })];
    const first = rankHeadlines(items, [], NOW).map((h) => h.item.id);
    const second = rankHeadlines([...items].reverse(), [], NOW).map((h) => h.item.id);
    expect(first).toEqual(second);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `i${i}` }));
    expect(rankHeadlines(many, [], NOW, { limit: 5 })).toHaveLength(5);
  });

  it('includeUnmapped:false drops items with no account, and is NOT the default', () => {
    const items = [item({ id: 'mapped', deal_ids: ['d1'] }), item({ id: 'loose' })];
    expect(rankHeadlines(items, [deal()], NOW)).toHaveLength(2);
    expect(rankHeadlines(items, [deal()], NOW, { includeUnmapped: false })).toHaveLength(1);
  });

  it('the score is never rendered as a claim — it carries no units anywhere', () => {
    const out = rankHeadlines([item({ deal_ids: ['d1'] })], [deal({ size_usd_m: 45 })], NOW);
    // Reasons are sentences about the world. None of them quote the score.
    for (const reason of out[0].reasons) {
      expect(reason).not.toContain(String(out[0].score));
    }
  });
});

describe('the summary line counts what it says it counts', () => {
  it('reports how many of the ranked items touch the pipeline', () => {
    const out = rankHeadlines(
      [item({ id: 'a', deal_ids: ['d1'] }), item({ id: 'b' })],
      [deal()],
      NOW,
    );
    expect(headlineSummary(out)).toContain('1 of 2');
  });

  it('names up to three companies and counts the rest', () => {
    const deals = ['d1', 'd2', 'd3', 'd4'].map((id, n) =>
      deal({ id, company: `Co${n}` }),
    );
    const out = rankHeadlines([item({ deal_ids: ['d1', 'd2', 'd3', 'd4'] })], deals, NOW);
    const line = headlineSummary(out)!;
    expect(line).toContain('Co0');
    expect(line).toContain('and 1 more');
  });
});
