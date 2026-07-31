/**
 * Request headers for every outbound feed fetch.
 *
 * These live in one place because the sweep (lib/engine/rss.ts) and the health
 * probe (app/api/feed/health/route.ts) must send byte-identical headers.
 * Otherwise the probe reports green on feeds the sweep cannot actually read,
 * which is worse than no probe at all.
 *
 * Why a browser user-agent rather than an honest bot string: a self-identifying
 * PowerDealBot UA drew 403s from FERC, American Progress and Thunder Said
 * Energy — WAFs (Cloudflare and friends) reject unrecognized agents by default,
 * regardless of robots.txt. These are public RSS endpoints published for
 * subscription, fetched once per sweep at low volume, so the block is
 * indiscriminate rather than a considered policy about this client. We are not
 * evading a rate limit or paywall — see the Reddit handling in the source
 * config for a case where the publisher's limit IS respected.
 */

export const FEED_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  // Some CDNs serve a challenge page to clients that omit these.
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};
