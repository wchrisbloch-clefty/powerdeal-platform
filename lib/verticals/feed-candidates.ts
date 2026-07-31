/**
 * Candidate replacement URLs for sources that failed the health probe.
 *
 * WHY THIS EXISTS: the build sandbox has no outbound HTTP, so a replacement
 * feed URL cannot be verified where it is written. Guessing one is worse than
 * leaving it broken — a wrong URL that happens to return 200 silently poisons
 * the intelligence layer with off-topic items, and the provenance grading has
 * no way to catch that.
 *
 * So candidates are declared here and probed from the deployment
 * (GET /api/feed/health?candidates=1), which does have real network access.
 * Whatever comes back green gets promoted into powerdeal.ts.
 *
 * This is a fixed, code-defined list on purpose. The probe never fetches a
 * URL supplied by the caller — that would make the endpoint an open proxy.
 *
 * HOW TO USE IT when a feed breaks:
 *   1. GET /api/feed/health and note what failed and how.
 *   2. Add a CandidateSet here with 2-4 plausible URLs. Include an aggregator
 *      query as the last resort — several publishers have closed their feeds.
 *   3. Deploy, then GET /api/feed/health?candidates=1.
 *   4. Judge on sampleTitles, NOT on itemCount. A 200 with 50 items can still
 *      be the wrong feed; that is exactly how the-register-dc nearly shipped
 *      site-wide tech news into the Data Center category.
 *   5. Promote the winner into powerdeal.ts with the live result in a comment,
 *      and delete the entry here.
 *
 * ── RESOLVED 2026-07-31 ───────────────────────────────────────────────────
 * All twelve broken sources are settled; the list is intentionally empty.
 *
 * Repaired to a real publisher feed:
 *   gccsi           → globalccsinstitute.com/feed/
 *   ngi             → naturalgasintel.com/feed/
 *   the-register-dc → theregister.com/on_prem/headlines.atom
 *   ferc-news       → Federal Register API, FERC agency filter (an upgrade —
 *                     the filings themselves rather than press releases)
 *   netl-news       → energy.gov/rss/articles.xml (DOE-wide; recategorised
 *                     ccus → policy to stay honest about scope)
 *
 * Degraded to aggregator queries, all re-graded to 'inferred', because the
 * publisher's feed no longer exists or is unreachable from Vercel:
 *   chemical-week, acc-news, industrial-info, hart-energy, cap-rate-tracker
 *
 * Dropped rather than faked:
 *   thunder-said      — replacement candidates returned SEO market-report
 *                       spam; filler would degrade the feed while looking
 *                       like a fix
 *   reddit-oilandgas  — 429 on every path, every run; needs an authenticated
 *                       Reddit client, not a URL change
 *
 * Standing constraint discovered here: FERC, American Progress, Thunder Said
 * and Reddit all block or throttle Vercel's datacenter egress ranges. No user
 * agent fixes that. When a source 403s or 429s on every candidate path, the
 * answer is a different source, not another header.
 *
 * ── EPA CLASS VI: RULED OUT 2026-07-31, THREE ROUNDS ──────────────────────
 * Added class-vi-permits as an aggregated source instead. Recording the dead
 * ends so nobody spends this again:
 *
 *   Federal Register, six term phrasings across two rounds — "Class VI",
 *     Class VI, "underground injection control", "geologic sequestration",
 *     "carbon sequestration", "carbon dioxide injection". Every one returned
 *     either 0 items or the same off-topic set (heavy-duty engine penalties,
 *     a plywood emissions standard, an Oklahoma air plan). The term search is
 *     loose full-text and does not honour phrases.
 *   Federal Register conditions[publication_date][gte] — IGNORED. Sending
 *     gte=2024-01-01 still returned a feed titled "published on or after
 *     06/30/2026". The RSS endpoint caps at ~30 days regardless, so no
 *     low-volume topic can ever fill it. ferc-news is unaffected only because
 *     FERC files 141 documents inside that window; do not assume the same for
 *     any narrower Federal Register query added later.
 *   epa.gov/rss/epa-news.xml, /feeds/epa-news.rss, /newsreleases/rss.xml —
 *     404.
 *   epa.gov/newsreleases/search/rss and its field_press_office variant —
 *     HTTP 202 with an empty body, on two separate runs. Not a transient
 *     async generation; it simply never returns content.
 *
 * EPA publishes permit-level Class VI activity on its UIC pages with no feed.
 * A verified-tier source would require scraping those pages or a paid
 * regulatory data provider — a real integration, not a URL change.
 *
 * ── CCUS SOURCE ROUND, 2026-07-31 ─────────────────────────────────────────
 * Five more CCUS sources probed. One feed, one scraper, three dead ends.
 *
 *   Sabin Center Climate Law Blog — WORKS, added as sabin-climate-law.
 *   Arnold & Porter Environmental Edge — blog page 200, every feed path 404.
 *     The Sabin Center feed above is the same collaboration's upstream.
 *   Hunton Andrews Kurth — all feed paths 404; huntonnickelreport.com fails
 *     DNS entirely; /insights is a JS shell with no table.
 *   CCUSMap — reachable, no feed at any path. Email updates only, so
 *     email-to-hub is the route if it is ever wanted.
 *   Climate Stacks — /api/projects returns 200 titled "Sign in". An API
 *     exists but is account-gated: a credentials question, not a technical
 *     one. Worth revisiting with a login.
 *
 *   EPA UIC — RESOLVED, and the scraper was worth building. The pages hold no
 *     <table> at all; the record is a Qlik Sense dashboard iframed from
 *     awsedap.epa.gov, whose Engine API is a stateful WebSocket protocol and
 *     not serverless-friendly. But the same page links a PDF snapshot of the
 *     tracker with its date in the filename
 *     (permit-tracker_5-22-26.pdf), which is change-detectable without
 *     parsing anything. See lib/engine/epa-class-vi.ts.
 *
 * Discovered while probing: North Dakota, Texas, West Virginia and Wyoming
 * hold Class VI primacy, so EPA's tracker excludes wells in those states.
 * Their programmes have separate sites, listed in PRIMACY_STATES.
 *
 * ── PRIMACY STATES + PUBLIC DATABASES, 2026-07-31 ─────────────────────────
 * Looked for one queryable database before writing four scrapers. There is
 * no single source covering all four states; the result was one more scraper
 * and three documented gaps.
 *
 *   Texas RRC — TRACKED. Publishes a dated Class VI application list PDF
 *     (class_vi_application-07262026.pdf) on a stable page, the same shape as
 *     EPA's tracker, so both are handled by lib/engine/class-vi-trackers.ts.
 *     Texas keeps superseded lists on the same page, which is why that module
 *     picks the newest parsed date rather than the first link matched.
 *   North Dakota DMR — reachable, no dated list. Records are per-well pages.
 *   West Virginia DEP — reachable; the non-mining UIC permits page has one
 *     table but nothing Class VI-specific.
 *   Wyoming DEQ — reachable, no dated list, but DEQ runs a Class VI listserv
 *     (govdelivery). That suits email-to-hub rather than scraping.
 *
 *   EPA Envirofacts — the API is real and works: pub_dim_facility returned
 *     live GHGRP facility JSON, no key needed. But uic_well does not exist
 *     (404) and rr_subpart_level_information 502s, so the table names for
 *     Subpart RR still need to be found from the Envirofacts model docs. That
 *     remains the most promising route to per-well data across ALL states at
 *     once, since Subpart RR reporting is federal even where permitting is
 *     not — worth another pass with correct table names.
 *   Texas RRC and North Dakota ArcGIS roots — both 404 at the guessed
 *     hostnames. Neither agency exposes services where expected.
 */

export interface CandidateSet {
  /** Source id in powerdeal.ts this is trying to repair. */
  sourceId: string;
  /** Why the current URL failed, from the last probe. */
  failure: string;
  /** Ordered best-guess first. */
  urls: string[];
}

export const FEED_CANDIDATES: CandidateSet[] = [];
