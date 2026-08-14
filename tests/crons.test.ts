import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sweepError } from '@/lib/engine/sweep';
import { parseProbeBody, probeDiagnosis } from '@/lib/feed-health';

/**
 * THE TWO FAILING JOBS.
 *
 * Both failures were recorded correctly and diagnosed by neither record. One
 * counted the failures and discarded the messages; the other crashed on the
 * exact condition it exists to detect. Different bugs, same shape: the run
 * ends, something is written down, and nobody can act on it.
 */

describe('feed-sweep records the diagnosis, not just the arithmetic', () => {
  it('carries the real messages through', () => {
    const e = sweepError(1, 1, ['Reuters Energy: 404', 'Store failed: timeout']);
    expect(e).toContain('Reuters Energy: 404');
    expect(e).toContain('Store failed: timeout');
  });

  it('still leads with the count, for scanning', () => {
    expect(sweepError(2, 3, ['x: 500'])).toMatch(/^2 of 3 user sweeps reported errors/);
  });

  it('deduplicates — the same broken source across users is one fact', () => {
    // Passed the RAW per-user lists, with the repeat in them. An earlier
    // version deduped at the call site and this test fed it an already-unique
    // array, so the mutation that removed the dedup passed.
    const e = sweepError(3, 3, [
      'Reuters Energy: 404',
      'Reuters Energy: 404',
      'Reuters Energy: 404',
    ]);
    expect(e!.match(/Reuters Energy: 404/g)).toHaveLength(1);
  });

  it('counts the overflow AFTER deduplicating, not before', () => {
    // Twelve messages that are really three would otherwise report "+9 more"
    // for nine repeats of something already shown.
    const e = sweepError(1, 1, Array.from({ length: 12 }, (_, i) => `Source ${i % 3}: 404`))!;
    expect(e).not.toContain('more');
  });

  it('caps the list rather than writing a wall into a status field', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Source ${i}: 404`);
    const e = sweepError(1, 1, many)!;
    expect(e).toContain('(+7 more)');
    expect(e).not.toContain('Source 11');
  });

  it('flags a failure that reported no message as its own bug', () => {
    // Silence here is not "nothing went wrong" — it is a sweep that knew it
    // failed and could not say why, which is what shipped.
    expect(sweepError(1, 1, [])).toContain('its own bug');
  });

  it('returns null on a clean run — success writes no error text', () => {
    expect(sweepError(0, 3, [])).toBeNull();
  });

  it('the route no longer discards what runSweep reported', async () => {
    const src = await readFile('app/api/feed/sweep/route.ts', 'utf8');
    expect(src).toContain('sweepError(failing.length, users.length, messages)');
    // The old form counted and threw the rest away.
    expect(src).not.toContain('`${failures} of ${users.length} user sweeps reported errors.`');
  });
});

describe('feed-health treats an unparseable body as a finding, not a crash', () => {
  it('parses a good body', () => {
    const r = parseProbeBody('{"sources":[{"id":"a","name":"A","status":"ok"}]}');
    expect(r.ok).toBe(true);
    expect(r.ok && r.sources).toHaveLength(1);
  });

  it('does NOT throw on HTML — that exception was the whole bug', () => {
    // `await res.json()` on this string threw "Unexpected token '<'" and took
    // the run down.
    expect(() => parseProbeBody('<!DOCTYPE html><html>...')).not.toThrow();
    expect(parseProbeBody('<!DOCTYPE html><html>...').ok).toBe(false);
  });

  it('a missing sources key parses to an empty list, not a failure', () => {
    const r = parseProbeBody('{}');
    expect(r.ok).toBe(true);
    expect(r.ok && r.sources).toEqual([]);
  });

  it('names an INTERNAL interstitial as configuration, not a moved feed', () => {
    // Sending someone to fix a publisher's website when our own edge refused
    // our own request is the wrong instruction, confidently given.
    const d = probeDiagnosis(200, '<!DOCTYPE html><html>Authentication', 'https://x.vercel.app/api/feed/health');
    expect(d).toContain('deployment configuration');
    // It says "not a moved feed" — the word appears, negated. Assert the
    // CLAIM, not the substring; the crude version failed on its own message.
    expect(d).toContain('not a moved feed');
    expect(d).toContain('internal route');
  });

  it('names an EXTERNAL HTML response as a moved source — the finding', () => {
    const d = probeDiagnosis(200, '<!DOCTYPE html><html>Page not found', 'https://news.example.com/rss');
    expect(d).toContain('most likely moved');
    expect(d).toContain('This is the finding, not a crash');
  });

  it('distinguishes unparseable-but-not-HTML from either', () => {
    const d = probeDiagnosis(500, 'upstream timeout', 'https://news.example.com/rss');
    expect(d).toContain('unparseable non-HTML');
  });

  it('quotes the head of the body, so the next reader sees the evidence', () => {
    expect(probeDiagnosis(200, '<!DOCTYPE html><title>Login</title>', 'https://news.example.com/rss'))
      .toContain('<!DOCTYPE html><title>Login</title>');
  });

  it('does not follow a redirect into a login page and parse it', async () => {
    const src = await readFile('app/api/cron/feed-health/route.ts', 'utf8');
    expect(src).toContain("redirect: 'manual'");
    // The body is read as TEXT and handed to a parser that cannot throw. The
    // comment above it is allowed to name the call that used to be there —
    // asserting on the bare substring failed on the explanation of the fix.
    expect(src).toContain('await res.text()');
    expect(src).toContain('parseProbeBody(raw)');
    expect(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')).not.toContain('res.json()');
  });
});

describe('the recap runs on the day the ritual is', () => {
  it('is scheduled for Friday, not Monday', async () => {
    // v3.1.10: "Connects to CB's Friday-recap ritual." It shipped as
    // "0 12 * * 1" — Monday — so every recap arrived three days after the week
    // it described.
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const recap = cfg.crons.find((c) => c.path === '/api/cron/recap');
    expect(recap, 'the recap cron is gone').toBeTruthy();
    expect(recap!.schedule.split(' ')[4], 'day-of-week is not Friday').toBe('5');
  });

  it('runs AFTER the Friday market-watch sweep, not before it', async () => {
    // Market watch sweeps Fridays 13:00 UTC. A recap that fired first would
    // summarise a week the sweep had not yet read.
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const recap = cfg.crons.find((c) => c.path === '/api/cron/recap')!;
    expect(Number(recap.schedule.split(' ')[1])).toBeGreaterThan(13);
  });

  it('the prompt still says Friday, so the two cannot drift apart silently', async () => {
    const { POWERDEAL_VERSION } = await import('@/lib/brand');
    const prompt = await readFile(`prompts/powerdeal-v${POWERDEAL_VERSION}-system-prompt.md`, 'utf8');
    expect(prompt).toMatch(/Friday-recap ritual/i);
  });
});

describe('the health surface can tell "did not run" from "could not write it down"', () => {
  it('a populated runs map is never suspicious', async () => {
    const { bookkeepingLooksBroken } = await import('@/lib/agent-runs');
    expect(
      bookkeepingLooksBroken(
        { 'stall-alert': { ok: true } as never },
        { jobs: [], since: new Date().toISOString() },
      ),
    ).toBe(false);
  });

  it('empty runs BESIDE a recent alert is a broken write, not six idle jobs', async () => {
    // The observed production state: an alert written today, a runs map that
    // read empty, and six jobs reported as "never run" while running.
    const { bookkeepingLooksBroken } = await import('@/lib/agent-runs');
    expect(bookkeepingLooksBroken({}, { jobs: [], since: new Date().toISOString() })).toBe(true);
  });

  it('empty runs with NO alert is a genuinely fresh install', async () => {
    const { bookkeepingLooksBroken } = await import('@/lib/agent-runs');
    expect(bookkeepingLooksBroken({}, null)).toBe(false);
  });

  it('an ancient alert does not make an empty map suspicious forever', async () => {
    const { bookkeepingLooksBroken } = await import('@/lib/agent-runs');
    const old = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    expect(bookkeepingLooksBroken({}, { jobs: [], since: old })).toBe(false);
  });

  it('the write no longer discards the error supabase RESOLVES with', async () => {
    // supabase-js returns { error } instead of throwing, so the old code fell
    // straight through its own try/catch and carried on to syncAlert.
    const src = await readFile('lib/agent-runs.ts', 'utf8');
    expect(src).toContain('const { error } = await client');
    expect(src).toContain('app_state write failed');
  });

  it('records the bookkeeping failure under a DIFFERENT key', async () => {
    // Putting the evidence inside the thing that is broken is how this went
    // unnoticed.
    const src = await readFile('lib/agent-runs.ts', 'utf8');
    expect(src).toContain("BOOKKEEPING_KEY = 'agent_runs_write_failure'");
    expect(src).toContain('AGENT_RUNS_KEY');
    expect(src).not.toContain("BOOKKEEPING_KEY = AGENT_RUNS_KEY");
  });

  it('the status route says the reading is untrustworthy, not just wrong', async () => {
    const src = await readFile('app/api/agents/status/route.ts', 'utf8');
    expect(src).toContain('NOT trustworthy');
    expect(src).toContain('bookkeepingLooksBroken');
  });
});

/**
 * VERCEL VALIDATES vercel.json BEFORE THE BUILD, AND NOTHING LOCAL DOES.
 *
 * Eight consecutive deployments failed on one line. A `_comment` key was added
 * inside `crons[1]` to carry the reasoning for moving the recap to Friday —
 * JSON has no comments, so it went in as a property. Vercel's schema sets
 * additionalProperties: false and rejected the deployment:
 *
 *     Error: Invalid vercel.json - `crons[1]` should NOT have additional
 *     property `_comment`. Please remove it.
 *
 * `tsc`, `next lint`, `next build` and the whole suite passed on every one of
 * those eight commits. None of them reads this file's schema. The failure was
 * invisible locally and total remotely — the platform never got as far as
 * building, so the agents/status fix sat unreleased for eight commits while
 * every local gate reported green.
 *
 * Checklist rule 8 said run the gate that fails the build. This is the sharper
 * version: SOME gates do not exist locally at all, and for those the only
 * defence is a test that encodes what the platform accepts.
 *
 * The rationale that was in `_comment` lives above, in the tests that assert
 * the schedule. A test is a better home for reasoning than a config file — it
 * fails when the reasoning stops being true.
 */
describe('vercel.json is what the platform will accept', () => {
  const TOP_LEVEL = new Set(['$schema', 'framework', 'crons', 'buildCommand',
    'devCommand', 'installCommand', 'outputDirectory', 'regions', 'redirects',
    'rewrites', 'headers', 'functions', 'images', 'cleanUrls', 'trailingSlash']);
  /** Vercel's cron object takes exactly these two. Nothing else. */
  const CRON_KEYS = new Set(['path', 'schedule']);

  it('carries no key Vercel would reject at the top level', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as Record<string, unknown>;
    const unknown = Object.keys(cfg).filter((k) => !TOP_LEVEL.has(k));
    expect(
      unknown,
      'Vercel rejects unknown top-level properties in vercel.json before the ' +
        'build runs. No local gate catches it.',
    ).toEqual([]);
  });

  it('every cron entry has exactly path and schedule', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: Record<string, unknown>[];
    };
    expect(cfg.crons.length, 'no crons — this check proves nothing').toBeGreaterThan(0);

    for (const [i, cron] of cfg.crons.entries()) {
      const extra = Object.keys(cron).filter((k) => !CRON_KEYS.has(k));
      expect(
        extra,
        `crons[${i}] carries ${extra.join(', ')} — Vercel rejects the whole ` +
          `deployment for this. JSON has no comments; put the reasoning in a test.`,
      ).toEqual([]);
      expect(Object.keys(cron).sort()).toEqual(['path', 'schedule']);
    }
  });

  it('every schedule is five cron fields', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    for (const c of cfg.crons) {
      expect(c.schedule.trim().split(/\s+/), `${c.path} schedule is malformed`).toHaveLength(5);
      expect(c.path.startsWith('/'), `${c.path} is not a rooted path`).toBe(true);
    }
  });
});
