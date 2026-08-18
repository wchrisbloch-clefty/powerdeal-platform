import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * ═══════════════════════════════════════════════════════════════
 * EVERY READER LOOKS AT `error`. NO EXCEPTIONS, AND N IS DERIVED.
 * ═══════════════════════════════════════════════════════════════
 *
 * supabase-js RESOLVES with `{ data: null, error }` rather than throwing. A
 * reader written like this:
 *
 *   const { data } = await query...;
 *   return (data ?? []) as Signal[];
 *
 * is not "missing error handling" — it is a reader that CANNOT TELL a refused
 * query from an empty table, and reports the second with full confidence.
 * Nothing throws, nothing logs, nothing shows. The surface then renders its
 * designed empty state, which on this platform is a sentence about the
 * operator's own diligence: "No signals logged yet." "Nothing persisted yet."
 * "No CCUS events logged."
 *
 * Six readers in lib/data.ts were written that way. All six shared ONE cached
 * service-role client with getDeals, so the day getDeals started reporting
 * "the database refused the query", those six reported zero rows and a clean
 * bill of health on the same page load.
 *
 * ── WHAT THIS ASSERTS AND HOW N COMES OUT ──
 *
 * Rule 18: a check reporting on N things must say where N came from. N here is
 * every exported async function in lib/data.ts that calls ownerSelect —
 * extracted from the source, not listed. A seventh reader added tomorrow is in
 * scope the moment it is written, which is the property a hardcoded list can
 * never have. The previous version of this idea did not exist at all; the
 * version before the audit was a single assertion about getDeals.
 *
 * What each reader DOES with the error is its own judgement and is not
 * asserted here — getDeals substitutes seed and says so, the collection
 * readers return empty and say so, getUserSettings logs and returns null.
 * Whether it gets to SEE the error is not a judgement call.
 */

const SOURCE = 'lib/data.ts';

interface Reader {
  name: string;
  body: string;
}

/**
 * Split lib/data.ts into its exported async functions.
 *
 * Brace-matched rather than regex-terminated: an earlier version of this idea
 * cut each function at the first `\n}` and silently truncated every one
 * containing a nested block, which made the assertions pass by never reaching
 * the code they were about.
 */
function readers(src: string): Reader[] {
  const out: Reader[] = [];
  const decl = /export async function (\w+)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src))) {
    let depth = 1;
    let i = decl.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ name: m[1], body: src.slice(decl.lastIndex, i - 1) });
  }
  return out;
}

describe('lib/data.ts — no reader can mistake a refused query for an empty one', () => {
  it('the split finds every exported reader, and the file has some', async () => {
    const src = await readFile(SOURCE, 'utf8');
    const found = readers(src);

    // "Nothing to inspect" is this check's loudest finding, not its quietest.
    expect(found.length).toBeGreaterThan(0);

    // Cross-check the derivation against a second, independent count of the
    // same thing. If these disagree the brace matcher is wrong, and a wrong
    // matcher is how a check reports clean over code it never read.
    const declared = (src.match(/^export async function /gm) ?? []).length;
    expect(found).toHaveLength(declared);

    // And the bodies are real — a matcher that returns N empty strings would
    // satisfy every assertion below.
    for (const r of found) {
      expect(r.body.trim().length, `${r.name} extracted as an empty body`).toBeGreaterThan(20);
    }
  });

  it('every reader that queries Supabase inspects the error', async () => {
    const src = await readFile(SOURCE, 'utf8');
    const querying = readers(src).filter((r) => r.body.includes('ownerSelect('));

    expect(querying.length).toBeGreaterThan(0);

    for (const r of querying) {
      const inspects =
        // Destructures it directly...
        /const \{[^}]*\berror\b/.test(r.body) ||
        // ...or delegates to the helper that does, which is asserted below.
        r.body.includes('emptyOr');
      expect(inspects, `${r.name} awaits a query without destructuring error`).toBe(true);
    }
  });

  it('emptyOr — the delegate — actually inspects and reports', async () => {
    /*
      ⚠️ RULE 19: THIS CHECK IS SUBJECT TO THE DEFECT IT TESTS FOR. Accepting
      `emptyOr` as proof of error handling is only sound while emptyOr handles
      errors. Without this assertion, renaming its internals to drop the error
      branch would leave five readers passing a check about error branches.
    */
    const src = await readFile(SOURCE, 'utf8');
    const helper = src.slice(src.indexOf('async function emptyOr'));
    const body = helper.slice(0, helper.indexOf('\n}'));

    expect(body).toMatch(/const \{ data, error \}/);
    expect(body).toContain('describeReadFailure');
    expect(body).toContain('readError: why');
    // An outage is not seed data. Nothing was substituted, so isSeed stays
    // false and the empty array is the absence of an answer, not an answer.
    expect(body).toContain('isSeed: false, readError: why');
  });

  it('no reader returns readError null on a branch that saw an error', async () => {
    /*
      The getFeedItems defect in one assertion: it DID destructure the error, it
      DID log it, and it returned `readError: null` anyway — so every downstream
      surface was told the fallback was a deployment state. Inspecting the error
      and then discarding the finding is the subtler half of this bug and the
      half that survived the first fix by six weeks.
    */
    const src = await readFile(SOURCE, 'utf8');
    for (const r of readers(src)) {
      const errorBranches = r.body.split(/if \(error/).slice(1);
      for (const branch of errorBranches) {
        const upToReturn = branch.slice(0, branch.indexOf('}') + 1);
        expect(
          upToReturn.includes('readError: null'),
          `${r.name} sets readError: null inside an if (error) branch`,
        ).toBe(false);
      }
    }
  });

  it('the empty-collection readers report an outage as an outage, not as zero', async () => {
    const src = await readFile(SOURCE, 'utf8');
    const delegating = readers(src).filter((r) => r.body.includes('emptyOr'));

    // Five when this was written: signals ×2, market watch ×2, stage
    // transitions — plus CCUS events, which used to be the worst of them
    // because it returned isSeed:false and readError:null together, asserting
    // "this IS your real data and there is none of it".
    expect(delegating.length).toBeGreaterThanOrEqual(6);

    for (const r of delegating) {
      // The unconfigured path is a deployment state and stays seed-flagged.
      expect(
        r.body,
        `${r.name} lost its unconfigured branch`,
      ).toContain('if (!query) return { data: [], isSeed: true, readError: null }');
    }
  });

  it('the three that keep a bare return still log the diagnosis', async () => {
    /*
      getUserSettings, getAppState and getFeedItemsByKeys return null / null /
      {}. Not converted to DataResult: each already has a caller-side meaning
      for "absent" that stays honest under failure. But all three used to
      discard `error` entirely, which left a refused read with no trace
      anywhere — including the server log, which is where the operator looks.
    */
    const src = await readFile(SOURCE, 'utf8');
    const bare = readers(src).filter(
      (r) => r.body.includes('ownerSelect(') && !r.body.includes('emptyOr') && !r.body.includes('SEED_DEALS'),
    );

    expect(bare.map((r) => r.name).sort()).toEqual([
      'getAppState',
      'getFeedItemsByKeys',
      'getUserSettings',
    ]);

    for (const r of bare) {
      expect(r.body, `${r.name} inspects error but never reports it`).toContain(
        'describeReadFailure',
      );
    }
  });
});
