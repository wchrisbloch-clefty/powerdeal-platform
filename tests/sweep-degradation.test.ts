import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE SUMMARY IS AN ENHANCEMENT. THE ITEM IS THE ARTIFACT.
 * ═══════════════════════════════════════════════════════════════
 *
 * The first working sweep stored 60 items and 33 of them had no `synthesis`.
 * That is CORRECT DEGRADATION and it is not to be "fixed". An item with a
 * headline, a source, a date, an account mapping and an outreach hook is
 * useful. The same item withheld because a free-tier model was rate-limited is
 * not useful at all.
 *
 * This file is a behavioural test, not a source-text one. It drives the real
 * `runSweep` with every model call throwing, and asserts on the rows that
 * reach the database. A source assertion would have passed against the version
 * that DISCARDED those items, because the discard lived in the caller's catch
 * block and looked like ordinary error handling.
 *
 * That version was real: `processItem` let the throw escape, and the sweep's
 * loop recorded an error and never pushed the row. An afternoon with every
 * provider down would have produced an EMPTY FEED rather than sixty
 * unsummarized headlines — and nothing in the suite could see it.
 */

const summarizeItem = vi.fn();
const fetchSources = vi.fn();

vi.mock('@/lib/engine/summarize', () => ({
  summarizeItem: (...args: unknown[]) => summarizeItem(...args),
  CACHE_TTL_HOURS: 24,
}));

vi.mock('@/lib/engine/rss', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine/rss')>();
  return { ...actual, fetchSources: (...args: unknown[]) => fetchSources(...args) };
});

vi.mock('@/lib/engine/class-vi-trackers', () => ({
  fetchClassViTrackers: async () => [],
}));

vi.mock('@/lib/engine/fetch-content', () => ({
  fetchContent: async (_url: string, fallback: string) => ({ text: fallback, source: 'feed' }),
}));

vi.mock('@/lib/engine/model-routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine/model-routing')>();
  return { ...actual, canRun: () => true };
});

const rawItem = (n: number) => ({
  key: `key-${n}`,
  title: `Headline ${n}`,
  url: `https://example.com/${n}`,
  summary: '',
  content: `Body of item ${n}.`,
  byline: null,
  imageUrl: null,
  publishedAt: new Date().toISOString(),
  sourceId: 'src',
  sourceName: 'Example Wire',
  category: 'power-markets',
  platform: 'rss',
  defaultTier: 'reported' as const,
  role: 'core' as const,
});

/**
 * A Supabase double that records what was written.
 *
 * Deliberately hand-rolled rather than a mocking library: the whole class of
 * bug this build keeps finding is `supabase-js` RESOLVING with `{ error }`
 * instead of throwing, and a double that throws would test a client we do not
 * have.
 */
function fakeSupabase() {
  const upserted: Record<string, unknown>[][] = [];
  const inserted: Record<string, unknown>[][] = [];

  const selectChain = {
    select: () => selectChain,
    eq: () => selectChain,
    in: () => selectChain,
    gte: () => Promise.resolve({ data: [], error: null }),
  };

  return {
    upserted,
    inserted,
    client: {
      from(table: string) {
        return {
          ...selectChain,
          upsert(rows: Record<string, unknown>[]) {
            upserted.push(rows);
            return Promise.resolve({ error: null });
          },
          insert(rows: Record<string, unknown>[]) {
            inserted.push(rows);
            return Promise.resolve({ error: null });
          },
          _table: table,
        };
      },
    },
  };
}

beforeEach(() => {
  summarizeItem.mockReset();
  fetchSources.mockReset();
  fetchSources.mockResolvedValue([rawItem(1), rawItem(2), rawItem(3)]);
});

describe('every provider is down', () => {
  it('STORES ALL THREE ITEMS with a null synthesis', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockRejectedValue(new Error('Groq 429 · Gemini 404 · Claude 529'));

    const db = fakeSupabase();
    const result = await runSweep(db.client as never, 'user-1', []);

    expect(result.new_items).toBe(3);
    const rows = db.upserted.flat();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.synthesis).toBeNull();
    }
  });

  it('keeps everything the item has WITHOUT a model — the parts that make it useful', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockRejectedValue(new Error('all providers failed'));

    const db = fakeSupabase();
    await runSweep(db.client as never, 'user-1', []);

    const row = db.upserted.flat()[0];
    expect(row.title).toBe('Headline 1');
    expect(row.url).toBe('https://example.com/1');
    expect(row.url_hash).toBe('key-1');
    expect(row.source_name).toBe('Example Wire');
    expect(row.published_at).toBeTruthy();
    expect(row.tier).toBeTruthy();
    expect(row.user_id).toBe('user-1');
  });

  it('reports WHY the summaries are missing instead of swallowing it', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockRejectedValue(new Error('Groq 429: rate limit reached'));

    const db = fakeSupabase();
    const result = await runSweep(db.client as never, 'user-1', []);

    expect(result.errors.join(' ')).toContain('Groq 429');
    // The error must not read as a lost item, because no item was lost.
    expect(result.errors.join(' ')).toContain('item kept');
  });

  it('a partial outage keeps BOTH kinds — summarized and not', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem
      .mockResolvedValueOnce({ text: 'A real summary.', provider: 'claude', cached: false })
      .mockRejectedValueOnce(new Error('Groq 429'))
      .mockResolvedValueOnce({ text: 'Another summary.', provider: 'claude', cached: false });

    const db = fakeSupabase();
    const result = await runSweep(db.client as never, 'user-1', []);

    expect(result.new_items).toBe(3);
    const synths = db.upserted.flat().map((r) => r.synthesis);
    expect(synths).toEqual(['A real summary.', null, 'Another summary.']);
  });
});

describe('a null synthesis has three causes and all three keep the item', () => {
  it('NOT RELEVANT stores null — the model judged it, and did not invent relevance', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockResolvedValue({ text: 'NOT RELEVANT', provider: 'groq', cached: false });

    const db = fakeSupabase();
    const result = await runSweep(db.client as never, 'user-1', []);

    expect(result.new_items).toBe(3);
    expect(db.upserted.flat().every((r) => r.synthesis === null)).toBe(true);
    // Nothing failed here, so nothing is reported as a failure.
    expect(result.errors).toEqual([]);
  });

  it('an EMPTY completion stores null, not an empty string masquerading as a summary', async () => {
    // `''` is not NOT RELEVANT and was not null, so it stored as a summary
    // that renders as a blank line under a headline.
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockResolvedValue({ text: '   ', provider: 'gemini', cached: false });

    const db = fakeSupabase();
    await runSweep(db.client as never, 'user-1', []);

    for (const row of db.upserted.flat()) {
      expect(row.synthesis).toBeNull();
      expect(row.synthesis).not.toBe('');
    }
  });

  it('a genuine summary is still stored — the degradation path did not eat the happy path', async () => {
    const { runSweep } = await import('@/lib/engine/sweep');
    summarizeItem.mockResolvedValue({
      text: 'Something happened. It moves a deal.',
      provider: 'claude',
      cached: false,
    });

    const db = fakeSupabase();
    await runSweep(db.client as never, 'user-1', []);

    expect(db.upserted.flat()[0].synthesis).toBe('Something happened. It moves a deal.');
  });
});

describe('the rule is written down where someone about to break it will read it', () => {
  it('processItem carries the instruction, not just the behaviour', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    expect(src).toContain('THE SUMMARY IS AN ENHANCEMENT. THE ITEM IS THE ARTIFACT');
    expect(src).toContain('Do not "fix" this by rethrowing');
  });

  it('the schema still allows it — a NOT NULL here would make the code unreachable', async () => {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const feedItems = /create table if not exists feed_items\s*\(([\s\S]*?)\n\);/i.exec(sql)![1];
    const synthesisLine = feedItems
      .split('\n')
      .find((l) => /^\s*synthesis\s/.test(l))!;
    expect(synthesisLine).toBeTruthy();
    expect(synthesisLine.toLowerCase()).not.toContain('not null');
  });
});
