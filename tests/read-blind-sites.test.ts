import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE BLAST RADIUS IS ZERO, AND THE SCAN CAN STILL FAIL.
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

/**
 * ⚠️ `supabase/functions` WAS NOT IN THIS LIST, AND IT IS A SECOND RUNTIME
 * RUNNING THE SAME CLIENT LIBRARY.
 *
 * The whole audit ran over app/ and lib/ and reported zero, correctly, while
 * four unchecked reads and writes sat in the three Deno edge functions. Rule
 * 18 in its sharpest form: the check was honest about its own scope and the
 * scope was wrong.
 *
 * The worst of the four was stall-alert's days_in_stage tick, which ignored
 * its error entirely. schedule.sql already names the symptom — "if this job
 * stops running, health scores silently stop degrading and stalled deals keep
 * looking healthy" — and an unchecked write produces exactly that WITHOUT the
 * job stopping, so every diagnostic that comment points at reports green.
 */
const ROOTS = ['app', 'lib', 'supabase/functions'];

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
 * ⚠️ THIS USED TO BE AN ALLOWLIST OF TWELVE, EACH WITH ITS CONSEQUENCE. All
 * twelve are fixed, so the list is gone and the assertion is simply zero.
 *
 * That change is dangerous in a specific way and this file has to earn it: an
 * enumeration whose expected answer is ZERO passes identically whether the
 * defect is gone or the SCANNER is broken. Every previous version of this
 * check had a positive count holding it honest. Nothing does now.
 *
 * So the matcher is exercised against a fixture that is known to contain the
 * defect, on every run, before the real scan is trusted. `findBlindSites` and
 * `isBlind` are the same code path — the fixture proves the path still finds
 * what it is looking for.
 */
const FIXTURE_BLIND = [
  "  const { data } = await client.from('deals').select('*');",
  '  const { data: rows } = await client.from(\'deals\').select(\'*\');',
  "  const { count } = await client.from('deals').select('id', { count: 'exact' });",
];

const FIXTURE_FINE = [
  "  const { data, error } = await client.from('deals').select('*');",
  "  const { data: deals } = await getDeals();",
  "  // const { data } = await client.from('deals').select('*');",
  "   * const { data } = await query...;",
];

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

async function sourceCount(): Promise<number> {
  let n = 0;
  for (const root of ROOTS) n += (await walk(root)).length;
  return n;
}

async function findBlindSites(): Promise<{ file: string; line: number }[]> {
  const hits: { file: string; line: number }[] = [];
  for (const root of ROOTS) {
    for (const file of await walk(root)) {
      const src = await readFile(file, 'utf8');
      // `serviceClient` is the Deno runtime's equivalent of getAdminClient.
      if (!/ownerSelect|withOwner|getAdminClient|serviceClient/.test(src)) continue;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const ctx = lines.slice(i, i + 3).join(' ');
        // Five lines of lookback, so a reason can be a paragraph rather than a
        // sentence squeezed onto one line.
        const preceding = lines.slice(Math.max(0, i - 5), i).join('\n');
        if (isBlind(lines[i], ctx, preceding)) hits.push({ file, line: i + 1 });
      }
    }
  }
  return hits;
}

/**
 * An explicit, REASONED exemption, written at the site rather than in a list
 * here.
 *
 * ⚠️ THIS IS STILL AN ALLOWLIST AND IT IS THE LEAST BAD SHAPE FOR ONE. A list
 * in this file drifts from the code silently — the entry outlives the line it
 * was written for, and nothing notices. A marker on the line cannot: delete
 * the read and the marker goes with it, move the read and the marker moves.
 *
 * The reason is mandatory. `// error-blind-ok:` with nothing after it does not
 * exempt anything, because an exemption with no argument is the thing this
 * whole audit was about.
 */
const EXEMPT = /\/\/\s*error-blind-ok:\s*\S+/;

/** The single predicate, shared by the fixture check and the real scan. */
function isBlind(line: string, ctx: string, preceding = ''): boolean {
  if (!BARE.test(line)) return false;
  if (/^\s*(\*|\/\/|\/\*)/.test(line)) return false;
  if (EXEMPT.test(preceding)) return false;
  return !SAFE_WRAPPERS.some((w) => ctx.includes(w));
}

describe('the scanner still finds what it is looking for', () => {
  it('flags every line in the known-bad fixture', () => {
    // Rule 4: a check that has only ever seen the passing case is unproven,
    // and an expected count of zero is nothing BUT the passing case.
    for (const line of FIXTURE_BLIND) {
      expect(isBlind(line, line), `missed: ${line}`).toBe(true);
    }
  });

  it('flags nothing in the known-good fixture', () => {
    for (const line of FIXTURE_FINE) {
      expect(isBlind(line, line), `false positive: ${line}`).toBe(false);
    }
  });

  it('an exemption needs a reason, and a bare marker is not one', () => {
    const blind = FIXTURE_BLIND[0];
    expect(isBlind(blind, blind, '// error-blind-ok: bookkeeping path')).toBe(false);
    // The marker alone exempts nothing.
    expect(isBlind(blind, blind, '// error-blind-ok:')).toBe(true);
    expect(isBlind(blind, blind, '// error-blind-ok')).toBe(true);
    // And an unrelated comment above a blind read is still a blind read.
    expect(isBlind(blind, blind, '// load the deals for this user')).toBe(true);
  });

  it('the real scan reads the whole app', async () => {
    const files = await sourceCount();
    expect(files).toBeGreaterThan(50);
  });
});

describe('no error-blind read remains', () => {
  it('finds none, anywhere in app/ or lib/', async () => {
    /*
      Twelve when the audit started, eighteen before lib/data.ts. Each was
      fixed where its consequence lived rather than uniformly:

        competitive     the no-decision and pricing-defense cards refuse
                        rather than generate against an unknown position
        recap crons     throw, because storeRecap PERSISTS what it is given
        feed sweep      throws, matching its own settings read one line up
        map plan        throws — its fallback is a real and useful starter
                        sequence, which made it the most convincing of the twelve
        win-loss        blocked panel; "N of M carry a verbatim" is a measurement
        utility record  a named gap, the channel that module already uses
        economics       the deal-context strip says it was refused instead of vanishing
        scenarios       stops saying "Deal not found." about a read that never ran
        research        throws; it feeds documents a customer reads
    */
    const hits = await findBlindSites();
    const shown = hits.map((h) => `${h.file}:${h.line}`).join('\n  ');
    expect(hits, `error-blind reads found:\n  ${shown}`).toHaveLength(0);
  });
});
