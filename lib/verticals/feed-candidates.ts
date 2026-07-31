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
 */

export interface CandidateSet {
  /** Source id in powerdeal.ts this is trying to repair. */
  sourceId: string;
  /** Why the current URL failed, from the last probe. */
  failure: string;
  /** Ordered best-guess first. */
  urls: string[];
}

export const FEED_CANDIDATES: CandidateSet[] = [
  {
    sourceId: 'epa-class-vi',
    failure:
      'NEW SOURCE — restoring VERIFIED-tier CCUS coverage lost when netl-news moved to the DOE-wide feed',
    /**
     * ROUND 1 (2026-07-31): all four phrasings failed. "Class VI",
     * "underground injection control" and "geologic sequestration" each
     * returned 0 items; "carbon dioxide injection" returned 3, all off-topic
     * (heavy-duty engine penalties, a plywood emissions standard, an Oklahoma
     * air plan) — the term search is loose full-text, not topical.
     *
     * The feed titles revealed why the empties were empty: the FR API applies
     * a default window, "published on or after 06/30/2026". That is ~30 days.
     * FERC survives it because FERC files constantly; EPA Class VI actions are
     * far lower volume.
     *
     * ROUND 2 is diagnostic. Widening to a 2024 start separates the two
     * possible causes:
     *   - items come back → it was only the 30-day window, and a wide window
     *     is the fix for a low-volume regulatory source.
     *   - still empty → the Federal Register does not carry individual Class
     *     VI permit decisions at all (EPA posts many to its UIC pages), and
     *     no query against it will ever work. Then the answer is EPA's own
     *     newsroom feed, which is why those are here too.
     */
    /**
     * ROUND 2 ruled out the Federal Register entirely, on two counts:
     *
     *  - publication_date[gte] is IGNORED. Sending gte=2024-01-01 still
     *    returned a feed titled "published on or after 06/30/2026". The RSS
     *    endpoint hard-caps at ~30 days whatever you ask for, so it can never
     *    give historical depth for a low-volume topic. (ferc-news is unharmed
     *    — FERC files enough to fill 30 days with 141 documents.)
     *  - Unquoted "Class VI" returned 6 items, the same off-topic set as
     *    round 1: heavy-duty engine penalties, a plywood emissions standard,
     *    an Oklahoma air plan. The term search matches "Class" and "VI"
     *    loosely. EPA publishes permit-level Class VI activity on its UIC
     *    pages, not in the Federal Register.
     *
     * ROUND 3 is the last attempt, and only on EPA's own endpoints.
     * /rss/epa-news.xml 404s. /newsreleases/search/rss returned HTTP 202 with
     * an empty body — Drupal generating the feed asynchronously — so it is
     * retried here alongside the non-search paths, which should not need
     * generating at all.
     *
     * If all of these fail, stop: there is no verified EPA feed to have, and
     * the aggregated Class VI source added to powerdeal.ts in this commit is
     * the honest ceiling.
     */
    urls: [
      'https://www.epa.gov/newsreleases/search/rss',
      'https://www.epa.gov/newsreleases/rss.xml',
      'https://www.epa.gov/newsreleases/search/rss/field_press_office/headquarters',
      'https://www.epa.gov/feeds/epa-news.rss',
    ],
  },
];
