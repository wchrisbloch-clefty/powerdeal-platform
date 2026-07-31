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
    sourceId: 'ccus-arnold-porter',
    failure:
      'NEW — Arnold & Porter Environmental Edge / CCUS Tracker, maintained with the Columbia Sabin Center. Law-firm blogs are the likeliest survivors of the RSS die-off.',
    urls: [
      'https://www.arnoldporter.com/en/perspectives/blogs/environmental-edge/rss',
      'https://www.arnoldporter.com/en/perspectives/blogs/environmental-edge/feed',
      'https://www.arnoldporter.com/rss/blogs/environmental-edge',
      'https://www.arnoldporter.com/en/perspectives/blogs/environmental-edge',
      // The Sabin Center's own Climate Law Blog is the upstream collaborator
      // and has run a WordPress feed for years.
      'https://blogs.law.columbia.edu/climatechange/feed/',
    ],
  },
  {
    sourceId: 'ccus-hunton',
    failure:
      'NEW — Hunton Andrews Kurth Class VI Permit Tracker. Their energy/environment blog has historically been WordPress-backed.',
    urls: [
      'https://www.huntonak.com/insights/blogs/rss',
      'https://www.huntonak.com/en/insights.rss',
      'https://www.huntonak.com/feed',
      'https://www.huntonnickelreport.com/feed/',
      'https://www.hunton.com/insights/feed',
    ],
  },
  {
    sourceId: 'ccus-climate-stacks',
    failure: 'NEW — Climate Stacks; checking for any feed or API surface.',
    urls: [
      'https://climatestacks.com/feed',
      'https://climatestacks.com/rss',
      'https://climatestacks.com/feed.xml',
      'https://climatestacks.com/',
    ],
  },
  {
    sourceId: 'ccus-ccusmap',
    failure:
      'NEW — CCUSMap. They offer update emails, so a feed may not exist; email-to-hub is the fallback route.',
    urls: [
      'https://ccusmap.com/feed',
      'https://ccusmap.com/rss',
      'https://ccusmap.com/feed.xml',
      'https://ccusmap.com/',
    ],
  },
  {
    /**
     * NOT a feed hunt — a REACHABILITY test before committing to a scraper.
     *
     * The EPA UIC Class VI pages are the authoritative record and would carry
     * VERIFIED tier, but they publish no RSS, so consuming them means periodic
     * scraping. Before writing that, confirm Vercel can reach epa.gov HTML at
     * all: every epa.gov *feed* endpoint tried so far returned 404 or an empty
     * 202, and if the whole domain is unreachable from these egress ranges
     * then a scraper is wasted work.
     *
     * Expect status 'empty' with httpStatus 200 — these are HTML pages, not
     * feeds. What matters is httpStatus and whether feedTitle comes back as
     * the real page title rather than a block page.
     */
    sourceId: 'ccus-epa-dashboard',
    failure: 'NEW — reachability probe ahead of building a scraper',
    urls: [
      'https://www.epa.gov/uic/class-vi-wells-permitted-epa',
      'https://www.epa.gov/uic/current-class-vi-projects-under-review-epa',
      'https://www.epa.gov/uic/class-vi-permitting-process',
      'https://www.epa.gov/uic',
    ],
  },
];
