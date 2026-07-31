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

/**
 * Federal Register query builder. Same approach that repaired ferc-news: the
 * FR publishes the agency action itself, exposes an RSS API meant to be
 * polled, and sits behind no WAF — so it holds up as a VERIFIED-tier source.
 */
const frEpa = (term: string) =>
  'https://www.federalregister.gov/api/v1/documents.rss' +
  '?conditions%5Bagencies%5D%5B%5D=environmental-protection-agency' +
  `&conditions%5Bterm%5D=${encodeURIComponent(term)}` +
  '&order=newest&per_page=40';

export const FEED_CANDIDATES: CandidateSet[] = [
  {
    sourceId: 'epa-class-vi',
    failure:
      'NEW SOURCE — restoring VERIFIED-tier CCUS coverage lost when netl-news moved to the DOE-wide feed',
    /**
     * Four phrasings because it is not obvious which one the Federal Register
     * actually indexes. EPA files these as "Underground Injection Control
     * Program" notices, so the literal string "Class VI" may appear only in
     * the body — or only in some of them.
     *
     * The DOE + carbon-capture attempt is the cautionary case: it returned 2
     * items and one was an advisory-committee renewal. Judge these on
     * sampleTitles being real Class VI permit actions, not on item count.
     */
    urls: [
      frEpa('"Class VI"'),
      frEpa('underground injection control'),
      frEpa('geologic sequestration'),
      frEpa('carbon dioxide injection'),
    ],
  },
];
