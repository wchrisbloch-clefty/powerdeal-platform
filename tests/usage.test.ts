import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  emptyUsage,
  recordVisit,
  recordWish,
  recordAction,
  report,
  reportHeadline,
  formatMs,
  MAX_WISHES,
  MAX_ACTIONS,
  type UsageState,
} from '@/lib/usage';
import { KNOWN_SURFACES, surfaceKey } from '@/lib/surfaces';

/**
 * INSTRUMENTATION FOR THE USAGE WEEK.
 *
 * The build stops and the platform gets used. The question is what that week
 * shows, as opposed to what gets remembered on Friday.
 *
 * Recollection fails in three specific ways and each has a test here:
 * it remembers what was interesting rather than what was used, it cannot see
 * absence at all, and it loses the thought at the moment of friction.
 */

const KNOWN = [
  { path: '/app', label: 'Dashboard' },
  { path: '/app/maps', label: 'Maps' },
  { path: '/app/forge', label: 'Forge' },
];

describe('absence is the finding memory cannot produce', () => {
  it('a surface nobody opened is a ROW, not a missing row', () => {
    const state = recordVisit(emptyUsage(), '/app', 5000, '2026-08-15T09:00:00Z');
    const r = report(state, KNOWN);
    expect(r.surfaces).toHaveLength(3);
    expect(r.neverOpened.map((s) => s.path).sort()).toEqual(['/app/forge', '/app/maps']);
  });

  it('every surface carries an explicit neverOpened flag', () => {
    const r = report(emptyUsage(), KNOWN);
    expect(r.surfaces.every((s) => s.neverOpened)).toBe(true);
    expect(r.totals.surfacesOpened).toBe(0);
    expect(r.totals.surfacesExisting).toBe(3);
  });

  it('the headline LEADS with what was never opened', () => {
    const state = recordVisit(emptyUsage(), '/app', 60_000, '2026-08-15T09:00:00Z');
    expect(reportHeadline(report(state, KNOWN))).toContain('never opened');
  });

  it('nothing recorded is not "the platform went unused"', () => {
    // The seed-state lesson: a read with no data is not a fact about usage.
    expect(reportHeadline(report(emptyUsage(), KNOWN))).toContain('no visit has been written');
  });

  it('a visited path that is NOT in the known list still appears', () => {
    // The list can fall behind the app. Dropping the row would hide real usage.
    const state = recordVisit(emptyUsage(), '/app/brand-new', 1000, '2026-08-15T09:00:00Z');
    const r = report(state, KNOWN);
    expect(r.surfaces.find((s) => s.path === '/app/brand-new')).toBeTruthy();
    expect(r.surfaces.find((s) => s.path === '/app/brand-new')!.neverOpened).toBe(false);
  });
});

describe('opens and dwell are kept apart, because they answer different questions', () => {
  it('twenty short visits and one long one are distinguishable', () => {
    let state = emptyUsage();
    for (let i = 0; i < 20; i++) {
      state = recordVisit(state, '/app/maps', 400, '2026-08-15T09:00:00Z');
    }
    state = recordVisit(state, '/app/forge', 600_000, '2026-08-15T10:00:00Z');

    const r = report(state, KNOWN);
    const maps = r.surfaces.find((s) => s.path === '/app/maps')!;
    const forge = r.surfaces.find((s) => s.path === '/app/forge')!;

    expect(maps.openedCount).toBe(20);
    expect(forge.openedCount).toBe(1);
    expect(forge.totalMs).toBeGreaterThan(maps.totalMs);
  });

  it('a visit with ZERO dwell is still an open — arguably the strongest signal', () => {
    // Opened and immediately left is a real finding. Discarding it would make
    // the surface look untouched rather than rejected.
    const state = recordVisit(emptyUsage(), '/app/maps', 0, '2026-08-15T09:00:00Z');
    const row = report(state, KNOWN).surfaces.find((s) => s.path === '/app/maps')!;
    expect(row.openedCount).toBe(1);
    expect(row.totalMs).toBe(0);
    expect(row.neverOpened).toBe(false);
  });

  it('a nonsense duration does not corrupt the total', () => {
    let state = recordVisit(emptyUsage(), '/app', Number.NaN, '2026-08-15T09:00:00Z');
    state = recordVisit(state, '/app', -5000, '2026-08-15T09:00:00Z');
    state = recordVisit(state, '/app', Infinity, '2026-08-15T09:00:00Z');
    expect(state.surfaces['/app'].totalMs).toBe(0);
    expect(state.surfaces['/app'].openedCount).toBe(3);
  });

  it('firstAt is preserved across visits and lastAt moves', () => {
    let state = recordVisit(emptyUsage(), '/app', 100, '2026-08-15T09:00:00Z');
    state = recordVisit(state, '/app', 100, '2026-08-16T09:00:00Z');
    expect(state.surfaces['/app'].firstAt).toBe('2026-08-15T09:00:00Z');
    expect(state.surfaces['/app'].lastAt).toBe('2026-08-16T09:00:00Z');
  });
});

describe('a wish is about somewhere, and an empty one is not a wish', () => {
  it('carries the surface it was written from', () => {
    const state = recordWish(emptyUsage(), {
      text: 'showed me which of these moved a deal',
      path: '/app/pipeline',
      at: '2026-08-15T09:00:00Z',
    });
    expect(state.wishes[0].path).toBe('/app/pipeline');
  });

  it('whitespace-only is dropped rather than stored as a blank row', () => {
    const state = recordWish(emptyUsage(), { text: '   \n ', path: '/app', at: 'x' });
    expect(state.wishes).toHaveLength(0);
  });

  it('trims, so a stray newline does not become part of the thought', () => {
    const state = recordWish(emptyUsage(), { text: '  fix the map  \n', path: '/app', at: 'x' });
    expect(state.wishes[0].text).toBe('fix the map');
  });

  it('newest first in the report — the freshest is the one still worth acting on', () => {
    let state = recordWish(emptyUsage(), { text: 'first', path: '/app', at: 'a' });
    state = recordWish(state, { text: 'second', path: '/app', at: 'b' });
    expect(report(state, KNOWN).wishes[0].text).toBe('second');
  });

  it('drops the OLDEST when capped, never the newest', () => {
    let state: UsageState = emptyUsage();
    for (let i = 0; i < MAX_WISHES + 10; i++) {
      state = recordWish(state, { text: `w${i}`, path: '/app', at: 'x' });
    }
    expect(state.wishes).toHaveLength(MAX_WISHES);
    expect(state.wishes.at(-1)!.text).toBe(`w${MAX_WISHES + 9}`);
    expect(state.wishes[0].text).toBe('w10');
  });
});

describe('actions separate friction from success', () => {
  it('tallies failures alongside counts', () => {
    let state = recordAction(emptyUsage(), { action: 'generate:brief', path: '/app', at: 'a' });
    state = recordAction(state, { action: 'generate:brief', path: '/app', at: 'b', error: '429' });
    state = recordAction(state, { action: 'sweep', path: '/app', at: 'c' });

    const tally = report(state, KNOWN).actionTally;
    const brief = tally.find((t) => t.action === 'generate:brief')!;
    expect(brief.count).toBe(2);
    expect(brief.failures).toBe(1);
    expect(tally.find((t) => t.action === 'sweep')!.failures).toBe(0);
  });

  it('sorts by how often, so the loudest action leads', () => {
    let state = emptyUsage();
    state = recordAction(state, { action: 'rare', path: '/app', at: 'a' });
    for (let i = 0; i < 5; i++) {
      state = recordAction(state, { action: 'common', path: '/app', at: 'b' });
    }
    expect(report(state, KNOWN).actionTally[0].action).toBe('common');
  });

  it('is capped, oldest dropped', () => {
    let state: UsageState = emptyUsage();
    for (let i = 0; i < MAX_ACTIONS + 5; i++) {
      state = recordAction(state, { action: `a${i}`, path: '/app', at: 'x' });
    }
    expect(state.actions).toHaveLength(MAX_ACTIONS);
    expect(state.actions.at(-1)!.action).toBe(`a${MAX_ACTIONS + 4}`);
  });
});

describe('surface keys collapse noise but never collapse the question', () => {
  it('Intelligence is recorded PER TAB — nine views behind one URL answer nothing', () => {
    expect(surfaceKey('/app/intelligence', 'tab=ccus')).toBe('/app/intelligence?tab=ccus');
    expect(surfaceKey('/app/intelligence', 'tab=trending')).toBe('/app/intelligence?tab=trending');
  });

  it('bare Intelligence resolves to the default tab, not to a separate row', () => {
    expect(surfaceKey('/app/intelligence', '')).toBe('/app/intelligence?tab=headlines');
    expect(surfaceKey('/app/intelligence')).toBe('/app/intelligence?tab=headlines');
  });

  it('a deal detail page counts as Pipeline, not as its own surface', () => {
    // A hundred one-visit rows is the raw log with extra steps.
    expect(surfaceKey('/app/pipeline/DC-001')).toBe('/app/pipeline');
  });

  it('unrelated query params are dropped', () => {
    expect(surfaceKey('/app/forge', 'deal=DC-001&mode=pptx')).toBe('/app/forge');
  });
});

describe('the known-surface list cannot fall behind the app', () => {
  it('covers every nav destination', async () => {
    const src = await readFile('components/chrome/nav.tsx', 'utf8');
    const hrefs = [...src.matchAll(/href: '(\/app[^']*)'/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // Intelligence is expanded per tab, so it matches by prefix.
      const covered = KNOWN_SURFACES.some(
        (s) => s.path === href || s.path.startsWith(`${href}?`),
      );
      expect(covered, `${href} is a nav destination with no usage row`).toBe(true);
    }
  });

  it('covers every Intelligence tab', async () => {
    const src = await readFile('components/modules/intel-tabs.tsx', 'utf8');
    const ids = [...src.matchAll(/\{ id: '([a-z-]+)', label:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(
        KNOWN_SURFACES.some((s) => s.path === `/app/intelligence?tab=${id}`),
        `Intelligence tab "${id}" has no usage row`,
      ).toBe(true);
    }
  });

  it('and contains nothing that is not a real destination', async () => {
    // The other direction: an entry here that nothing links to would report a
    // permanent, uninteresting zero and make "never opened" less trusted.
    const nav = await readFile('components/chrome/nav.tsx', 'utf8');
    const tabs = await readFile('components/modules/intel-tabs.tsx', 'utf8');
    const hrefs = new Set([...nav.matchAll(/href: '(\/app[^']*)'/g)].map((m) => m[1]));
    const ids = new Set([...tabs.matchAll(/\{ id: '([a-z-]+)', label:/g)].map((m) => m[1]));

    for (const s of KNOWN_SURFACES) {
      const [base, query] = s.path.split('?');
      if (query) {
        expect(hrefs.has(base), `${s.path} has no matching nav destination`).toBe(true);
        expect(ids.has(query.replace('tab=', '')), `${s.path} is not a real tab`).toBe(true);
      } else {
        expect(hrefs.has(base), `${s.path} is not a nav destination`).toBe(true);
      }
    }
  });
});

describe('durations read as durations', () => {
  it('formats across the ranges', () => {
    expect(formatMs(0)).toBe('0s');
    expect(formatMs(900)).toBe('0s');
    expect(formatMs(45_000)).toBe('45s');
    expect(formatMs(125_000)).toBe('2m 5s');
    expect(formatMs(3_930_000)).toBe('1h 5m');
  });
});

describe('instrumentation never interrupts the work it measures', () => {
  it('the record route answers 200 even when the write fails', async () => {
    const src = await readFile('app/api/usage/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('status: 500');
    expect(code).not.toContain('status: 503');
  });

  it('but the failure is still INSPECTED and reported, not swallowed', async () => {
    const src = await readFile('app/api/usage/route.ts', 'utf8');
    expect(src).toContain('const { error } = await client');
    expect(src).toContain('Write failed:');
  });

  it('the wish box reads `recorded` from the BODY, not res.ok', async () => {
    // The route always answers 200. A box trusting res.ok would report success
    // on every dropped thought.
    const src = await readFile('components/chrome/usage-tracker.tsx', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('if (json.recorded)');
    expect(code).not.toContain('if (res.ok)');
  });

  it('a failed wish keeps the text in the box', async () => {
    const src = await readFile('components/chrome/usage-tracker.tsx', 'utf8');
    expect(src).toContain('nothing was lost');
  });
});
