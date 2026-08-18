import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE REST OF THE BLAST RADIUS, ENUMERATED AND HELD FLAT.
 * ═══════════════════════════════════════════════════════════════
 *
 * The audit that started at lib/data.ts did not end there. Every consumer of
 * getAdminClient shares ONE cached client, so the day that client's key is
 * refused, every one of them fails at once — and the ones written as
 *
 *   const { data } = await client.from('x').select(...)
 *
 * cannot tell a refusal from an empty table.
 *
 * lib/data.ts is fixed. Twelve sites elsewhere are not, and fixing them
 * properly means deciding, per surface, what an outage should look like there
 * — which is real design work, not a mechanical edit. Doing it badly would
 * replace a quiet wrong answer with a loud wrong answer.
 *
 * ══ SO THIS FILE HOLDS THE LINE INSTEAD OF PRETENDING ══
 *
 * It enumerates every raw-query destructure that ignores `error`, derives N by
 * scanning rather than by listing, and requires each one to be on an allowlist
 * with a stated consequence. A new one cannot be added without writing down
 * what it does when the read fails, and the count cannot grow.
 *
 * ⚠️ AN ALLOWLIST IS A HARDCODED LIST, WHICH RULE 18 CALLS THE WEAKEST KIND OF
 * CLAIM. That is true and it is why the SCAN is the authority here: the list
 * only says which findings are known. The scan says how many there are, and
 * disagreement in either direction fails.
 */

const ROOTS = ['app', 'lib'];

/** Wrappers that already handle their own error internally. */
const SAFE_WRAPPERS = [
  'getDeals',
  'getDeal(',
  'getRecentSignals',
  'getSignalsForDeal',
  'getMarketWatchForDeal',
  'getMarketWatch(',
  'getStageTransitions',
  'getCcusEvents',
  'getFeedItemsByKeys',
  'getUserSettings',
  'getAppState',
];

const BARE = /const \{ *(?:data|count)(?:: *\w+)? *\} = await/;

/**
 * Known, accepted, and each one says what it does when the read is refused.
 * Not "these are fine" — "these are the ones I have looked at and left."
 */
const KNOWN: Record<string, string> = {
  'app/api/cron/recap/route.ts':
    'cross-user sweep; a refused read produces an empty recap for that user rather than an error. Not user-facing at request time.',
  'app/api/feed/sweep/route.ts':
    'the sweep maps nothing and reports zero items swept, which reads as "no news today".',
  'app/api/recap/route.ts':
    'recap renders over an empty pipeline — "nothing moved this week" about a book that did move.',
  'app/app/economics/page.tsx':
    'the deal-context strip vanishes; Economics renders as though no deal was linked.',
  'lib/competitive.ts':
    'THE WORST OF THE TWELVE. Empty is the documented zero-click default (do-nothing + grid are on with no rows), so a refused read is indistinguishable from the intended state by design.',
  'lib/economics/scenarios.ts':
    'pinned scenarios disappear from the deal; the tray reads as never used.',
  'lib/map/store.ts':
    'falls back to the starter MAP sequence, which is a real and useful state — so the fallback looks correct.',
  'lib/research.ts': 'research context is empty; generated documents cite nothing and say so.',
  'lib/utility/store.ts': 'the utility list is empty; resolveUtilityContext returns null.',
  'lib/win-loss.ts':
    'two sites. "No outcomes logged" on an account that has them — a sentence about the operator\'s record-keeping.',
};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...(await walk(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function findBlindSites(): Promise<{ file: string; line: number }[]> {
  const hits: { file: string; line: number }[] = [];
  for (const root of ROOTS) {
    for (const file of await walk(root)) {
      const src = await readFile(file, 'utf8');
      if (!/ownerSelect|withOwner|getAdminClient/.test(src)) continue;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!BARE.test(lines[i])) continue;
        // Skip the documented examples inside comment blocks — a comment
        // quoting the defective form is not the defective form. This bit the
        // migration tiebreak assertion the same way.
        if (/^\s*(\*|\/\/|\/\*)/.test(lines[i])) continue;
        const ctx = lines.slice(i, i + 3).join(' ');
        if (SAFE_WRAPPERS.some((w) => ctx.includes(w))) continue;
        hits.push({ file, line: i + 1 });
      }
    }
  }
  return hits;
}

describe('every remaining error-blind read is known and named', () => {
  it('the scan finds sites, and knows how it derived that number', async () => {
    const hits = await findBlindSites();
    // Loudest possible finding if the scan stops working: a scan that finds
    // nothing would make every assertion below pass while proving nothing.
    expect(hits.length, 'the scan found no sites at all — check the matcher').toBeGreaterThan(0);
  });

  it('lib/data.ts has none left', async () => {
    const hits = await findBlindSites();
    expect(hits.filter((h) => h.file === 'lib/data.ts')).toHaveLength(0);
  });

  it('every site is on the allowlist with a stated consequence', async () => {
    const hits = await findBlindSites();
    for (const h of hits) {
      expect(
        KNOWN[h.file],
        `${h.file}:${h.line} ignores its query error and is not in KNOWN. Either destructure error, or add it with what the surface renders when the read is refused.`,
      ).toBeTruthy();
    }
  });

  it('the allowlist has no entries for files that are already fixed', async () => {
    // The other direction. A stale allowlist entry is a claim that a defect
    // exists where it does not, and it silently buys headroom for a new one.
    const hits = await findBlindSites();
    const seen = new Set(hits.map((h) => h.file));
    for (const file of Object.keys(KNOWN)) {
      expect(seen.has(file), `${file} is on the allowlist but has no blind site`).toBe(true);
    }
  });

  it('the count does not grow', async () => {
    /*
      12 at the time of the audit, down from 18 before lib/data.ts and
      app/api/deals/route.ts were fixed. A ceiling, not a target — the number
      is here so that adding a thirteenth is a deliberate act with a failing
      test attached, and so that fixing one shows up as a number to lower.
    */
    const hits = await findBlindSites();
    expect(hits.length).toBeLessThanOrEqual(12);
  });
});
