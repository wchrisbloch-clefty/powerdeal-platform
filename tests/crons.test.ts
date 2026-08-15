import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
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

  it('cannot follow a redirect into a login page, because it makes no request', async () => {
    // This assertion MOVED WITH THE FIX rather than being deleted. It used to
    // require `redirect: 'manual'` on the cron's fetch — the right guard while
    // there was a fetch. There is no fetch now: the cron calls the probe in
    // process, so the redirect, the HTML body and the unparseable response are
    // all unreachable rather than handled. Not making the request is strictly
    // stronger than making it safely.
    const src = await readFile('app/api/cron/feed-health/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('res.json()');
    expect(code).not.toContain('res.text()');
  });

  it('but the HTTP path that REMAINS still refuses to parse a login page', async () => {
    // The Sources panel reads /api/feed/health over the network, so the
    // parse-cannot-throw guarantee still has a live caller.
    expect(() => parseProbeBody('<!DOCTYPE html><html>Login')).not.toThrow();
    expect(parseProbeBody('<!DOCTYPE html><html>Login').ok).toBe(false);
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
/**
 * A PROBE THAT REPORTS WEEKLY ON A FEED THAT SWEEPS DAILY IS SIX DAYS BLIND.
 *
 * feed-health ran `0 9 * * 1` — Mondays. The sweep runs daily, so six of every
 * seven failures went unseen until the following week, and the two-cause
 * diagnosis fix could not be confirmed for six days after it shipped.
 *
 * A monitor's cadence is a claim about how fast you want to learn. Weekly was
 * never that claim.
 */
describe('the health probe runs at least as often as the thing it watches', () => {
  it('feed-health is daily, like the sweep', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const dow = (p: string) =>
      cfg.crons.find((c) => c.path === p)!.schedule.trim().split(/\s+/)[4];
    expect(dow('/api/feed/sweep')).toBe('*');
    expect(
      dow('/api/cron/feed-health'),
      'feed-health is scoped to specific days while the sweep runs daily.',
    ).toBe('*');
  });

  it('runs before the sweep, so it reports on a settled state', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const hour = (p: string) =>
      Number(cfg.crons.find((c) => c.path === p)!.schedule.trim().split(/\s+/)[1]);
    // Hobby's ~1h flexible window means this is a preference, not a guarantee.
    expect(hour('/api/cron/feed-health')).toBeLessThan(hour('/api/feed/sweep'));
  });
});

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

/**
 * THE SWEEP HAD NO agent_runs KEY AT ALL — NOT A FAILURE COUNT, AN ABSENCE.
 *
 * A live query showed `agents:runs` holding an entry for every job except
 * `feed-sweep`. That is not what a repeatedly-failing job looks like; a failing
 * job climbs `consecutiveFailures`. An absence means the recording line was
 * never reached.
 *
 * Two paths reached the return without it: the `!service` guard returned 503
 * silently, and `runSweep` was awaited inside the loop with nothing around it,
 * so any throw escaped the handler and jumped past `recordAgentRun`. The
 * comment above that call claimed "recorded whether or not it worked" — true
 * only of paths that got there.
 *
 * Checklist rule 9 again: a health surface that cannot distinguish "did not
 * run" from "could not record that it ran" is the outage it exists to report.
 */
describe('every exit from the sweep records a run', () => {
  it('the throwing path is caught rather than escaping the handler', async () => {
    const src = await readFile('app/api/feed/sweep/route.ts', 'utf8');
    // The loop is inside a try, and what it catches is carried to the record.
    expect(src).toContain('let thrown: string | null = null');
    expect(src).toContain('Sweep threw before completing');
  });

  it('the missing-service-key path records before it returns 503', async () => {
    const src = await readFile('app/api/feed/sweep/route.ts', 'utf8');
    const guard = src.indexOf('if (!service)');
    expect(guard).toBeGreaterThan(-1);
    const record = src.indexOf("recordAgentRun('feed-sweep'", guard);
    // Anchored on the RETURN STATEMENT, not on the `status: 503` token.
    // A first pass anchored on the token and a mutation that moved the record
    // INTO the response literal still satisfied it — the record was textually
    // earlier and semantically unreachable. Position checks are only as good
    // as what they are positioned against.
    const ret = src.indexOf('return NextResponse.json(', guard);
    expect(record).toBeGreaterThan(guard);
    expect(record).toBeLessThan(ret);
    // And it has to be a completed statement, not spliced into the response.
    expect(src.slice(record, ret)).toContain('});');
  });

  it('a settings read that errors is raised, not silently treated as zero users', async () => {
    const src = await readFile('app/api/feed/sweep/route.ts', 'utf8');
    // supabase-js resolves with { error } — an unchecked read makes a broken
    // query indistinguishable from an empty table.
    expect(src).toContain('settingsError');
    expect(src).toContain('user_settings read failed');
  });

  it('zero users is recorded as a failure, not a green no-op', async () => {
    const src = await readFile('app/api/feed/sweep/route.ts', 'utf8');
    expect(src).toContain('No rows in user_settings');
    expect(src).toContain('users.length === 0');
  });

  /**
   * The sweep is a VERCEL cron; market-watch, stall-alert and ccus-sweep run
   * on Supabase. Both runners write to the same `agents:runs` map, so the
   * health surface reads one shape — but only the Vercel three appear here,
   * and a job in neither place is a job nothing schedules.
   */
  it('every Vercel-scheduled job is one the status surface knows about', async () => {
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string }[];
    };
    const src = await readFile('lib/agent-runs.ts', 'utf8');
    const idFor: Record<string, string> = {
      '/api/feed/sweep': 'feed-sweep',
      '/api/cron/recap': 'weekly-recap',
      '/api/cron/feed-health': 'feed-health',
    };
    expect(cfg.crons.length).toBeGreaterThan(0);
    for (const c of cfg.crons) {
      const id = idFor[c.path];
      expect(id, `${c.path} has no known agent job id`).toBeTruthy();
      expect(src, `${id} is scheduled but not declared in AGENT_JOBS`).toContain(`'${id}'`);
    }
  });
});

/**
 * CODE EXPECTED A COLUMN THE DATABASE NEVER HAD.
 *
 * The sweep wrote `url_hash` and upserted on `(user_id, url_hash)`. The live
 * table had neither. `schema.sql` declares both — the table was created from an
 * earlier version of that file, and `create table if not exists` is a NO-OP on
 * an existing table, so every column added afterwards was never applied.
 *
 * WHAT THIS CHECK DOES AND DOES NOT CATCH — worth being exact, because it
 * looks like it closes the hole and does not.
 *
 * It compares the columns the sweep WRITES against `schema.sql`, so it catches
 * the code-adds-a-column direction: someone writes a new field and forgets the
 * schema. That is a real class and it had no coverage.
 *
 * It would NOT have caught this outage. `schema.sql` was correct all along; the
 * LIVE DATABASE was behind it, and no test in this repo can see the live
 * database. The only thing that surfaces that gap is a migration applied and
 * verified against the real instance — which is why the checklist requires a
 * verification query that returns rows, and why rule 1 exists at all.
 */
describe('every column the sweep writes exists in schema.sql', () => {
  it('the feed_items write set is fully declared', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    const schema = await readFile('supabase/schema.sql', 'utf8');

    // The row literal returned by processItem is the write set.
    const start = src.indexOf('  return {\n    title: item.title,');
    expect(start, 'processItem row literal not found — the parse is stale').toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n  };', start));
    const columns = [...body.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(15);
    expect(columns).toContain('url_hash');

    const table = schema.slice(
      schema.indexOf('create table if not exists feed_items'),
      schema.indexOf(');', schema.indexOf('create table if not exists feed_items')),
    );
    const missing = columns.filter((c) => !new RegExp(`^\\s+${c}\\s`, 'm').test(table));
    expect(
      missing,
      'The sweep writes these and schema.sql does not declare them. Add the ' +
        'column AND ship a migration — schema.sql alone never reaches an ' +
        'existing table, because `create table if not exists` is a no-op.',
    ).toEqual([]);
  });

  it('the upsert conflict target is a declared unique constraint', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    const schema = await readFile('supabase/schema.sql', 'utf8');
    const target = /onConflict:\s*'([^']+)'/.exec(src)?.[1];
    expect(target, 'no onConflict found in the sweep').toBeTruthy();
    // Postgres raises "no unique or exclusion constraint matching the ON
    // CONFLICT specification" without it — the next error the sweep would
    // have hit after the column was added.
    const cols = target!.split(',').map((c) => c.trim());
    expect(schema).toMatch(new RegExp(`unique\\s*\\(${cols.join(',\\s*')}\\)`, 'i'));
  });

  it('a migration exists for the column, not just a schema.sql edit', async () => {
    const files = await readdir('supabase/migrations');
    const sql = files.filter((f) => f.endsWith('.sql'));
    const bodies = await Promise.all(
      sql.map((f) => readFile(`supabase/migrations/${f}`, 'utf8')),
    );
    expect(
      bodies.some((b) => /alter table feed_items add column if not exists url_hash/i.test(b)),
      'schema.sql declaring a column does not put it in an existing database.',
    ).toBe(true);
  });
});

/**
 * `skipped_cached: 46` AGAINST AN EMPTY TABLE.
 *
 * Nothing had ever been cached. 106 items were fetched, 60 taken by the
 * maxItems cap, and the 46 the cap dropped were counted as "cached" — the
 * number was true and its name was a lie, and it sent the investigation at
 * dedupe instead of at the cap.
 */
describe('the sweep counts dedupe and the cap separately', () => {
  it('reports over_cap as its own number', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    expect(src).toContain('over_cap');
    // skipped_cached must measure the dedupe set, not the post-slice one.
    expect(src).toContain('result.skipped_cached = raw.length - unseen.length');
    expect(src).toContain('result.over_cap = unseen.length - fresh.length');
  });

  it('surfaces a failed cache lookup instead of silently treating all as new', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    expect(src).toContain('cacheError');
    expect(src).toContain('Cache lookup failed');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════
 * A JOB'S DISPLAYED SCHEDULE IS A CLAIM ABOUT vercel.json.
 * ═══════════════════════════════════════════════════════════════
 *
 * Two of them were false. `weekly-recap` displayed "Mondays · 12:00 UTC" long
 * after the recap moved to `0 17 * * 5` to match the Friday ritual, and
 * `feed-health` still said "Mondays · 09:00 UTC" after being moved to daily.
 * Both were hand-written strings beside a schedule nobody re-read.
 *
 * The status page exists to say whether scheduled work is alive. A row with
 * the wrong schedule reports a healthy job as overdue, or a dead one as fine.
 * Checklist rule 15 — a label is an assertion about what produced it.
 */
describe('every displayed schedule matches the file that actually schedules it', () => {
  it('reads a daily expression', async () => {
    const { describeCron } = await import('@/lib/agent-runs');
    expect(describeCron('0 10 * * *')).toBe('Daily · 10:00 UTC');
  });

  it('reads a weekday expression', async () => {
    const { describeCron } = await import('@/lib/agent-runs');
    expect(describeCron('0 17 * * 5')).toBe('Fridays · 17:00 UTC');
    expect(describeCron('30 9 * * 1')).toBe('Mondays · 09:30 UTC');
  });

  it('returns anything it cannot read VERBATIM rather than guessing', async () => {
    // A plausible-but-wrong sentence is worse than an obvious cron expression:
    // one sends the reader to the schedule, the other does not.
    const { describeCron } = await import('@/lib/agent-runs');
    expect(describeCron('0 10 1 * *')).toBe('0 10 1 * *');
    expect(describeCron('*/15 * * * *')).toBe('*/15 * * * *');
    expect(describeCron('0 9 * * 1-5')).toBe('0 9 * * 1-5');
    expect(describeCron('nonsense')).toBe('nonsense');
  });

  it('EVERY Vercel job label equals its cron in vercel.json', async () => {
    const { AGENT_JOBS, VERCEL_JOB_PATHS, describeCron } = await import('@/lib/agent-runs');
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };

    const vercelJobs = AGENT_JOBS.filter((j) => j.runner === 'vercel');
    // Rule 10: a parameterized test over an empty set cannot fail.
    expect(vercelJobs.length).toBeGreaterThan(0);

    for (const job of vercelJobs) {
      const path = VERCEL_JOB_PATHS[job.id];
      expect(path, `${job.id} has no path mapping`).toBeTruthy();
      const cron = cfg.crons.find((c) => c.path === path);
      expect(cron, `${job.id} is declared but not scheduled in vercel.json`).toBeTruthy();
      expect(describeCron(cron!.schedule), `${job.id} label drifted`).toBe(job.schedule);
    }
  });

  it('every cron in vercel.json has a declared job — an unlisted one is invisible', async () => {
    const { VERCEL_JOB_PATHS } = await import('@/lib/agent-runs');
    const cfg = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons: { path: string }[];
    };
    const mapped = new Set(Object.values(VERCEL_JOB_PATHS));
    for (const cron of cfg.crons) {
      expect(mapped.has(cron.path), `${cron.path} runs but no AGENT_JOBS row reports on it`).toBe(true);
    }
  });

  it('a job that runs daily is not given a two-week staleness budget', async () => {
    // feed-health moved Monday → daily and kept a 16-day budget, which is two
    // weeks of silence before the surface would say anything.
    const src = await readFile('lib/agent-runs.ts', 'utf8');
    const block = /const STALE_AFTER_MS[\s\S]*?\n\};/.exec(src)![0];
    expect(block).toContain("'feed-health': 3 * 24 * 3600_000");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════
 * THE DAILY PROBE FETCHED ITS OWN DEPLOYMENT AND GOT AN SSO LOGIN.
 * ═══════════════════════════════════════════════════════════════
 *
 * Observed in production: `Feed health probe — Failing. Probe returned
 * unparseable non-HTML (HTTP 302): Redirecting…`, every day, 0.1s.
 *
 * The cron's INBOUND request carries Vercel's own auth. The second request it
 * then made back to its own origin carried nothing, so Deployment Protection
 * bounced it into a login. The other five jobs were healthy because none of
 * them calls itself over HTTP.
 */
describe('feed-health calls the probe in process, not over the network', () => {
  it('the cron makes no HTTP request at all', async () => {
    const src = await readFile('app/api/cron/feed-health/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('fetch(');
    // And it no longer derives an origin from the request host, which is not
    // necessarily reachable from inside the function.
    expect(code).not.toContain('new URL(request.url).origin');
    expect(code).toContain('await probeAllSources()');
  });

  it('there is still exactly ONE definition of healthy', async () => {
    // The round trip existed so the cron and the route could not drift apart.
    // That reasoning was right; the transport was the mistake.
    const cron = await readFile('app/api/cron/feed-health/route.ts', 'utf8');
    const route = await readFile('app/api/feed/health/route.ts', 'utf8');
    expect(cron).toContain("from '@/lib/feed-health-probe'");
    expect(route).toContain("from '@/lib/feed-health-probe'");
    // Neither re-implements the probe.
    const lib = await readFile('lib/feed-health-probe.ts', 'utf8');
    expect(lib).toContain('export async function probeAllSources');
    for (const src of [cron, route]) {
      expect(src).not.toContain('async function probeUrl(');
    }
  });

  it('the shared probe is server-only', async () => {
    const lib = await readFile('lib/feed-health-probe.ts', 'utf8');
    expect(lib.startsWith("import 'server-only';")).toBe(true);
  });

  it('the interactive route still serves the Sources panel', async () => {
    const route = await readFile('app/api/feed/health/route.ts', 'utf8');
    expect(route).toContain('export async function GET');
    expect(route).toContain('candidates');
  });
});

describe('a redirect is its own diagnosis, not "unparseable non-HTML"', () => {
  it('names Deployment Protection on an INTERNAL callback', async () => {
    // The message that shipped was true and useless: it sent the reader
    // looking for a moved publisher feed when the caller had been bounced to
    // an SSO login. Detection is half the job — a check that fires correctly
    // and names the wrong cause costs more than one that stays quiet.
    const d = probeDiagnosis(302, 'Redirecting...', 'https://x.vercel.app/api/feed/health');
    expect(d).toContain('REDIRECTED');
    expect(d).toContain('Deployment Protection');
    expect(d).toContain('not a moved feed');
    expect(d).not.toContain('unparseable non-HTML');
  });

  it('names a MOVED SOURCE on an external one, and points at the header', () => {
    const d = probeDiagnosis(301, 'Moved', 'https://news.example.com/rss');
    expect(d).toContain('REDIRECTED');
    expect(d).toContain('has moved');
    expect(d).toContain('Location header');
    expect(d).not.toContain('Deployment Protection');
  });

  it('covers the whole 3xx range, not just 302', () => {
    for (const status of [300, 301, 302, 303, 307, 308]) {
      expect(probeDiagnosis(status, 'Redirecting...', 'https://x/api/feed/health')).toContain(
        'REDIRECTED',
      );
    }
  });

  it('and 2xx / 4xx / 5xx still take their own branches', () => {
    // The redirect branch must not swallow the cases that were already right.
    expect(probeDiagnosis(500, 'upstream timeout', 'https://news.example.com/rss')).toContain(
      'unparseable non-HTML',
    );
    expect(
      probeDiagnosis(200, '<!DOCTYPE html><html>Page not found', 'https://news.example.com/rss'),
    ).toContain('most likely moved');
    expect(
      probeDiagnosis(200, '<!DOCTYPE html><html>Authentication', 'https://x.vercel.app/api/feed/health'),
    ).toContain('deployment configuration');
  });

  it('the parser and the diagnosis are KEPT, not deleted with their caller', async () => {
    // The Sources panel still reads this over HTTP. A diagnosis path removed
    // because its current caller stopped triggering it is a path that rots
    // until the day something else does.
    const lib = await readFile('lib/feed-health.ts', 'utf8');
    expect(lib).toContain('export function parseProbeBody');
    expect(lib).toContain('export function probeDiagnosis');
  });
});
