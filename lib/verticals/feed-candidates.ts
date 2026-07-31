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
    /**
     * Structure probe, not a feed hunt. Round 1 proved epa.gov HTML is
     * reachable from Vercel (200 with the real page titles) — only the feed
     * endpoints were dead. So the scraper is viable and this reads the actual
     * table headers and first row to write the parser against.
     *
     * Guessing the column layout would produce a scraper that returns
     * plausible garbage, which is the same failure class as a wrong feed URL
     * returning 200.
     *
     * /uic/class-vi-permitting-process 404s — dropped, wrong slug.
     */
    sourceId: 'ccus-epa-dashboard',
    failure: 'reading table structure ahead of writing the parser',
    urls: [
      'https://www.epa.gov/uic/current-class-vi-projects-under-review-epa',
      'https://www.epa.gov/uic/class-vi-wells-permitted-epa',
    ],
  },
  {
    /**
     * climatestacks.com is titled "CCS Permit & Class VI Permit Tracker
     * (CCUS)" and is reachable, but has no feed at /feed, /rss or /feed.xml.
     * It is almost certainly a JS app over an API. Trying the usual API and
     * sitemap shapes before falling back to scraping — a JSON endpoint would
     * be far more stable than parsing a rendered SPA.
     */
    sourceId: 'ccus-climate-stacks',
    failure: 'no RSS; looking for the API behind the tracker',
    urls: [
      'https://climatestacks.com/api/permits',
      'https://climatestacks.com/api/projects',
      'https://climatestacks.com/api/v1/permits',
      'https://climatestacks.com/sitemap.xml',
      'https://climatestacks.com/updates',
    ],
  },
  {
    /**
     * Round 1 only tried Hunton feed paths, all 404, and
     * huntonnickelreport.com failed DNS outright — that domain is gone.
     * Checking whether the tracker page itself is reachable and tabular, so
     * "no feed" does not get mistaken for "no source". If it is a table, it
     * can be scraped the same way as EPA.
     */
    sourceId: 'ccus-hunton',
    failure: 'no feed; testing the tracker page for reachability and structure',
    urls: [
      'https://www.huntonak.com/insights/legal-update/epa-class-vi-permit-tracker',
      'https://www.huntonak.com/hunton-nickel-report',
      'https://www.huntonak.com/insights',
    ],
  },
];
