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
 * Once a source is settled, delete its entry. A stale candidate list is just
 * noise in the probe output.
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
    sourceId: 'ferc-news',
    failure: '403 — suspected user-agent block, URL may still be correct',
    urls: [
      'https://www.ferc.gov/news-events/news/rss.xml',
      'https://www.ferc.gov/rss/headlines.xml',
      'https://www.ferc.gov/news-events/news/feed',
    ],
  },
  {
    sourceId: 'cap-rate-tracker',
    failure: '403 — suspected user-agent block',
    urls: [
      'https://www.americanprogress.org/tag/utility-rates/feed/',
      'https://www.americanprogress.org/feed/',
    ],
  },
  {
    sourceId: 'thunder-said',
    failure: '403 — suspected Cloudflare user-agent block',
    urls: [
      'https://thundersaidenergy.com/feed/',
      'https://thundersaidenergy.com/rss',
    ],
  },
  {
    sourceId: 'netl-news',
    failure: '404 — moved',
    urls: [
      'https://netl.doe.gov/rss.xml',
      'https://netl.doe.gov/node/feed',
      'https://netl.doe.gov/newsroom/rss',
      'https://www.netl.doe.gov/rss/news.xml',
    ],
  },
  {
    sourceId: 'gccsi',
    failure: '404 — moved',
    urls: [
      'https://www.globalccsinstitute.com/feed/',
      'https://www.globalccsinstitute.com/news-media/feed/',
      'https://www.globalccsinstitute.com/rss.xml',
    ],
  },
  {
    sourceId: 'hart-energy',
    failure: '404 — moved',
    urls: [
      'https://www.hartenergy.com/feed',
      'https://www.hartenergy.com/rss.xml',
      'https://www.hartenergy.com/feeds/news.rss',
    ],
  },
  {
    sourceId: 'ngi',
    failure: '404 — moved',
    urls: [
      'https://www.naturalgasintel.com/feed/',
      'https://naturalgasintel.com/feed/',
      'https://www.naturalgasintel.com/rss.xml',
    ],
  },
  {
    sourceId: 'acc-news',
    failure: '404 — moved',
    urls: [
      'https://www.americanchemistry.com/feed',
      'https://www.americanchemistry.com/rss',
      'https://www.americanchemistry.com/chemistry-in-america/news-trends/feed',
    ],
  },
  {
    sourceId: 'industrial-info',
    failure: '404 — moved',
    urls: [
      'https://www.industrialinfo.com/rss/news.xml',
      'https://www.industrialinfo.com/news/rss.xml',
      'https://www.industrialinfo.com/feed',
    ],
  },
  {
    sourceId: 'the-register-dc',
    failure: '404 — moved; section slug likely renamed',
    urls: [
      'https://www.theregister.com/on_prem/headlines.atom',
      'https://www.theregister.com/data_centre/headlines.atom',
      'https://www.theregister.com/on_prem/systems/headlines.atom',
      'https://www.theregister.com/headlines.atom',
    ],
  },
  {
    sourceId: 'chemical-week',
    failure: '200 but zero items — served HTML, not a feed',
    urls: [
      'https://chemweek.com/feed/',
      'https://www.chemweek.com/rss',
      // Chemical Week folded into S&P Global Commodity Insights; if none of the
      // above are feeds, the fallback is the Google News query below.
      'https://news.google.com/rss/search?q=chemical+plant+expansion+OR+petrochemical+capacity&hl=en-US&gl=US&ceid=US:en',
    ],
  },
];
