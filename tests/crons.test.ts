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
