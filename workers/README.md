# Feed relay

`thundersaidenergy.com` returns **403 to every request from Vercel's datacenter
ranges**, on every path. It is Cloudflare and it is **IP-based, not user-agent
based** — the header work was already done and does not help.

The source is marked `blocked` in `lib/verticals/powerdeal.ts` and listed rather
than deleted, so the coverage gap is visible instead of a Sources tab that looks
complete. It was deliberately **not** swapped for an aggregator: the candidate
search for SOFC cost analysis returned market-report spam and a Substack post,
and replacing an analytically strong source with SEO filler degrades the feed
while looking like a fix.

`feed-relay.js` is the remaining restoration — a Cloudflare Worker on an address
the publisher does not block.

## This is an open proxy unless it is not

A URL-taking fetch endpoint on the open internet lets anyone who finds it make
requests **from your Cloudflare account to anywhere** — internal addresses,
cloud metadata endpoints, someone else's rate limits with your name attached.

Two controls, and the second is the one that matters:

| | |
|---|---|
| A shared secret header | Keeps casual traffic out. **Not sufficient alone** — a token in an env var is a token that can leak. |
| **A host allowlist inside the Worker** | Even with a valid token it fetches nothing but the blocked hosts this platform reads. A leaked token then buys an attacker the ability to read a public RSS feed. |

Plus: https only, GET only, and **redirects followed by hand with the allowlist
re-checked on every hop**. `redirect: 'follow'` checks the allowlist once and
then follows a 302 anywhere, which is the most common way an allowlisted proxy
turns back into an open one.

The Worker **fails closed**: deployed without `RELAY_TOKEN` it refuses every
request rather than serving unauthenticated.

## ALLOWED_HOSTS is generated

Do not hand-edit it. It is derived from the platform's own source list by
`allowedHosts()` in `lib/engine/feed-relay.ts`, and `tests/relay.test.ts` holds
the Worker's embedded copy to it. An allowlist that falls behind blocks a real
feed; one that runs ahead is a widened proxy nobody reviewed.

To add a host: mark the source `blocked` in `lib/verticals/`, run the suite, and
paste the list the failing assertion prints.

## Deploying

```
wrangler deploy workers/feed-relay.js --name powerdeal-feed-relay
wrangler secret put RELAY_TOKEN          # generate a long random value
```

Then in Vercel → Settings → Environment Variables:

```
FEED_RELAY_URL=https://powerdeal-feed-relay.<subdomain>.workers.dev
FEED_RELAY_TOKEN=<the same secret>
```

Redeploy. Blocked sources rejoin the fetch list on the next sweep.

## Half-configured is treated as not configured

Setting `FEED_RELAY_URL` without `FEED_RELAY_TOKEN` does **not** enable the
relay. An unauthenticated URL-taking endpoint is the thing this file exists to
avoid, and falling back to it silently would be worse than the 403.

`relayStatus()` reports which half is missing.

## Nothing gates

With no relay configured, blocked sources stay blocked and the Sources tab keeps
saying why — exactly today's behaviour. Nothing new fails and nothing is
disabled. Configuring the relay is the only thing that changes.

## What this does not do

It does not make a paid subscription unnecessary. If Thunder Said offers a
token feed, that is the better restoration: it is the publisher's own supported
path, it survives a Cloudflare rule change, and it does not require running
infrastructure whose failure mode is an open proxy.
