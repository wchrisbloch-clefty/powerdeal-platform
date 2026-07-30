-- ═══════════════════════════════════════════════════════
-- PowerDeal Platform — Pipeline Seed (21 template accounts)
--
-- ⚠️  READ THIS BEFORE USING THE NUMBERS IN ANYTHING REAL  ⚠️
--
-- These rows were NOT imported from Pipeline-Spine.md — that file was not
-- available at build time. They are a STRUCTURAL TEMPLATE: real company
-- names in the right verticals and states, so the pipeline table, filters,
-- map markers, and health rings all have realistic data to render.
--
-- What is deliberately EMPTY on every row:
--   • MEDDPICC fields (champion, economic_buyer, decision_criteria, ...)
--   • size_mw / size_usd_m
--   • beachhead_site, next_move, key_risk
--
-- Those were left null rather than invented. A fabricated champion name or
-- MW figure that reads as real is worse than an obvious blank — it would
-- flow straight into a generated brief and out to a customer. Every row is
-- therefore stage 'Prospecting' with meddpicc_score 0, which is the honest
-- representation of an account we have no logged intelligence on.
--
-- State and utility assignments are best-effort from public knowledge and
-- SHOULD BE VERIFIED. Utilities in particular are set only where the
-- territory is unambiguous, and left null otherwise.
--
-- ── TO LOAD YOUR REAL PIPELINE ──────────────────────────
--   1. Export Pipeline-Spine.md to CSV with columns matching `deals`
--   2. Either: replace the VALUES block below, or
--      use Supabase Studio → Table Editor → deals → Import CSV
--   3. Re-run: delete from deals where user_id is null;  (clears template)
--
-- HOW THE TEMPLATE WORKS: these rows are inserted with user_id = NULL,
-- making them a template rather than anyone's data. On first login the app
-- calls seed_new_user(), which copies them into that user's account. RLS
-- hides user_id IS NULL rows from every user, so the template itself is
-- never visible in the app.
-- ═══════════════════════════════════════════════════════

-- Idempotent: re-running replaces the template without touching real data.
delete from deals where user_id is null;

insert into deals (
  deal_id, company, vertical, relationship_type, geo_tier, state, utility,
  value_prop, stage, meddpicc_score, multi_threaded, decision_mapped,
  days_in_stage, notes, user_id
) values

-- ── DEFENSE ─────────────────────────────────────────────
('DEF-001', 'BAE Systems',            'Defense', 'Direct', 'Primary',   'NH', 'Eversource',
 'Both',                'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-002', 'General Dynamics',       'Defense', 'Direct', 'Secondary', 'VA', 'Dominion',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-003', 'Raytheon (RTX)',         'Defense', 'Direct', 'Secondary', 'AZ', null,
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-004', 'Lockheed Martin',        'Defense', 'Direct', 'Secondary', 'TX', 'Oncor',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-005', 'Northrop Grumman',       'Defense', 'Direct', 'Secondary', 'CA', 'SCE',
 'Both',                'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-006', 'L3Harris Technologies',  'Defense', 'Direct', 'Secondary', 'FL', null,
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DEF-007', 'Huntington Ingalls',     'Defense', 'Direct', 'Secondary', 'VA', 'Dominion',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),

-- ── OIL & GAS — DOWNSTREAM ──────────────────────────────
('OG-001',  'Valero Energy',          'O&G-Down', 'Direct', 'Primary',   'TX', 'CenterPoint',
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — HGB non-attainment territory, verify before use.', null),
('OG-002',  'Marathon Petroleum',     'O&G-Down', 'Direct', 'Primary',   'TX', null,
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('OG-003',  'Phillips 66',            'O&G-Down', 'Direct', 'Primary',   'TX', null,
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('OG-004',  'PBF Energy',             'O&G-Down', 'Direct', 'Secondary', 'LA', null,
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),

-- ── OIL & GAS — MIDSTREAM ───────────────────────────────
('OG-005',  'Energy Transfer',        'O&G-Mid',  'Direct', 'Primary',   'TX', 'Oncor',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('OG-006',  'Williams Companies',     'O&G-Mid',  'Direct', 'Secondary', 'OK', null,
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('OG-007',  'Kinder Morgan',          'O&G-Mid',  'Direct', 'Primary',   'TX', 'CenterPoint',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('OG-008',  'Targa Resources',        'O&G-Mid',  'Direct', 'Primary',   'TX', 'Oncor',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),

-- ── INDUSTRIAL / CHEMICAL ───────────────────────────────
('IND-001', 'Westlake Corporation',   'Industrial-Chemical', 'Direct', 'Primary',   'TX', 'CenterPoint',
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — HGB non-attainment territory, verify before use.', null),
('IND-002', 'Dow',                    'Industrial-Chemical', 'Direct', 'Primary',   'TX', null,
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('IND-003', 'LyondellBasell',         'Industrial-Chemical', 'Direct', 'Primary',   'TX', 'CenterPoint',
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('IND-004', 'Olin Corporation',       'Industrial-Chemical', 'Direct', 'Secondary', 'LA', null,
 'Combustion-fighter',  'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),

-- ── DATA CENTER ─────────────────────────────────────────
('DC-001',  'Equinix',                'Data Center', 'Direct',  'Primary',   'VA', 'Dominion',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),
('DC-002',  'Digital Realty',         'Data Center', 'Direct',  'Primary',   'VA', 'Dominion',
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null),

-- ── OTHER ───────────────────────────────────────────────
('OTH-001', 'SpaceX',                 'Other',     'Direct',  'Secondary', 'TX', null,
 'Grid-fighter',        'Prospecting', 0, false, false, 0, 'Template row — verify site, territory, and load before use.', null);


-- ═══════════════════════════════════════════════════════
-- Sanity check — expect 21.
-- ═══════════════════════════════════════════════════════
do $$
declare n integer;
begin
  select count(*) into n from deals where user_id is null;
  raise notice 'PowerDeal template pipeline loaded: % accounts', n;
  if n <> 21 then
    raise warning 'Expected 21 template accounts, found %', n;
  end if;
end $$;
