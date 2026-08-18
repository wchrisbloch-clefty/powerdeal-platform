import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { keyShape, diagnose, explainFailure } from '@/lib/supabase/diagnose';
import { rankHeadlines } from '@/lib/engine/headlines';
import type { Deal, FeedItem } from '@/lib/types';

/**
 * "JWT issued at future" NAMED A SYMPTOM AND NOTHING ELSE.
 *
 * Not which client raised it, not which key that client was built from, and
 * not whether the fix is a clock, a rotation, or the migration off legacy
 * anon/service_role JWTs. Same shape as the feed-health probe reporting
 * `unparseable non-HTML (HTTP 302)` — accurate, and it sent two people
 * looking at publisher feeds when the cause was an SSO redirect.
 */

const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') +
  '.sig';
const ANON_JWT =
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') +
  '.sig';

describe('the key is classified by SHAPE, and never printed', () => {
  it('tells the two schemes apart', () => {
    expect(keyShape(SERVICE_JWT).scheme).toBe('legacy-service-role');
    expect(keyShape(ANON_JWT).scheme).toBe('legacy-anon');
    expect(keyShape('sb_secret_abc123').scheme).toBe('new-secret');
    expect(keyShape('sb_publishable_abc123').scheme).toBe('new-publishable');
  });

  it('knows which of them are privileged', () => {
    // The migration trap: a publishable key in a service-role slot fails per
    // ROW rather than at the connection, so it reads as an empty database.
    expect(keyShape(SERVICE_JWT).privileged).toBe(true);
    expect(keyShape('sb_secret_abc').privileged).toBe(true);
    expect(keyShape(ANON_JWT).privileged).toBe(false);
    expect(keyShape('sb_publishable_abc').privileged).toBe(false);
  });

  it('handles absent and unrecognised without throwing', () => {
    expect(keyShape(undefined).scheme).toBe('absent');
    expect(keyShape('   ').scheme).toBe('absent');
    expect(keyShape('total-nonsense').scheme).toBe('unrecognised');
    // A JWT-shaped string that will not decode is not assumed to be one.
    expect(keyShape('eyJnot-a-real-jwt').scheme).toBe('legacy-jwt-unknown-role');
  });

  it('NEVER puts the key material in the label', () => {
    // A diagnosis has to be safe to paste into an issue.
    for (const key of [SERVICE_JWT, ANON_JWT, 'sb_secret_SUPERSECRETVALUE']) {
      const label = keyShape(key).label;
      expect(label).not.toContain('SUPERSECRET');
      expect(label).not.toContain(key);
      expect(label.length).toBeLessThan(80);
    }
  });
});

describe('each cause sends the reader somewhere different', () => {
  const svc = keyShape(SERVICE_JWT);

  it('"JWT issued at future" is CLOCK SKEW, and says rotating will not help', () => {
    // The observed production error. Rotating the key is the obvious move and
    // the wrong one — a just-issued key makes it MORE likely, because its iat
    // sits closest to the skew boundary.
    const d = diagnose({ client: 'service-role', message: 'JWT issued at future', key: svc });
    expect(d.cause).toBe('clock-skew');
    expect(d.detail).toContain('AHEAD of the database');
    expect(d.detail).toContain('rotating it will not help');
    expect(d.detail).toContain('just-issued key makes it more likely');
  });

  it('and names the client and key scheme, which the raw message never did', () => {
    const line = explainFailure({
      client: 'service-role',
      message: 'JWT issued at future',
      key: svc,
    });
    expect(line).toContain('JWT issued at future');
    expect(line).toContain('service-role client');
    expect(line).toContain('legacy service_role JWT');
  });

  it('an expired token is NOT clock skew', () => {
    expect(diagnose({ client: 'service-role', message: 'JWT expired', key: svc }).cause)
      .toBe('expired');
  });

  it('a non-privileged key in a privileged slot is its own cause', () => {
    const d = diagnose({
      client: 'service-role',
      message: 'permission denied for table deals',
      key: keyShape('sb_publishable_abc'),
    });
    expect(d.cause).toBe('wrong-privilege');
    expect(d.detail).toContain('PUBLISHABLE');
    expect(d.detail).toContain('looks like an empty database');
  });

  it('RLS refusing a SERVICE-ROLE key means the key is not what it claims', () => {
    const d = diagnose({
      client: 'service-role',
      message: 'new row violates row-level security policy',
      key: svc,
    });
    expect(d.cause).toBe('rls-denied');
    expect(d.detail).toContain('bypasses RLS');
  });

  it('a network failure is not a key failure', () => {
    expect(diagnose({ client: 'service-role', message: 'fetch failed', key: svc }).cause)
      .toBe('unreachable');
  });

  it('an unrecognised message falls through with the original text intact', () => {
    // Never swallowed. An unclassified error still has to be readable.
    const d = diagnose({ client: 'service-role', message: 'something novel', key: svc });
    expect(d.cause).toBe('other');
    expect(d.detail).toContain('something novel');
  });

  it('every cause produces a distinct sentence', () => {
    const messages = [
      'JWT issued at future', 'JWT expired', 'invalid signature',
      'row-level security', 'fetch failed', 'something novel',
    ];
    const details = messages.map((m) => diagnose({ client: 'service-role', message: m, key: svc }).detail);
    expect(new Set(details).size).toBe(details.length);
  });
});

// ── The defect the error exposed ────────────────────────────────

const deal = (over: Partial<Deal> = {}): Deal =>
  ({ id: 'd1', deal_id: 'DEF-001', company: 'BAE', vertical: 'Defense',
     stage: 'Discovery', health_score: 4, size_usd_m: null, ...over }) as Deal;

const item = (over: Partial<FeedItem> = {}): FeedItem =>
  ({ id: 'i1', title: 'Headline', synthesis: null, tier: 'reported', confidence: 0.7,
     arrival: 'rss', platform: 'rss', source_id: 's', source_name: 'Wire',
     url: 'https://x/1', url_hash: 'h', image_url: null, byline: null,
     published_at: '2026-08-15T09:00:00Z', category: 'power-markets', vertical_tags: [],
     deal_ids: [], action: null, action_tier: 'inferred', breaking: false,
     cached_at: '2026-08-15T10:00:00Z', user_id: 'u1', ...over }) as FeedItem;

const NOW = Date.parse('2026-08-15T12:00:00Z');

describe('a FAILED deal read must not claim the mappings are dangling', () => {
  it('says the mappings could not be CHECKED, not that they no longer resolve', () => {
    // Observed: "13 mapped deal IDs no longer resolve to a deal" on a run
    // where ZERO deals loaded because the query failed. That asserts deletion
    // — a confident claim about the pipeline derived from failing to read it.
    // The count said 13 and the truth was "nothing was looked up".
    const out = rankHeadlines(
      [item({ deal_ids: ['a', 'b', 'c'] })],
      [],
      NOW,
      { dealsReadable: false },
    );
    const gaps = out[0].gaps.join(' ');
    expect(gaps).toContain('could not be checked');
    expect(gaps).toContain('whether they still exist is unknown');
    expect(gaps).not.toContain('no longer resolve');
  });

  it('but a SUCCESSFUL read with a genuinely missing deal still says so', () => {
    // The real dangling-reference case must survive. Removing the claim
    // entirely would trade one wrong message for a missing one.
    const out = rankHeadlines([item({ deal_ids: ['d1', 'ghost'] })], [deal()], NOW);
    expect(out[0].gaps.join(' ')).toContain('no longer resolve to a deal');
    expect(out[0].accounts).toHaveLength(1);
  });

  it('defaults to readable, so existing callers keep the stricter message', () => {
    const out = rankHeadlines([item({ deal_ids: ['ghost'] })], [], NOW);
    expect(out[0].gaps.join(' ')).toContain('no longer resolve');
  });

  it('the route passes the real read state rather than assuming', async () => {
    const src = await readFile('app/api/headlines/route.ts', 'utf8');
    expect(src).toContain("dealsReadable: dealState.kind !== 'unreadable'");
  });
});

describe('a REFUSED read is not an UNCONFIGURED deployment', () => {
  it('DataResult carries readError alongside isSeed', async () => {
    // Both fall back to seed data and both set isSeed. Only one of them is an
    // outage, and they printed the same sentence.
    const src = await readFile('lib/data.ts', 'utf8');
    expect(src).toContain('readError: string | null;');
    expect(src).toContain('describeReadFailure(error.message)');
  });

  it('the unconfigured path sets readError null, the error path sets a string', async () => {
    const src = await readFile('lib/data.ts', 'utf8');
    const getDeals = src.slice(src.indexOf('export async function getDeals'));
    const body = getDeals.slice(0, getDeals.indexOf('\n}'));
    // No client → seed, no error.
    expect(body).toContain('if (!query) return { data: SEED_DEALS, isSeed: true, readError: null }');
    // Query refused → seed, WITH the diagnosis.
    expect(body).toContain('readError: why');
  });

  it('the sentence lives in one component, not at three call sites', async () => {
    // ⚠️ THIS CHECK USED TO READ app/app/page.tsx AND ONLY app/app/page.tsx.
    // It passed for months while Pipeline and the deal page printed the
    // unconfigured-deployment sentence over refused data, because the Dashboard
    // — the one surface it had ever looked at — was right. Rule 18: it reported
    // on N=1 and the real N was 3.
    const src = await readFile('components/ui/read-failure.tsx', 'utf8');
    expect(src).toContain('These are NOT your deals');
    // Null readError renders nothing, so a healthy surface pays no price for
    // mounting it unconditionally.
    expect(src).toContain('if (!readError) return null');
  });

  it('every surface that falls back to seed splits the two sentences', async () => {
    /*
      N IS DERIVED, NOT TYPED. The surfaces are the ones that render an
      `isSeed` banner — found by scanning, so a fourth surface added tomorrow
      joins this check by existing rather than by somebody remembering.

      The rule: a surface that says something to a reader about seed data must
      distinguish "nothing is configured" from "the database refused us". The
      first is setup advice. The second is an outage, and over SEED_DEALS it is
      21 plausible rows the reader has every reason to believe.
    */
    const files = [
      'app/app/page.tsx',
      'app/app/pipeline/page.tsx',
      'app/app/pipeline/[id]/page.tsx',
      'components/modules/pipeline-view.tsx',
      'components/modules/deal-detail.tsx',
    ];
    const seedBanner: string[] = [];
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      if (/\bisSeed\b/.test(src)) seedBanner.push(f);
    }
    // Loudest possible finding if the scan found nothing to inspect.
    expect(seedBanner.length).toBeGreaterThan(0);
    expect(seedBanner).toHaveLength(files.length);

    /*
      ⚠️ THE FIRST VERSION OF THIS LOOP ASSERTED `toMatch(/\breadError\b/)` AND
      A MUTATION SURVIVED IT. Replacing the live branch with

        false ? <ReadFailureBanner readError={null} /> : isSeed ? (…)

      left the word `readError` in the file four times — in the prop type, in
      the destructure, in a dead ternary — and the check reported clean over a
      surface that had stopped showing the banner entirely. Presence again,
      where behaviour was the question.

      So the assertion is about the VALUE FLOWING: every `readError={…}` site
      must pass an identifier, never a literal, and there must be at least one.
      A surface cannot satisfy this while holding the diagnosis and not using
      it.
    */
    for (const f of seedBanner) {
      const src = await readFile(f, 'utf8');
      const sites = [...src.matchAll(/readError=\{([^}]+)\}/g)].map((m) => m[1].trim());
      expect(sites.length, `${f} never passes readError anywhere`).toBeGreaterThan(0);
      for (const value of sites) {
        expect(
          /^[A-Za-z_$][\w$]*$/.test(value) && value !== 'null' && value !== 'undefined',
          `${f} passes readError={${value}} — a literal, not the diagnosis`,
        ).toBe(true);
      }
    }
  });

  it('the seed holds exactly as many deals as the live pipeline, which is why this hid', async () => {
    // 21 template rows under a banner that reads like setup advice is
    // indistinguishable from 21 real ones at a glance. Asserted so the
    // coincidence is on the record rather than rediscovered.
    const { SEED_DEALS } = await import('@/lib/seed-data');
    expect(SEED_DEALS).toHaveLength(21);
  });
});
