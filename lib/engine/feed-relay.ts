import type { SourceConfig } from '@/lib/verticals/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE FEED RELAY — reaching sources that block Vercel's IP ranges.
 * ═══════════════════════════════════════════════════════════════
 *
 * thundersaidenergy.com returns 403 to every request from Vercel, on every
 * path. It is Cloudflare and it is IP-based, not user-agent based — the header
 * work was already done and does not help. The source is marked `blocked` and
 * listed rather than deleted, so the coverage gap is visible instead of a
 * Sources tab that looks complete.
 *
 * It was deliberately NOT swapped for an aggregator. The candidate search for
 * SOFC cost analysis returned market-report spam and a Substack post; Thunder
 * Said earned its slot on analytical quality and replacing it with SEO filler
 * would degrade the feed while looking like a fix.
 *
 * The remaining restoration is a relay on an address the publisher does not
 * block. This is the client half of that: when `FEED_RELAY_URL` is set, a
 * blocked source is fetched through it instead of being skipped.
 *
 * ══ THE RELAY IS AN SSRF HAZARD AND IS TREATED AS ONE ══
 *
 * A URL-taking fetch endpoint on the open internet is an open proxy: anyone
 * who finds it can make requests from your infrastructure to anywhere,
 * including cloud metadata endpoints and internal addresses. Two independent
 * controls, and the important one is the second:
 *
 *   1. A shared secret in a header. Keeps casual traffic out. NOT sufficient
 *      on its own — a token in an env var is a token that can leak.
 *   2. A HOST ALLOWLIST INSIDE THE WORKER, derived from the source list. Even
 *      with a valid token, the relay will fetch nothing but the handful of
 *      publishers this platform actually reads. A leaked token then buys an
 *      attacker the ability to read a public RSS feed.
 *
 * `allowedHosts()` below generates that list; `workers/feed-relay.js` embeds
 * it. The two are held together by tests/relay.test.ts — an allowlist that
 * silently falls behind the source list is an allowlist that blocks a real
 * feed, and one that runs ahead is a widened proxy nobody reviewed.
 *
 * ══ IT NEVER GATES ══
 *
 * No relay configured means blocked sources stay blocked, exactly as today.
 * Nothing new fails, nothing is disabled, and the Sources tab keeps saying
 * why. Configuring the relay is the only thing that changes.
 *
 * PURE. Deploying the Worker and setting the env vars is human work; this
 * decides only whether and how to call it. Detection in code, resolution
 * human.
 */

export interface RelayConfig {
  /** Base URL of the deployed Worker. Unset means no relay. */
  url: string | null;
  /** Shared secret. A relay with a URL and no token is not used — see below. */
  token: string | null;
}

export function relayConfig(): RelayConfig {
  return {
    url: process.env.FEED_RELAY_URL?.trim() || null,
    token: process.env.FEED_RELAY_TOKEN?.trim() || null,
  };
}

/**
 * Is the relay usable?
 *
 * BOTH halves are required. A URL with no token would send requests to an
 * endpoint that must then be unauthenticated to answer them — which is an open
 * proxy with this platform's name on it. Half-configured is treated as
 * not-configured, loudly rather than by falling back.
 */
export function relayUsable(config: RelayConfig): boolean {
  return Boolean(config.url && config.token);
}

/** Why the relay is not being used, for the Sources tab. Null when it is. */
export function relayStatus(config: RelayConfig): string | null {
  if (relayUsable(config)) return null;
  if (!config.url && !config.token) {
    return 'No relay configured. Blocked sources stay blocked — see workers/README.md.';
  }
  if (config.url && !config.token) {
    return 'FEED_RELAY_URL is set but FEED_RELAY_TOKEN is not. The relay is NOT being used: an unauthenticated URL-taking fetch endpoint is an open proxy.';
  }
  return 'FEED_RELAY_TOKEN is set but FEED_RELAY_URL is not. Nothing to call.';
}

/**
 * Should this source go through the relay?
 *
 * Only `blocked` ones. Routing everything through a single Worker would put
 * seventeen feeds behind one point of failure to solve a problem that affects
 * one of them, and would hide a publisher's own outage behind a relay error.
 */
export function shouldRelay(source: SourceConfig, config: RelayConfig): boolean {
  return source.status === 'blocked' && relayUsable(config);
}

/**
 * The request to make instead.
 *
 * The target goes in a query parameter and the token in a header — never the
 * reverse. A token in a URL lands in the Worker's request logs, in any
 * intermediary's logs, and in a Referer header if the response ever renders.
 */
export function relayRequest(
  targetUrl: string,
  config: RelayConfig,
): { url: string; headers: Record<string, string> } | null {
  if (!relayUsable(config)) return null;
  const base = config.url!.replace(/\/+$/, '');
  return {
    url: `${base}/?url=${encodeURIComponent(targetUrl)}`,
    headers: { 'x-relay-token': config.token! },
  };
}

/**
 * The hosts the relay may fetch, derived from the source list.
 *
 * Derived rather than hand-listed so a new blocked source cannot be added
 * without the allowlist knowing, and so a source removed from the platform
 * stops being reachable through infrastructure the platform still runs.
 */
export function allowedHosts(sources: SourceConfig[]): string[] {
  const hosts = new Set<string>();
  for (const source of sources) {
    if (source.status !== 'blocked') continue;
    if (!source.url) continue;
    try {
      hosts.add(new URL(source.url).hostname.toLowerCase());
    } catch {
      // A malformed URL contributes no host rather than a wildcard. Silently
      // widening an allowlist because a string would not parse is how a
      // security control becomes decorative.
    }
  }
  return [...hosts].sort();
}
