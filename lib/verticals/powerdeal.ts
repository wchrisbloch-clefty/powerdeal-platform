import type { VerticalConfig } from './types';

export const powerdeal: VerticalConfig = {
  id: 'powerdeal',
  name: 'PowerDeal',
  tagline: 'AI-augmented BD for behind-the-meter SOFC power sales.',
  description:
    'The complete commercial operating system for Bloom Energy SOFC baseload power — originate, qualify, advance, and close complex BTM energy deals across industrial, O&G, defense, and data center verticals.',

  // ── CATEGORIES (feed filter chips) ──────────────────
  categories: [
    { id: 'power-markets', label: 'Power Markets' },
    { id: 'og', label: 'Oil & Gas' },
    { id: 'industrial', label: 'Industrial / C&I' },
    { id: 'data-center', label: 'Data Center' },
    { id: 'policy', label: 'Policy & Regulatory' },
    { id: 'ccus', label: 'CCUS' },
    { id: 'defense', label: 'Defense' },
  ],

  // ── ACTIVE MODULES (nav order) ───────────────────────
  modules: [
    'feed',
    'pipeline',
    'maps',
    'social',
    'ccus',
    'pricing',
    'forge',
    'chat',
    'assess',
    'alerts',
    'sources',
    'settings',
  ],

  // ── INTELLIGENCE SOURCES ─────────────────────────────
  // Open channels only — no walled APIs required.
  sources: [
    // POWER MARKETS
    {
      id: 'utility-dive',
      name: 'Utility Dive',
      platform: 'rss',
      url: 'https://www.utilitydive.com/feeds/news/',
      defaultTier: 'reported',
      category: 'power-markets',
      role: 'core',
      rationale:
        'Leading utility industry trade publication — rate cases, regulatory news, grid reliability.',
    },
    {
      id: 'power-magazine',
      name: 'POWER Magazine',
      platform: 'rss',
      url: 'https://www.powermag.com/feed/',
      defaultTier: 'reported',
      category: 'power-markets',
      role: 'core',
      rationale:
        'Power generation industry — technology, markets, and regulatory developments.',
    },
    {
      id: 'eia-news',
      name: 'EIA Today in Energy',
      platform: 'rss',
      url: 'https://www.eia.gov/rss/todayinenergy.xml',
      defaultTier: 'verified',
      category: 'power-markets',
      role: 'core',
      rationale:
        'US government energy statistics — rate data, generation, demand. Primary source → VERIFIED.',
    },
    {
      id: 'cap-rate-tracker',
      name: 'Rate Cases — aggregated',
      platform: 'rss',
      /**
       * americanprogress.org 403s every path from Vercel even with a browser
       * UA (verified twice, 2026-07-31), so it is IP-range blocking that no
       * header changes. Aggregated instead; graded 'inferred' accordingly.
       * Live sample was on point — NIPSCO industrial cost recovery, Xcel rate
       * increase — so the origination trigger survives, at lower confidence.
       */
      url: 'https://news.google.com/rss/search?q=utility+rate+case+approved+industrial+customers&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'power-markets',
      role: 'core',
      rationale:
        'Utility rate increases across states — the best origination trigger for the grid-fighter value prop. Aggregated.',
    },
    {
      id: 'ferc-news',
      name: 'FERC — Federal Register',
      platform: 'rss',
      /**
       * ferc.gov 403s every path from Vercel — WAF against datacenter egress,
       * not a user-agent problem.
       *
       * The Federal Register is a strict upgrade rather than a workaround: it
       * carries the FERC filings and notices themselves, not press releases
       * about them, and publishes a documented RSS API intended to be polled.
       * VERIFIED tier is more defensible here than it was on the newsroom.
       * Live: 141 items — pipeline certificates, license amendments, protest
       * deadlines.
       */
      url: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=federal-energy-regulatory-commission&order=newest&per_page=40',
      defaultTier: 'verified',
      category: 'policy',
      role: 'core',
      rationale:
        'FERC orders, certificates and notices as filed — capacity markets, interconnection. Primary source → VERIFIED.',
    },

    // OIL & GAS
    {
      id: 'ngi',
      name: 'Natural Gas Intelligence',
      platform: 'rss',
      // VERIFIED live 2026-07-31 via /api/feed/health — 10 items. The old
      // /rss/news/ path 404s.
      url: 'https://www.naturalgasintel.com/feed/',
      defaultTier: 'reported',
      category: 'og',
      role: 'core',
      rationale:
        'Leading natural gas market intelligence — prices, infrastructure, regulatory.',
    },
    {
      id: 'oilprice',
      name: 'OilPrice.com',
      platform: 'rss',
      url: 'https://oilprice.com/rss/main',
      defaultTier: 'reported',
      category: 'og',
      role: 'core',
      rationale: 'Broad O&G market coverage — prices, projects, company news.',
    },
    {
      id: 'hart-energy',
      name: 'Midstream — aggregated',
      platform: 'rss',
      // hartenergy.com 404s on every known feed path (5 tried, 2026-07-31) —
      // the public feed is gone. Aggregated; 'inferred' accordingly. Live
      // sample was on point: Momentum Midstream, Trace Midstream gas plant.
      url: 'https://news.google.com/rss/search?q=midstream+natural+gas+processing+plant+OR+gathering+system&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'og',
      role: 'core',
      rationale:
        'Midstream, upstream, downstream intelligence — E&P, pipelines, processing.',
    },

    // INDUSTRIAL / C&I
    {
      id: 'acc-news',
      name: 'Chemical Industry Output — aggregated',
      platform: 'rss',
      // americanchemistry.com 404s on every known feed path (4 tried,
      // 2026-07-31). Aggregated; still surfaces ACC's own releases — the live
      // sample led with their Weekly Chemistry and Economic Trends.
      url: 'https://news.google.com/rss/search?q=%22American+Chemistry+Council%22+OR+chemical+manufacturing+output&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'industrial',
      role: 'core',
      rationale:
        'Chemical industry output, association releases, market data. Aggregated.',
    },
    {
      id: 'industrial-info',
      name: 'Capital Projects — aggregated',
      platform: 'rss',
      // industrialinfo.com 404s on every known feed path (4 tried,
      // 2026-07-31); their feed is subscriber-only now. Aggregated.
      url: 'https://news.google.com/rss/search?q=industrial+capital+project+OR+plant+expansion+announced&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'industrial',
      role: 'core',
      rationale:
        'Capital project tracking — plant expansions and new builds, the load-growth trigger. Aggregated.',
    },
    {
      id: 'chemical-week',
      name: 'Chemicals — aggregated',
      platform: 'rss',
      /**
       * Chemical Week has no public feed any more: chemweek.com/rss and
       * /feed/ both return 200 with the HTML homepage (verified 2026-07-31).
       * The title folded into S&P Global Commodity Insights, behind a
       * subscription.
       *
       * Rather than drop industrial-chemicals coverage entirely, this is an
       * aggregator query. Graded 'inferred', not 'reported', because an
       * aggregator vouches for nothing about the underlying outlet — matching
       * how the other Google News sources are graded. It stays 'core' so the
       * items still reach the feed, just at the lowest confidence.
       */
      url: 'https://news.google.com/rss/search?q=chemical+plant+expansion+OR+petrochemical+capacity&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'industrial',
      role: 'core',
      rationale:
        'Chemicals capacity and expansion news. Aggregated — Chemical Week closed its public feed.',
    },

    // DATA CENTER
    {
      id: 'datacenter-dynamics',
      name: 'DataCenter Dynamics',
      platform: 'rss',
      url: 'https://www.datacenterdynamics.com/en/rss/',
      defaultTier: 'reported',
      category: 'data-center',
      role: 'core',
      rationale:
        'Data center industry — power demand, grid constraints, off-grid solutions.',
    },
    {
      id: 'the-register-dc',
      name: 'The Register — Data Centers',
      platform: 'rss',
      /**
       * data_centre is retired — both /rss and /headlines.atom under it 404.
       * on_prem is the successor section.
       *
       * Worth recording how this was settled: on_prem/headlines.atom and the
       * site-wide headlines.atom both return exactly 50 items under the same
       * generic "www.theregister.com - Articles" title, so item count alone
       * could not tell them apart. Comparing actual item titles showed the
       * section really does filter — on_prem returned Cisco/Azure Local and a
       * datacenter-protest story while the site-wide feed returned Amazon
       * earnings and LinkedIn. Taking the item count on faith would have
       * buried the Data Center category under general tech news.
       */
      url: 'https://www.theregister.com/on_prem/headlines.atom',
      defaultTier: 'reported',
      category: 'data-center',
      role: 'core',
      rationale:
        'Tech industry power and infrastructure — hyperscaler expansion, energy deals.',
    },

    // CCUS / POLICY
    {
      id: 'gccsi',
      name: 'Global CCS Institute',
      platform: 'rss',
      // VERIFIED live 2026-07-31 via /api/feed/health — 12 items, "Global CCS
      // Institute". The old /resources/news-media/news/rss/ path 404s.
      url: 'https://www.globalccsinstitute.com/feed/',
      defaultTier: 'verified',
      category: 'ccus',
      role: 'core',
      rationale:
        'Primary CCUS research organization — project tracking, policy, deployment data.',
    },
    {
      id: 'class-vi-permits',
      name: 'Class VI Permits — aggregated',
      platform: 'rss',
      /**
       * Class VI permit movement is a first-order buying signal, and after
       * netl-news became the DOE-wide feed nothing core was carrying it —
       * gccsi covers CCUS research and events, not permit decisions.
       *
       * This is aggregated rather than primary, and that is not for want of
       * trying. A verified EPA source was probed three times and does not
       * exist to be had:
       *   - Federal Register, four term phrasings: 0 items, or 6 items that
       *     were heavy-duty engine rules and a plywood emissions standard.
       *     Its term search matches "Class" and "VI" loosely.
       *   - Federal Register publication_date[gte] is ignored outright — the
       *     RSS endpoint caps at ~30 days no matter what is requested, so a
       *     low-volume topic can never fill it.
       *   - EPA's own feeds: 404 and an empty HTTP 202.
       * EPA publishes permit-level Class VI activity on its UIC pages, with
       * no feed. Hence 'inferred' — the tier reflects what this actually is.
       *
       * The live sample was on point (Strategic Biofuels securing a Class VI
       * permit, Cameron Parish sequestration expansion), which is exactly the
       * origination trigger this is here for.
       */
      url: 'https://news.google.com/rss/search?q=%22Class+VI%22+permit+EPA+carbon+storage&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'ccus',
      role: 'core',
      rationale:
        'Class VI injection permit filings, approvals and denials — the CCUS origination trigger. Aggregated.',
    },
    {
      id: 'sabin-climate-law',
      name: 'Columbia Sabin Center — Climate Law Blog',
      platform: 'rss',
      /**
       * The only working feed out of five CCUS sources probed 2026-07-31.
       * Arnold & Porter's Environmental Edge — the CCUS Tracker the Sabin
       * Center co-maintains — serves its blog page at 200 but 404s on every
       * feed path, so this is the upstream collaborator's own feed instead.
       *
       * Scope is honest: this is climate law broadly, not a Class VI tracker.
       * The live sample was federal funding litigation and a regulatory agenda
       * analysis, not permits. It earns a slot because CCUS economics turn on
       * exactly this — 45Q, primacy fights, permitting reversals — but
       * class-vi-permits carries the permit-level signal, not this.
       *
       * 'reported', not 'verified': academic legal analysis of primary
       * sources is a step removed from the filings themselves.
       */
      url: 'https://blogs.law.columbia.edu/climatechange/feed/',
      defaultTier: 'reported',
      category: 'policy',
      role: 'core',
      rationale:
        'Climate and energy law analysis — 45Q, Class VI primacy, permitting and regulatory shifts.',
    },
    {
      id: 'netl-news',
      name: 'DOE Energy News',
      platform: 'rss',
      /**
       * netl.doe.gov 404s on every known path (4 tried, 2026-07-31). The DOE
       * department feed is live and primary-source, so VERIFIED holds.
       *
       * Note the honest cost: this is DOE-wide, not NETL's CCS programme, so
       * the category moves ccus -> policy. A Federal Register query filtered
       * to DOE + "carbon capture" was the narrower alternative and was tried,
       * but returned 2 items, one of them an advisory-committee renewal — too
       * thin and not actually on topic. Dedicated CCUS coverage now rests on
       * the Global CCS Institute feed plus the Class VI discovery query.
       */
      url: 'https://www.energy.gov/rss/articles.xml',
      defaultTier: 'verified',
      category: 'policy',
      role: 'core',
      rationale:
        'US Department of Energy announcements — funding, grid, carbon management. Primary source → VERIFIED.',
    },
    /**
     * DROPPED 2026-07-31 — thunder-said (Thunder Said Energy).
     *
     * thundersaidenergy.com 403s from Vercel on every path (Cloudflare, IP
     * range not user agent). Deliberately NOT replaced with an aggregator: the
     * candidate query for SOFC cost analysis came back dominated by
     * market-report spam ("Market Size & Forecast to 2035") and a Substack
     * post. Thunder Said earned its slot on analytical quality, and swapping
     * it for SEO filler would degrade the feed while looking like a fix.
     *
     * Better restorations, in order: a paid Thunder Said subscription with a
     * token feed, or fetching through a proxy on a residential/allowed range.
     */

    // DEFENSE
    {
      id: 'defensenews',
      name: 'Defense News',
      platform: 'rss',
      url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml',
      defaultTier: 'reported',
      category: 'defense',
      role: 'core',
      rationale:
        'Defense industry — contracts, energy resilience, procurement news.',
    },
  ],

  // ── DISCOVERY SOURCES (gap detection) ───────────────
  // These run on topics, not the reader's source list. They never enter the
  // main feed — they only answer "did something big happen that none of my
  // sources covered?"
  discovery: [
    {
      id: 'google-news-power',
      name: 'Google News — Power Markets',
      platform: 'rss',
      url: 'https://news.google.com/rss/search?q=utility+rate+increase+industrial&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'power-markets',
      role: 'discovery',
      enabledByDefault: false,
      rationale:
        'Discovery only — catches rate news from outlets not in curated list.',
    },
    {
      id: 'google-news-sofc',
      name: 'Google News — SOFC/Fuel Cell',
      platform: 'rss',
      url: 'https://news.google.com/rss/search?q=solid+oxide+fuel+cell+SOFC+industrial&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'power-markets',
      role: 'discovery',
      enabledByDefault: false,
      rationale: 'Discovery only — competitive intelligence, technology news.',
    },
    {
      id: 'google-news-ccus',
      name: 'Google News — Class VI / CCUS',
      platform: 'rss',
      url: 'https://news.google.com/rss/search?q=%22Class+VI%22+carbon+sequestration+permit&hl=en-US&gl=US&ceid=US:en',
      defaultTier: 'inferred',
      category: 'ccus',
      role: 'discovery',
      enabledByDefault: false,
      rationale:
        'Discovery only — Class VI permit movement often breaks in local press first.',
    },
    {
      id: 'reddit-energy',
      name: 'Reddit r/energy',
      platform: 'reddit',
      url: 'https://www.reddit.com/r/energy/.rss',
      defaultTier: 'inferred',
      category: 'power-markets',
      role: 'discovery',
      enabledByDefault: false,
      rationale: 'Street-level energy discussion — sentiment, emerging topics.',
    },
    /**
     * DROPPED 2026-07-31 — reddit-oilandgas.
     *
     * 429 on every path across two separate probe runs: www, old.reddit, and
     * /new/?limit=25. Reddit throttles by IP range, so this is not something a
     * backoff fixes — it never succeeded once. r/energy on the same runs went
     * through fine and stays.
     *
     * Restoring it means an authenticated Reddit API client (OAuth app +
     * token), which is a real integration rather than a URL change, and is
     * hard to justify for an opt-in discovery source.
     */
  ],

  // ── WATCHED DOMAINS (blue-ocean opportunity detection) ──
  watchedDomains: [
    'bloomenergy.com',
    'eia.gov',
    'ferc.gov',
    'epa.gov',
    'pjm.com',
    'ercot.com',
    'caiso.com',
    'iso-ne.com',
    'ccusmap.com',
    'globalccsinstitute.com',
    'netl.doe.gov',
    'thundersaidenergy.com',
    'industrialinfo.com',
    'poweroutage.us',
  ],

  // ── CONTEXT TICKER (top strip) ───────────────────────
  ticker: {
    enabled: true,
    label: 'Power Markets',
    entries: [
      { id: 'henry-hub', kind: 'value', label: 'Henry Hub', symbol: 'NG' },
      { id: 'ercot-spot', kind: 'value', label: 'ERCOT RT', symbol: 'ERCOT' },
      { id: 'pjm-spot', kind: 'value', label: 'PJM RT', symbol: 'PJM' },
      { id: 'nat-avg-rate', kind: 'value', label: 'US Avg C&I Rate', symbol: 'EIA-RATE' },
      { id: 'rate-yoy', kind: 'delta', label: 'Rate YoY', symbol: 'EIA-YOY' },
      { id: 'class-vi', kind: 'value', label: 'Class VI Permits' },
    ],
  },

  // ── ASSESSMENT CONFIG (deal portfolio health) ────────
  assessment: {
    dimensions: [
      { key: 'pipeline-quality', label: 'Pipeline Quality' },
      { key: 'deal-advancement', label: 'Deal Advancement' },
      { key: 'intelligence-depth', label: 'Intelligence Depth' },
      { key: 'market-coverage', label: 'Market Coverage' },
      { key: 'origination', label: 'Origination Engine' },
    ],
    questions: [
      {
        key: 'beachhead-clarity',
        dimension: 'pipeline-quality',
        prompt: 'For multi-site accounts, have you named a specific beachhead site?',
        options: [
          'No beachhead named',
          'Some accounts have beachheads',
          'All multi-site accounts have beachheads',
        ],
      },
      {
        key: 'multi-threading',
        dimension: 'deal-advancement',
        prompt: 'Are your top 3 deals multi-threaded (2+ contacts at the account)?',
        options: ['All single-thread', 'Some multi-threaded', 'All top deals multi-threaded'],
      },
      {
        key: 'decision-mapping',
        dimension: 'deal-advancement',
        prompt:
          'Have you mapped the decision process (committee, signer, security gate) on active deals?',
        options: ['Not started', 'Partially mapped', 'Fully mapped with named path'],
      },
      {
        key: 'signal-logging',
        dimension: 'intelligence-depth',
        prompt:
          'How consistently do you log signals from customer interactions to the Intelligence Log?',
        options: ['Rarely', 'Sometimes', 'After every meaningful interaction'],
      },
      {
        key: 'market-watch',
        dimension: 'market-coverage',
        prompt:
          'How regularly do you run Market Watch to surface rate moves and trigger events?',
        options: ['Never/rarely', 'Monthly', 'Weekly'],
      },
      {
        key: 'outreach-active',
        dimension: 'origination',
        prompt: 'How many cold accounts have an active outreach sequence running?',
        options: ['None', '1-3', '4+ accounts'],
      },
    ],
    levels: [
      { min: 0, label: 'Getting Started' },
      { min: 35, label: 'Building Momentum' },
      { min: 60, label: 'Executing Well' },
      { min: 80, label: 'Elite BD Operation' },
    ],
  },

  // ── VOCABULARY ───────────────────────────────────────
  vocabulary: {
    subject: 'deal',
    period: 'quarter',
    event: 'meeting',
  },

  // ── THEME (Bloom green secondary/tertiary) ───────────
  theme: {
    accent: '#3CAD3A',
  },
};
