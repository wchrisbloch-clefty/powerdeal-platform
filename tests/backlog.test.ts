import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * ⚠️ THE STALE-COMMENT CLASS, IN A DOCUMENT.
 *
 * Item 1 read "Nothing in the application ever changes a deal's stage" for ten
 * days after it shipped. The `**Status:** SHIPPED` line was directly underneath
 * it, and the author of this repo still reported six open items to the operator
 * when there were three — by reading the headings, which is what everybody
 * reads.
 *
 * A heading in the present tense goes on looking true after it stops being
 * true. This asserts the convention rather than trusting it, because the whole
 * point is that nobody re-reads the body.
 */

const STATES = ['OPEN', 'BLOCKED', 'SHIPPED', 'CLOSED', 'CUT', 'REMOVED FROM SCOPE'];

describe('every backlog heading carries its state', () => {
  it('no numbered item is stateless', async () => {
    const src = await readFile('docs/BACKLOG.md', 'utf8');
    const headings = [...src.matchAll(/^## (\d+)\.\s+(.+)$/gm)].map((m) => ({
      n: m[1],
      text: m[2],
    }));

    // Rule 10: zero headings would make every assertion below vacuous.
    expect(headings.length).toBeGreaterThan(5);

    for (const h of headings) {
      const stated = STATES.some((s) => h.text.toUpperCase().includes(s));
      expect(stated, `item ${h.n} — "${h.text}" — does not say its state`).toBe(true);
    }
  });

  it('the summary table lists every item, so the count is not eyeballed', async () => {
    const src = await readFile('docs/BACKLOG.md', 'utf8');
    const headings = [...src.matchAll(/^## (\d+)\./gm)].map((m) => m[1]);
    const table = src.slice(src.indexOf('## Where things stand'), src.indexOf('## 1.'));

    for (const n of headings) {
      expect(table, `item ${n} is missing from the summary table`).toMatch(
        new RegExp(`^\\|\\s*${n}\\s*\\|`, 'm'),
      );
    }
  });

  it('and the table agrees with the headings about what is live', async () => {
    /**
     * The failure this catches is the one that already happened: a table and a
     * set of headings drifting apart, so a reader gets a different answer
     * depending on which they looked at.
     */
    const src = await readFile('docs/BACKLOG.md', 'utf8');
    const table = src.slice(src.indexOf('## Where things stand'), src.indexOf('## 1.'));
    const liveInTable = [...table.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|\s*\*\*(OPEN|BLOCKED)\*\*/gm)]
      .map((m) => m[1])
      .sort();

    const liveInHeadings = [...src.matchAll(/^## (\d+)\.\s+(.+)$/gm)]
      .filter((m) => /—\s*(OPEN|BLOCKED)\b/.test(m[2]))
      .map((m) => m[1])
      .sort();

    expect(liveInTable).toEqual(liveInHeadings);
    expect(liveInTable.length).toBeGreaterThan(0);
  });
});
