/**
 * ═══════════════════════════════════════════════════════════════
 * FEED RELAY — a Cloudflare Worker for publishers that block Vercel.
 * ═══════════════════════════════════════════════════════════════
 *
 * thundersaidenergy.com returns 403 to every request from Vercel's datacenter
 * ranges. It is IP-based, not user-agent based. This Worker sits on
 * Cloudflare's edge, which those ranges do not cover, and fetches the feed on
 * the app's behalf.
 *
 * ⚠️ THIS IS A URL-TAKING FETCH ENDPOINT, WHICH IS AN OPEN PROXY UNLESS IT IS
 * NOT. Deployed without the controls below, anyone who finds the URL can make
 * requests from your Cloudflare account to anywhere — internal addresses,
 * cloud metadata endpoints, someone else's rate limits with your name on them.
 *
 * TWO CONTROLS, AND THE SECOND IS THE ONE THAT MATTERS:
 *
 *   1. A shared secret header. Keeps casual traffic out. NOT sufficient alone;
 *      a token in an environment variable is a token that can leak.
 *   2. THE HOST ALLOWLIST BELOW. Even with a valid token this Worker will
 *      fetch nothing but the hosts named here. A leaked token buys an attacker
 *      the ability to read a public RSS feed.
 *
 * ALLOWED_HOSTS is generated from the platform's own source list and held to
 * it by tests/relay.test.ts. Do not edit it by hand — add the source to
 * `lib/verticals/` and regenerate, so the allowlist cannot drift from what the
 * app actually reads.
 *
 * ── Deploying ──
 *   wrangler deploy workers/feed-relay.js --name powerdeal-feed-relay
 *   wrangler secret put RELAY_TOKEN        # same value as FEED_RELAY_TOKEN
 * Then in Vercel:
 *   FEED_RELAY_URL=https://powerdeal-feed-relay.<subdomain>.workers.dev
 *   FEED_RELAY_TOKEN=<the same secret>
 *
 * Setting only one of the two is treated by the app as no relay at all, on
 * purpose — see lib/engine/feed-relay.ts.
 */

// GENERATED — see tests/relay.test.ts. Do not hand-edit.
const ALLOWED_HOSTS = ['thundersaidenergy.com'];

/** Redirects are followed only within the allowlist. See below. */
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15000;

function allowed(hostname) {
  const host = hostname.toLowerCase();
  // Exact match or a subdomain of an allowed host. Never a suffix match on the
  // raw string — `notthundersaidenergy.com` ends with an allowed host and is a
  // completely different domain.
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const relay = {
  async fetch(request, env) {
    if (request.method !== 'GET') {
      return new Response('Method not allowed.', { status: 405 });
    }

    if (!env.RELAY_TOKEN) {
      // Fails CLOSED. A Worker deployed without its secret must refuse
      // everything rather than serve as the open proxy this file exists to
      // avoid being.
      return new Response('RELAY_TOKEN is not configured. Refusing to relay.', {
        status: 503,
      });
    }

    if (request.headers.get('x-relay-token') !== env.RELAY_TOKEN) {
      return new Response('Unauthorized.', { status: 401 });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Missing ?url.', { status: 400 });

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response('Unparseable ?url.', { status: 400 });
    }

    // https only. An http target would let anything on the path between here
    // and the publisher rewrite a feed this platform treats as a source.
    if (parsed.protocol !== 'https:') {
      return new Response('Only https targets are relayed.', { status: 400 });
    }

    if (!allowed(parsed.hostname)) {
      return new Response(`Host not on the allowlist: ${parsed.hostname}`, { status: 403 });
    }

    // ⚠️ REDIRECTS ARE FOLLOWED BY HAND, RE-CHECKING THE ALLOWLIST EACH HOP.
    // `redirect: 'follow'` would check the allowlist once and then follow a
    // 302 anywhere, which defeats the allowlist entirely — the single most
    // common way an allowlisted proxy turns back into an open one.
    let current = parsed.toString();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const upstream = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // The publisher's block is IP-based, so this is ordinary politeness
          // rather than evasion: a real, identifiable client string.
          'User-Agent': 'PowerDealBot/1.0 (+feed relay; contact via repository)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      const location = upstream.headers.get('location');
      if (upstream.status >= 300 && upstream.status < 400 && location) {
        let next;
        try {
          next = new URL(location, current);
        } catch {
          return new Response('Upstream redirected to an unparseable URL.', { status: 502 });
        }
        if (next.protocol !== 'https:' || !allowed(next.hostname)) {
          return new Response(
            `Upstream redirected off the allowlist: ${next.hostname}`,
            { status: 403 },
          );
        }
        current = next.toString();
        continue;
      }

      // Body and status passed through unchanged. The caller's parser and
      // health probe already know how to read a 404 or an HTML error page, and
      // rewriting either here would hide a moved feed behind a relay error.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/xml',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(`More than ${MAX_REDIRECTS} redirects.`, { status: 502 });
  },
};

export default relay;
