import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGENT_JOBS,
  freshnessOf,
  freshnessGapKind,
  type AgentRun,
} from '@/lib/agent-runs';

/**
 * ═══════════════════════════════════════════════════════════════
 * "NOTHING FOUND" AND "DID NOT RUN" ARE DIFFERENT FACTS.
 * ═══════════════════════════════════════════════════════════════
 *
 * ccus-sweep wrote `ccus_latest` only when it found something, so one key was
 * answering "when did this last find anything" while wearing the label "when
 * did this last run". The sweep then died on a secret mismatch, every
 * net.http_post got a 401, pg_cron recorded success because it is
 * asynchronous, and seven consecutive missed runs read as healthy for five
 * days.
 *
 * ⚠️ AND THE HEARTBEAT MECHANISM ALREADY EXISTED AND WAS CORRECT. `statusOf`
 * called ccus-sweep `stale` from day three. It renders in Settings › Agent
 * health; the operator was looking at the CCUS tab. The outage was DETECTED
 * and not DELIVERED, which is a different failure from the one it looks like,
 * and fixing it by building a second heartbeat would have been the wrong
 * repair to a working part.
 */

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  lastAttemptAt: new Date().toISOString(),
  lastSuccessAt: new Date().toISOString(),
  lastError: null,
  durationMs: 1200,
  itemsProcessed: 3,
  consecutiveFailures: 0,
  ...over,
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

describe('freshness is computed per job, for every job', () => {
  it('covers all six declared jobs, and N comes from the declaration', () => {
    // Rule 18: a hardcoded six would look identical to somebody stopping at
    // five. AGENT_JOBS is the product's own claim about what it runs.
    expect(AGENT_JOBS.length).toBe(6);
    for (const job of AGENT_JOBS) {
      const f = freshnessOf(job, run());
      expect(f.jobId).toBe(job.id);
      expect(f.status).toBe('ok');
      expect(f.sentence).toContain(job.label);
    }
  });

  it('a job that never ran is not a job that found nothing', () => {
    for (const job of AGENT_JOBS) {
      const f = freshnessOf(job, undefined);
      expect(f.status).toBe('never-run');
      expect(f.lastSuccessAt).toBeNull();
      expect(f.sentence).toContain('never completed');
      // Distinguished in the rendered vocabulary too: an unchecked dotted rule,
      // not a danger-toned one. Nothing is broken; nothing has happened yet.
      expect(freshnessGapKind(f)).toBe('unchecked');
    }
  });

  it('the outage that happened is reported as an outage', () => {
    /*
      The real timeline: ccus-sweep is daily, STALE_AFTER_MS is three days, and
      it went silent for seven runs. At 168 hours since the last success it is
      four days past its window.
    */
    const ccus = AGENT_JOBS.find((j) => j.id === 'ccus-sweep')!;
    const f = freshnessOf(ccus, run({ lastSuccessAt: hoursAgo(168) }));

    expect(f.status).toBe('stale');
    expect(f.overdueHours).toBe(96);
    expect(f.sentence).toContain('has not completed since');
    expect(f.sentence).toContain('what it found before it stopped');
    expect(freshnessGapKind(f)).toBe('blocked');
  });

  it('a healthy job says nothing a surface needs to render', () => {
    // The component renders null on `ok`. A permanent "updated 20 minutes ago"
    // strip is furniture that goes invisible exactly when it matters.
    for (const job of AGENT_JOBS) {
      expect(freshnessGapKind(freshnessOf(job, run()))).toBeNull();
    }
  });

  it('a failing job is distinguished from a merely stale one', () => {
    const job = AGENT_JOBS[0];
    const f = freshnessOf(job, run({ consecutiveFailures: 3, lastError: 'boom' }));
    expect(f.status).toBe('failing');
    expect(f.sentence).toContain('boom');
    expect(freshnessGapKind(f)).toBe('blocked');
  });

  it('the weekly jobs get a longer window than the daily ones', () => {
    // A weekly job three days quiet is on schedule; a daily one is four days
    // overdue. One threshold for both would either cry wolf or say nothing.
    const weekly = AGENT_JOBS.find((j) => j.id === 'market-watch')!;
    const daily = AGENT_JOBS.find((j) => j.id === 'stall-alert')!;
    const at = run({ lastSuccessAt: hoursAgo(24 * 5) });
    expect(freshnessOf(weekly, at).status).toBe('ok');
    expect(freshnessOf(daily, at).status).toBe('stale');
  });
});

describe('no surface infers freshness from a payload key', () => {
  const PAYLOAD_KEYS = ['ccus_latest', 'market_watch_latest', 'stall_alerts_latest'];

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        out.push(...(await walk(full)));
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it('the payload keys are written by the jobs and read by no surface', async () => {
    /*
      ⚠️ THE STATE OF THINGS WHEN THIS WAS WRITTEN: all three keys are
      write-only. Nothing in app/ or components/ reads any of them, which means
      the "freshness signal" the outage was diagnosed from was never on screen
      at all — it was found by querying the database directly.

      Asserted so that if a surface DOES start reading one, it is a deliberate
      act that fails this test and has to argue for itself. The argument would
      have to explain how it tells "found nothing" from "did not run", which is
      the whole point.
    */
    const files = [...(await walk('app')), ...(await walk('components'))];
    expect(files.length).toBeGreaterThan(60);

    for (const file of files) {
      const src = await readFile(file, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const key of PAYLOAD_KEYS) {
        expect(
          code.includes(key),
          `${file} reads ${key}. A payload key cannot distinguish "found nothing" ` +
            `from "did not run" — use freshnessFor(jobId).`,
        ).toBe(false);
      }
    }
  });

  it('the surfaces that show scheduled output show the job heartbeat', async () => {
    // Derived from the file, not asserted as a count: each tab that renders a
    // job's output must name that job to freshnessFor.
    const src = await readFile('app/app/intelligence/page.tsx', 'utf8');
    for (const jobId of ['ccus-sweep', 'market-watch', 'feed-sweep']) {
      expect(src, `no freshness on the ${jobId} surface`).toContain(`freshnessFor('${jobId}')`);
    }
    expect(src).toContain('<JobFreshnessNote');
  });
});

describe('the edge functions write their heartbeat unconditionally', () => {
  it('ccus-sweep writes state outside the found-something branch', async () => {
    /*
      ⚠️ THE ORIGINAL DEFECT, ASSERTED AGAINST THE SOURCE. `writeState` sat
      inside `if (rows.length > 0)`, so a run that found nothing left the key
      untouched. The two facts are separate fields now: `ran_at` moves every
      run, `found_at` only when something was written and is carried forward
      otherwise.
    */
    const src = await readFile('supabase/functions/ccus-sweep/index.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toContain('ran_at:');
    expect(code).toContain('found_at:');

    // The write must not be nested inside the rows-found branch. Measured by
    // indentation: the branch body is deeper than the loop body it returned to.
    const writeAt = code.indexOf("writeState(supabase, user.user_id, 'ccus_latest'");
    expect(writeAt).toBeGreaterThan(-1);
    const branchAt = code.indexOf('if (rows.length > 0) {');
    const branchEnd = code.indexOf('\n      }', branchAt);
    expect(writeAt).toBeGreaterThan(branchEnd);
  });

  it('every edge function records its run on both paths', async () => {
    for (const fn of ['ccus-sweep', 'market-watch', 'stall-alert']) {
      const src = await readFile(`supabase/functions/${fn}/index.ts`, 'utf8');
      const calls = [...src.matchAll(/recordAgentRun\(/g)];
      expect(calls.length, `${fn} records ${calls.length} time(s); success and failure both need one`)
        .toBeGreaterThanOrEqual(2);
      // The failure path is unambiguous.
      expect(src, `${fn} never records a failure`).toContain('ok: false');
    }
  });

  it('a function that collects errors does not report ok unconditionally', async () => {
    /*
      ⚠️ MY FIRST VERSION OF THE TEST ABOVE ASSERTED `ok: true` AND FAILED ON
      market-watch — which reports `ok: !sweepError`, with a comment saying
      "reporting ok:true here would put healthy on the status page for a job
      that half-failed". The test was demanding the defect.

      And that is how the third instance surfaced: ccus-sweep DID report
      `ok: true` while collecting an `errors` array, so both feeds could 404
      and the daily sweep would still read healthy. One of three functions had
      the rule right, which is the case for a contract over discipline.
    */
    for (const fn of ['ccus-sweep', 'market-watch', 'stall-alert']) {
      const src = await readFile(`supabase/functions/${fn}/index.ts`, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Does it accumulate errors at all? If not, an unconditional ok is fine.
      if (!/\berrors\b|\bsweepError\b/.test(code)) continue;
      const success = code.slice(code.indexOf('recordAgentRun'));
      expect(
        /ok:\s*true\s*,/.test(success.slice(0, 300)),
        `${fn} collects errors and still reports ok: true`,
      ).toBe(false);
    }
  });

  it('the ccus window is an input, bounded, and reported back', async () => {
    /*
      The 48h window covers ONE missed run. August missed seven, so everything
      published in between fell out of reach of a daily sweep permanently.

      A wider sweep is safe for a specific reason worth asserting rather than
      trusting: dedupe is keyed on source_url, so re-reading fourteen days
      inserts nothing already stored. The bound exists because an unbounded
      window on a secret-gated endpoint is a way to make one call do unbounded
      work.
    */
    const src = await readFile('supabase/functions/ccus-sweep/index.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toContain('window_hours');
    expect(code).toContain('MAX_WINDOW_HOURS');
    expect(code).toMatch(/Math\.min\(asked, MAX_WINDOW_HOURS\)/);
    // The cutoff must use the resolved value, not the constant — a parameter
    // that is parsed and then ignored is worse than no parameter.
    expect(code).toMatch(/cutoff = Date\.now\(\) - windowHours \* 3600_000/);
    // And the response says which window ran.
    expect(code).toContain('window_hours: windowHours');
    // Dedupe still keyed on source_url, which is what makes a backfill safe.
    expect(code).toContain("select('source_url')");
  });

  it('no heartbeat carries a hardcoded item count', async () => {
    // ccus-sweep passed `itemsProcessed: 0` literally, so even a healthy run
    // said nothing about how much it had done.
    for (const fn of ['ccus-sweep', 'market-watch', 'stall-alert']) {
      const src = await readFile(`supabase/functions/${fn}/index.ts`, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const success = code.slice(code.indexOf('ok: true'));
      expect(
        /itemsProcessed:\s*\d+/.test(success.slice(0, 400)),
        `${fn} reports a literal itemsProcessed on the success path`,
      ).toBe(false);
    }
  });
});
