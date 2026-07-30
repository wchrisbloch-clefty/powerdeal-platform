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
      name: 'CAP Rate Hikes Tracker',
      platform: 'rss',
      url: 'https://www.americanprogress.org/tag/utility-rates/feed/',
      defaultTier: 'reported',
      category: 'power-markets',
      role: 'core',
      rationale:
        'Tracks utility rate increases across states — the single best origination trigger for the grid-fighter value prop.',
    },
    {
      id: 'ferc-news',
      name: 'FERC News',
      platform: 'rss',
      url: 'https://www.ferc.gov/news-events/news/rss.xml',
      defaultTier: 'verified',
      category: 'policy',
      role: 'core',
      rationale:
        'Federal Energy Regulatory Commission — official orders, capacity markets, interconnection.',
    },

    // OIL & GAS
    {
      id: 'ngi',
      name: 'Natural Gas Intelligence',
      platform: 'rss',
      url: 'https://www.naturalgasintel.com/rss/news/',
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
      name: 'Hart Energy',
      platform: 'rss',
      url: 'https://www.hartenergy.com/rss',
      defaultTier: 'reported',
      category: 'og',
      role: 'core',
      rationale:
        'Midstream, upstream, downstream intelligence — E&P, pipelines, processing.',
    },

    // INDUSTRIAL / C&I
    {
      id: 'acc-news',
      name: 'American Chemistry Council',
      platform: 'rss',
      url: 'https://www.americanchemistry.com/rss.xml',
      defaultTier: 'reported',
      category: 'industrial',
      role: 'core',
      rationale:
        'Chemical industry association — member news, regulatory, market data.',
    },
    {
      id: 'industrial-info',
      name: 'Industrial Info Resources',
      platform: 'rss',
      url: 'https://www.industrialinfo.com/news/rss/',
      defaultTier: 'reported',
      category: 'industrial',
      role: 'core',
      rationale:
        'Capital project tracking across industrial sectors — plant expansions, energy projects.',
    },
    {
      id: 'chemical-week',
      name: 'Chemical Week',
      platform: 'rss',
      url: 'https://chemweek.com/rss',
      defaultTier: 'reported',
      category: 'industrial',
      role: 'core',
      rationale:
        'Specialty and commodity chemicals — M&A, capacity additions, ESG moves.',
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
      url: 'https://www.theregister.com/data_centre/headlines.atom',
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
      url: 'https://www.globalccsinstitute.com/news-media/feed/',
      defaultTier: 'verified',
      category: 'ccus',
      role: 'core',
      rationale:
        'Primary CCUS research organization — project tracking, policy, deployment data.',
    },
    {
      id: 'netl-news',
      name: 'NETL News',
      platform: 'rss',
      url: 'https://netl.doe.gov/rss/news',
      defaultTier: 'verified',
      category: 'ccus',
      role: 'core',
      rationale:
        'DOE National Energy Technology Laboratory — CCS research, funding, Class VI data.',
    },
    {
      id: 'thunder-said',
      name: 'Thunder Said Energy',
      platform: 'rss',
      url: 'https://thundersaidenergy.com/feed/',
      defaultTier: 'reported',
      category: 'power-markets',
      role: 'core',
      rationale:
        'Independent energy research — SOFC, technology cost curves, energy transition.',
    },

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
    {
      id: 'reddit-oilandgas',
      name: 'Reddit r/oilandgas',
      platform: 'reddit',
      url: 'https://www.reddit.com/r/oilandgas/.rss',
      defaultTier: 'inferred',
      category: 'og',
      role: 'discovery',
      enabledByDefault: false,
      rationale: 'Industry practitioner discussion — operational intel.',
    },
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
