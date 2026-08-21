import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';

/**
 * ═══════════════════════════════════════════════════════════════
 * VALUES THAT DEPEND ON WHEN YOU LOOK.
 * ═══════════════════════════════════════════════════════════════
 *
 * `relativeTime` reads the clock. Rendered on the server and again at
 * hydration, a timestamp crossing a rounding boundary in the gap produces two
 * different strings and React throws #418.
 *
 * ⚠️ THE COST WAS TO THE CHECK, NOT THE READER. `render-check` went red on it
 * about one run in four. An intermittent gate teaches you to re-run until
 * green, which is how a check stops meaning anything — the same lesson as a
 * pkill that appeared to work twice.
 *
 * Thirteen call sites had the raw call. The fourteenth is what this file
 * exists to stop.
 */

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const TIME_AGO = 'components/ui/time-ago.tsx';

describe('a clock never renders directly into a component', () => {
  it('relativeTime is called in exactly one component', async () => {
    const files = [...(await walk('components')), ...(await walk('app'))];
    expect(files.length).toBeGreaterThan(40);

    const callers = [];
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\brelativeTime\s*\(/.test(code)) callers.push(f);
    }
    expect(callers).toEqual([TIME_AGO]);
  });

  it('and that one declares the mismatch rather than hiding it', async () => {
    const src = await readFile(TIME_AGO, 'utf8');
    expect(src).toContain('suppressHydrationWarning');
    // On the span holding the time, never on a container: a container would
    // suppress the check for everything inside it, including real bugs.
    expect(src).toMatch(/<span[^>]*suppressHydrationWarning/);
  });

  it('suppression happens in exactly two places, each with a stated reason', async () => {
    /**
     * ⚠️ RULE 18 ON THE ESCAPE HATCH ITSELF. `suppressHydrationWarning` turns
     * off a correctness check, and the second use is always easier to justify
     * than the first. So the list is enumerated here, and adding to it means
     * editing this test and writing down why.
     *
     *   · components/ui/time-ago.tsx — a relative time is a function of when it
     *     was rendered, so the two sides are EXPECTED to differ.
     *   · app/layout.tsx — THEME_BOOTSTRAP runs before hydration and writes the
     *     theme onto <html>, so the class attribute the server wrote is
     *     deliberately not the one the browser holds. React's suppression is
     *     not deep: it covers this element's own attributes, not descendants'
     *     mismatches, which is what makes it safe on the root.
     *
     * ⚠️ COMMENTS ARE STRIPPED FIRST. The first run of this flagged
     * agent-health.tsx, on the strength of a comment I had written EXPLAINING
     * the mechanism. A check that reads prose as code reports on the
     * documentation.
     */
    const allowed = [TIME_AGO, 'app/layout.tsx'];
    const files = [...(await walk('components')), ...(await walk('app'))];
    const users = [];
    for (const f of files) {
      const code = (await readFile(f, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (code.includes('suppressHydrationWarning')) users.push(f);
    }
    expect(users.sort()).toEqual([...allowed].sort());
  });

  it('renders a fallback rather than a fabricated date for a missing value', async () => {
    const src = await readFile(TIME_AGO, 'utf8');
    expect(src).toContain("fallback = '—'");
    expect(src).toMatch(/if \(!value\) return/);
  });
});

describe('the other clock readers', () => {
  it('no component reads the clock straight into JSX', async () => {
    /**
     * The same defect in a different costume: any clock read during render is a
     * value the server and the client disagree about. Handlers and effects are
     * fine — they only ever run on the client.
     *
     * ⚠️ THIS IS NARROW ON PURPOSE, AND THE FIRST VERSION WAS NOT. Matching any
     * `{ … Date.now() … }` found three hits and all three were false: two
     * object literals inside functions, and one `${Date.now()}` inside a
     * TEMPLATE LITERAL generating a scenario id. Without a parser, `{` cannot
     * be told apart from `{` — a JSX expression container, an object literal
     * and a template interpolation look identical to a regex.
     *
     * So this matches only the unambiguous shape: an expression container
     * sitting directly after a JSX tag, `>{ … Date.now() … }`. It will not
     * catch every case and says so rather than implying it does. The precise
     * assertions above are the ones carrying weight; this is the cheap second
     * net for the common form.
     */
    const files = [...(await walk('components')), ...(await walk('app'))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(
        />\s*\{[^{}\n]*\b(?:Date\.now\(\)|new Date\(\))[^{}\n]*\}/g,
      )) {
        offenders.push(`${f}: ${m[0].trim().slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and that net actually catches the shape it claims to', async () => {
    // Rule 4: a matcher that has only ever seen the passing case is unproven,
    // and the first version of the one above matched three things it should
    // not have. This runs it against the string it exists for.
    const pattern = />\s*\{[^{}\n]*\b(?:Date\.now\(\)|new Date\(\))[^{}\n]*\}/g;
    expect('<span>{new Date().toLocaleTimeString()}</span>').toMatch(pattern);
    expect("id: `sc-${Date.now().toString(36)}`,").not.toMatch(pattern);
    expect("log({ kind: 'visit', ms: Date.now() - at });").not.toMatch(pattern);
  });
});
