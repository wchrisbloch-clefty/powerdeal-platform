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
 *
 * ── ROUND 1 RESULTS (2026-07-31) ──────────────────────────────────────────
 * Settled and removed from this list:
 *   gccsi         → https://www.globalccsinstitute.com/feed/   (12 items)
 *   ngi           → https://www.naturalgasintel.com/feed/      (10 items)
 *   chemical-week → no public feed exists; replaced with an aggregator query
 *
 * Still open, and what round 1 ruled out:
 *   ferc-news, cap-rate-tracker, thunder-said — 403 on every path even with a
 *     browser UA. Not a user-agent problem: almost certainly the WAF blocking
 *     Vercel's datacenter egress ranges, which no header can fix. Round 2 goes
 *     at the underlying primary source instead of the publisher's own feed.
 *   acc-news, hart-energy, industrial-info, netl-news — every guessed path
 *     404s. Round 2 tries the Federal Register API for the government one and
 *     aggregator queries for the trade press, which have likely closed their
 *     public feeds the way Chemical Week did.
 *   the-register-dc — three section paths all returned 50 items with an
 *     identical generic feed title, so the section slug is probably ignored
 *     and all of them serve the whole site. sampleTitles was added to the
 *     probe to settle whether these differ at all.
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
 * The Federal Register publishes every FERC/DOE/EPA rule and notice, exposes a
 * documented RSS API meant to be polled, and does not sit behind a WAF. For a
 * VERIFIED-tier source that is strictly better than scraping an agency
 * newsroom: it is the rule itself rather than a press release about it.
 */
const FR = 'https://www.federalregister.gov/api/v1/documents.rss';
const frAgency = (agency: string, term?: string) =>
  `${FR}?conditions%5Bagencies%5D%5B%5D=${agency}` +
  (term ? `&conditions%5Bterm%5D=${encodeURIComponent(term)}` : '') +
  '&order=newest&per_page=40';

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const FEED_CANDIDATES: CandidateSet[] = [
  {
    sourceId: 'ferc-news',
    failure: '403 on all ferc.gov paths — WAF blocking datacenter egress',
    urls: [
      frAgency('federal-energy-regulatory-commission'),
      gnews('FERC order interconnection OR transmission OR capacity market'),
    ],
  },
  {
    sourceId: 'netl-news',
    failure: '404 on all netl.doe.gov paths',
    urls: [
      frAgency('energy-department', 'carbon capture'),
      'https://www.energy.gov/rss/articles.xml',
      'https://www.energy.gov/fecm/rss.xml',
      gnews('NETL OR "Department of Energy" carbon capture funding'),
    ],
  },
  {
    sourceId: 'cap-rate-tracker',
    failure: '403 on americanprogress.org — WAF',
    urls: [
      gnews('utility rate case approved industrial customers'),
      frAgency('energy-department', 'electricity rates'),
    ],
  },
  {
    sourceId: 'thunder-said',
    failure: '403 on thundersaidenergy.com — Cloudflare',
    urls: [gnews('solid oxide fuel cell cost OR efficiency analysis')],
  },
  {
    sourceId: 'acc-news',
    failure: '404 on all americanchemistry.com paths',
    urls: [
      'https://www.americanchemistry.com/chemistry-in-america/news-trends/rss.xml',
      gnews('"American Chemistry Council" OR chemical manufacturing output'),
    ],
  },
  {
    sourceId: 'hart-energy',
    failure: '404 on all hartenergy.com paths',
    urls: [
      'https://www.hartenergy.com/rss/all',
      'https://www.hartenergy.com/news/feed',
      gnews('midstream natural gas processing plant OR gathering system'),
    ],
  },
  {
    sourceId: 'industrial-info',
    failure: '404 on all industrialinfo.com paths',
    urls: [
      'https://www.industrialinfo.com/rss.xml',
      gnews('industrial capital project OR plant expansion announced'),
    ],
  },
  {
    sourceId: 'the-register-dc',
    failure:
      'section paths all return 50 items with an identical generic title — checking whether they actually differ',
    urls: [
      'https://www.theregister.com/on_prem/headlines.atom',
      'https://www.theregister.com/data_centre/headlines.atom',
      'https://www.theregister.com/headlines.atom',
    ],
  },
  {
    sourceId: 'reddit-oilandgas',
    failure: '429 — Reddit throttles datacenter IPs; r/energy got through',
    urls: [
      'https://www.reddit.com/r/oilandgas/.rss',
      'https://old.reddit.com/r/oilandgas/.rss',
      'https://www.reddit.com/r/oilandgas/new/.rss?limit=25',
    ],
  },
];
