-- ═══════════════════════════════════════════════════════
-- PowerDeal Platform — Pipeline Seed (the real 21 accounts)
-- Run AFTER schema.sql. Safe to re-run.
--
-- Works in either order:
--   · Run before signing in  → loads the template, and seed_new_user()
--                              copies it on first login.
--   · Run after signing in   → loads the template AND immediately assigns
--                              it to every existing user with no deals.
--
-- Template rows carry user_id = NULL. RLS hides them from every user, so
-- the template is never visible in the app — it is only a source to copy.
--
-- RE-RUNNING IS NON-DESTRUCTIVE to real work: the per-user copy uses
-- ON CONFLICT DO NOTHING keyed on (user_id, deal_id), so edits you have
-- made to a deal are never overwritten.
--
-- NOTE ON health_score: values are computed by the deals_health_score
-- trigger in schema.sql, not set here. A hand-set score and a formula score
-- in the same table are not comparable across the book. Scores start low
-- because MEDDPICC is largely unfilled — they climb as you work the deals.
-- ═══════════════════════════════════════════════════════

-- Refresh the template without touching anyone's real rows.
delete from deals where user_id is null;

insert into deals (
  deal_id, company, vertical, relationship_type, geo_tier, state, utility,
  value_prop, beachhead_site, stage, size_mw, meddpicc_score,
  multi_threaded, decision_mapped, champion, next_move, key_risk, user_id
) values

-- ── DEFENSE ─────────────────────────────────────────────
('DEF-001', 'BAE Systems', 'Defense', 'Direct',
 'Primary', 'CA', 'SDG&E', 'Both', 'ES — San Diego',
 'Prospecting', 116, 1, false, false,
 'Trevor Reitsma (Energy & Utilities Mgr)',
 'Land San Diego feasibility convo; name EB + security gatekeeper',
 'Single-threaded on Trevor; no load number confirmed', null),

('DEF-006', 'General Dynamics', 'Defense', 'Direct',
 'Primary', 'VA', 'Dominion', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Identify beachhead segment (land systems vs. marine)',
 'Massive multi-segment enterprise; security gates throughout', null),

('DEF-007', 'L3Harris', 'Defense', 'Direct',
 'Primary', 'FL', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Map facility footprint; identify reliability-critical fabs',
 'Multi-site; security/OPSEC gates like BAE', null),

('DEF-021', 'SpaceX', 'Defense/Special', 'Direct',
 'Primary', 'TX', 'ERCOT', 'Both', 'Starbase TX',
 'Prospecting', null, 0, false, false,
 null, 'Qualify Starbase + factory loads; time-to-power is their language',
 'Moves fast, vertically integrated — may self-build power; ITAR gates', null),

-- ── INDUSTRIAL / CHEMICAL ───────────────────────────────
('IND-002', 'Cabot Corp', 'Industrial-Chemical', 'Direct',
 'Primary', 'MA', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Identify multi-site beachhead; map carbon black plant loads',
 'Multi-site enterprise; no contact; load unknown', null),

('IND-004', 'DuPont', 'Industrial-Chemical', 'Direct',
 'Primary', 'DE', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Map US plant footprint post-Qnity spin; find beachhead',
 'Post-Qnity spinoff — footprint shrank, re-scope needed', null),

('IND-005', 'Evonik', 'Industrial-Chemical', 'Direct',
 'Primary', 'multi', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Map US footprint; find US decision authority (German parent)',
 'Foreign parent; US decision autonomy unclear', null),

('IND-008', 'Stepan Co', 'Industrial-Chemical', 'Direct',
 'Primary', 'IL', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Qualify process-continuity + ESG pain at surfactant plants',
 'Mid-cap; load profile unknown; no contact yet', null),

('IND-009', 'Westlake Corp', 'Industrial-Chemical', 'Direct',
 'Primary', 'TX', 'CenterPoint', 'Both', 'Gulf Coast petrochemical',
 'Prospecting', null, 0, false, false,
 null, 'HGB non-attainment permitting angle; map Gulf Coast vinyls plants',
 'Home-turf Houston; no contact yet; HGB is the wedge', null),

('IND-014', 'Qnity Electronics', 'Industrial-Semicon', 'Direct',
 'Primary', 'DE', 'Delmarva', 'Both', 'Newark DE fab',
 'Prospecting', null, 0, false, false,
 null, 'Map US fab footprint; fresh-spin energy strategy window NOW',
 'New company (Nov 2025) — processes still forming; DuPont sibling', null),

-- ── OIL & GAS — DOWNSTREAM ──────────────────────────────
('OG-003', 'CVR Energy', 'O&G-Down', 'Direct',
 'Secondary', 'KS', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Qualify refinery reliability + permitting pain at Coffeyville/Wynnewood',
 '2 mid-con refineries; no contact; mid-con HGB less acute than Gulf Coast', null),

('OG-010', 'Valero', 'O&G-Down', 'Direct',
 'Primary', 'TX', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Pick beachhead refinery; reliability + HGB permitting angle',
 '15-refinery giant; enterprise sequencing like BAE needed', null),

('OG-017', 'Marathon Petroleum', 'O&G-Down', 'Direct',
 'Primary', 'OH', 'multi', 'Both', 'Galveston Bay TX (HGB)',
 'Prospecting', null, 0, false, false,
 null, 'Galveston Bay refinery = HGB non-attainment wedge; pick beachhead',
 'Largest US refiner; enterprise sequencing needed same as Valero', null),

-- ── OIL & GAS — MIDSTREAM ───────────────────────────────
('OG-013', 'Targa Resources', 'O&G-Mid', 'Direct',
 'Primary', 'TX', 'ERCOT', 'Both', 'Permian gas processing',
 'Prospecting', null, 0, false, false,
 null, 'Map Permian processing/fractionation loads — they OWN the fuel',
 'Multi-asset Permian sprawl; distributed loads', null),

('OG-015', 'Plains All American', 'O&G-Mid', 'Direct',
 'Primary', 'TX', 'multi', 'Grid-fighter', null,
 'Prospecting', null, 0, false, false,
 null, 'Qualify pump-station/terminal loads — are any sites large enough?',
 'Many small distributed loads; need to find sites above minimum threshold', null),

('OG-016', 'Tallgrass', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'KS', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Probe dual angle: compression loads (Direct) + decarb infra ambitions (Partner)',
 'Energy-transition strategy may make them partner not just buyer', null),

('OG-018', 'ONEOK', 'O&G-Mid', 'Direct',
 'Secondary', 'OK', 'PSO', 'Both', 'Mont Belvieu TX NGL fractionation',
 'Prospecting', null, 0, false, false,
 null, 'Map fractionator + processing loads; Mont Belvieu = TX cluster play',
 'Multi-state asset sprawl; OK HQ but TX loads are the prize', null),

('OG-019', 'Williams', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'OK', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'Dual angle: Transco compression loads + announced power-for-DC builds',
 'They are building gas power themselves — buyer, partner, or neither?', null),

('OG-020', 'TC Energy', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'TX', 'multi', 'Both', null,
 'Prospecting', null, 0, false, false,
 null, 'US decision authority (Calgary parent); dual angle incl. power ambitions',
 'Foreign parent; pursuing own power plays; US autonomy unclear', null),

-- ── OTHER ───────────────────────────────────────────────
('OTH-011', 'Far Niente', 'Other-Winery', 'Direct',
 'Primary', 'CA', 'PG&E', 'Grid-fighter', 'Napa estate',
 'Prospecting', null, 0, false, false,
 null, 'Qualify load size first — likely sub-scale; fast-fail candidate',
 'Winery load probably too small; verify before investing time', null),

('OTH-012', 'Ventas', 'Other-REIT', 'Channel/Partner',
 'Primary', 'IL', 'multi', 'Grid-fighter', null,
 'Prospecting', null, 0, false, false,
 null, 'Clarify model: REIT owns buildings, tenants own load — channel play?',
 'Relationship type unclear; distributed small loads across portfolio', null);


-- ═══════════════════════════════════════════════════════
-- Assign to any user who already exists (post-sign-in path)
-- ═══════════════════════════════════════════════════════
do $$
declare
  v_user record;
  v_count integer;
begin
  for v_user in select id from auth.users loop
    insert into user_settings (user_id) values (v_user.id)
      on conflict (user_id) do nothing;

    insert into deals (
      deal_id, company, vertical, relationship_type, geo_tier, state, utility,
      value_prop, beachhead_site, stage, size_mw, meddpicc_score,
      multi_threaded, decision_mapped, champion, next_move, key_risk, user_id
    )
    select
      t.deal_id, t.company, t.vertical, t.relationship_type, t.geo_tier,
      t.state, t.utility, t.value_prop, t.beachhead_site, t.stage, t.size_mw,
      t.meddpicc_score, t.multi_threaded, t.decision_mapped, t.champion,
      t.next_move, t.key_risk, v_user.id
    from deals t
    where t.user_id is null
    -- Never clobber a deal you have already worked.
    on conflict (user_id, deal_id) do nothing;

    select count(*) into v_count from deals where user_id = v_user.id;
    raise notice 'User %: % deals', v_user.id, v_count;
  end loop;

  if not found then
    raise notice 'No users yet — template loaded. Sign in and it seeds automatically.';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════
select
  (select count(*) from deals where user_id is null) as template_rows,
  (select count(*) from deals where user_id is not null) as assigned_rows;

select deal_id, company, vertical, relationship_type, stage, health_score
from deals
where user_id is not null
order by deal_id;
