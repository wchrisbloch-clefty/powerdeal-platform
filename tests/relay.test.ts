import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  relayConfig,
  relayUsable,
  relayStatus,
  shouldRelay,
  relayRequest,
  allowedHosts,
} from '@/lib/engine/feed-relay';
import { powerdeal } from '@/lib/verticals/powerdeal';
import type { SourceConfig } from '@/lib/verticals/types';

/**
 * THE FEED RELAY.
 *
 * thundersaidenergy.com 403s every request from Vercel's ranges — Cloudflare,
 * IP-based, and the user-agent work was already tried. A Worker on an address
 * the publisher does not block can reach it.
 *
 * A URL-taking fetch endpoint on the open internet is an open proxy, so most
 * of this file is about the controls rather than the feature.
 */

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});
beforeEach(() => {
  delete process.env.FEED_RELAY_URL;
  delete process.env.FEED_RELAY_TOKEN;
});

const source = (over: Partial<SourceConfig> = {}): SourceConfig =>
  ({
    id: 's',
    name: 'S',
    platform: 'rss',
    url: 'https://example.com/feed/',
    defaultTier: 'reported',
    category: 'power-markets',
    role: 'core',
    rationale: 'x',
    ...over,
  }) as SourceConfig;

describe('half-configured is NOT configured', () => {
  it('a URL with no token is refused — that is an open proxy', () => {
    const config = { url: 'https://relay.workers.dev', token: null };
    expect(relayUsable(config)).toBe(false);
    expect(relayStatus(config)).toContain('open proxy');
  });

  it('a token with no URL is refused', () => {
    expect(relayUsable({ url: null, token: 'secret' })).toBe(false);
  });

  it('neither is refused, and says where to look', () => {
    expect(relayStatus({ url: null, token: null })).toContain('workers/README.md');
  });

  it('both together is usable, and reports no problem', () => {
    const config = { url: 'https://relay.workers.dev', token: 'secret' };
    expect(relayUsable(config)).toBe(true);
    expect(relayStatus(config)).toBeNull();
  });

  it('whitespace-only env values do not count as set', () => {
    process.env.FEED_RELAY_URL = '   ';
    process.env.FEED_RELAY_TOKEN = 'secret';
    expect(relayUsable(relayConfig())).toBe(false);
  });

  it('unset env produces an unusable config rather than throwing', () => {
    expect(relayUsable(relayConfig())).toBe(false);
  });
});

describe('only blocked sources are relayed', () => {
  const usable = { url: 'https://relay.workers.dev', token: 'secret' };

  it('a blocked source goes through it', () => {
    expect(shouldRelay(source({ status: 'blocked' }), usable)).toBe(true);
  });

  it('a working source does NOT', () => {
    // Seventeen feeds behind one Worker to solve a problem affecting one of
    // them, and a publisher's own outage hidden behind a relay error.
    expect(shouldRelay(source({ status: 'active' }), usable)).toBe(false);
    expect(shouldRelay(source(), usable)).toBe(false);
  });

  it('nothing is relayed when the relay is not usable', () => {
    expect(shouldRelay(source({ status: 'blocked' }), { url: null, token: null })).toBe(false);
  });
});

describe('the token never travels in the URL', () => {
  const usable = { url: 'https://relay.workers.dev', token: 'super-secret' };

  it('goes in a header', () => {
    const r = relayRequest('https://thundersaidenergy.com/feed/', usable)!;
    expect(r.headers['x-relay-token']).toBe('super-secret');
  });

  it('and NOT in the query string, where it would land in three sets of logs', () => {
    const r = relayRequest('https://thundersaidenergy.com/feed/', usable)!;
    expect(r.url).not.toContain('super-secret');
  });

  it('the target is encoded, so its own query string cannot inject a parameter', () => {
    const r = relayRequest('https://x.com/feed?a=1&url=https://evil.test', usable)!;
    // One `url=` parameter, not two.
    expect([...new URL(r.url).searchParams.getAll('url')]).toHaveLength(1);
    expect(new URL(r.url).searchParams.get('url')).toBe(
      'https://x.com/feed?a=1&url=https://evil.test',
    );
  });

  it('a trailing slash on the base does not produce a double slash', () => {
    const r = relayRequest('https://x.com/feed', {
      url: 'https://relay.workers.dev///',
      token: 't',
    })!;
    expect(r.url.startsWith('https://relay.workers.dev/?url=')).toBe(true);
  });

  it('returns null rather than an unauthenticated request when unusable', () => {
    expect(relayRequest('https://x.com/feed', { url: 'https://r.dev', token: null })).toBeNull();
  });
});

describe('the allowlist is derived, not hand-maintained', () => {
  it('contains exactly the blocked sources’ hosts', () => {
    const hosts = allowedHosts(powerdeal.sources);
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts).toContain('thundersaidenergy.com');
  });

  it('does NOT contain a working source’s host', () => {
    // A relay that can fetch everything the platform reads is a wider proxy
    // than the problem requires.
    const hosts = allowedHosts(powerdeal.sources);
    expect(hosts).not.toContain('www.energy.gov');
  });

  it('a malformed URL contributes no host rather than widening anything', () => {
    expect(allowedHosts([source({ status: 'blocked', url: 'not a url' })])).toEqual([]);
  });

  it('is empty when nothing is blocked — an empty allowlist relays nothing', () => {
    expect(allowedHosts([source({ status: 'active' })])).toEqual([]);
  });

  it('THE WORKER’S EMBEDDED LIST MATCHES', async () => {
    // An allowlist that falls behind blocks a real feed; one that runs ahead
    // is a widened proxy nobody reviewed. Held together here because the
    // Worker is deployed separately and no build step spans both.
    const src = await readFile('workers/feed-relay.js', 'utf8');
    const match = /const ALLOWED_HOSTS = \[([^\]]*)\]/.exec(src)!;
    expect(match, 'ALLOWED_HOSTS not found in the Worker').toBeTruthy();
    const embedded = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(embedded).toEqual(allowedHosts(powerdeal.sources));
  });
});

describe('the Worker fails closed and re-checks every redirect', () => {
  it('refuses everything when its secret is unset', async () => {
    // A Worker deployed without its secret must refuse rather than serve as
    // the open proxy the whole file exists to avoid being.
    const src = await readFile('workers/feed-relay.js', 'utf8');
    expect(src).toContain('if (!env.RELAY_TOKEN)');
    expect(src).toContain('Refusing to relay');
  });

  it('follows redirects MANUALLY, re-checking the allowlist each hop', async () => {
    // `redirect: 'follow'` checks the allowlist once and then follows a 302
    // anywhere — the most common way an allowlisted proxy becomes an open one.
    const src = await readFile('workers/feed-relay.js', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain("redirect: 'manual'");
    expect(code).not.toContain("redirect: 'follow'");
    expect(code).toContain('redirected off the allowlist');
  });

  it('matches subdomains but not lookalike suffixes', async () => {
    const src = await readFile('workers/feed-relay.js', 'utf8');
    // `notthundersaidenergy.com` ends with an allowed host and is a different
    // domain, so a bare endsWith would let it through.
    expect(src).toContain('host === h || host.endsWith(`.${h}`)');
  });

  it('relays https only', async () => {
    const src = await readFile('workers/feed-relay.js', 'utf8');
    expect(src).toContain("parsed.protocol !== 'https:'");
  });

  it('rejects non-GET', async () => {
    const src = await readFile('workers/feed-relay.js', 'utf8');
    expect(src).toContain("request.method !== 'GET'");
  });
});

describe('nothing gates — no relay means exactly today’s behaviour', () => {
  it('blocked sources stay out of the fetch list', async () => {
    const { resolveSources } = await import('@/lib/active-vertical');
    const ids = resolveSources(powerdeal, null).map((s) => s.id);
    expect(ids).not.toContain('thunder-said');
  });

  it('and come back only when BOTH env vars are set', async () => {
    process.env.FEED_RELAY_URL = 'https://relay.workers.dev';
    process.env.FEED_RELAY_TOKEN = 'secret';
    const { resolveSources } = await import('@/lib/active-vertical');
    expect(resolveSources(powerdeal, null).map((s) => s.id)).toContain('thunder-said');
  });

  it('a URL alone does not bring them back', async () => {
    process.env.FEED_RELAY_URL = 'https://relay.workers.dev';
    const { resolveSources } = await import('@/lib/active-vertical');
    expect(resolveSources(powerdeal, null).map((s) => s.id)).not.toContain('thunder-said');
  });

  it('a muted blocked source stays muted even with a relay', async () => {
    process.env.FEED_RELAY_URL = 'https://relay.workers.dev';
    process.env.FEED_RELAY_TOKEN = 'secret';
    const { resolveSources } = await import('@/lib/active-vertical');
    const ids = resolveSources(powerdeal, { muted: ['thunder-said'] }).map((s) => s.id);
    expect(ids).not.toContain('thunder-said');
  });
});
