-- ═══════════════════════════════════════════════════════
-- PowerDeal Platform — Pipeline Seed (a DEMO book, not anyone's real one)
--
-- ⚠️ THESE TWENTY-ONE ACCOUNTS ARE INVENTED. They used to be the operator's
-- actual target list, with a named contact at a defense prime and forty-two
-- cells of live BD reasoning. That made the repo unshippable: every component
-- of this system has to be independently packageable, and a package that
-- carries somebody's competitive strategy is a notebook, not a product.
--
-- The real book lives in the database, under a user_id. This file only ever
-- writes TEMPLATE rows (user_id = NULL) and only ever deletes template rows,
-- so replacing it does not touch a single real deal.
--
-- Kept in step with lib/seed-data.ts by tests/seed-visible.test.ts — the two
-- representations of one demo dataset must not drift.
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

-- ── DEFENSE ────────────────────────────────────────────────

('DEF-001', 'SAMPLE — Ironvale Defense Systems', 'Defense', 'Direct',
 'Primary', 'CA', 'SDG&E', 'Multiple', 'Coastal test range',
 'Prospecting', 116, 1, false, false,
 'A. Sample (Energy & Utilities Mgr)',
 'Book the site feasibility call; name the economic buyer and the security sponsor',
 'Single-threaded on the one named contact; no load number confirmed', null),

('DEF-006', 'SAMPLE — Calderwood Marine Group', 'Defense', 'Direct',
 'Primary', 'VA', 'Dominion', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Choose a beachhead segment before approaching the enterprise',
 'Several business units, each with its own clearance process', null),

('DEF-007', 'SAMPLE — Helix Avionics Group', 'Defense', 'Direct',
 'Primary', 'FL', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Map the site list and find the ones where an outage stops production',
 'Multi-site, and site access is controlled centrally', null),

('DEF-021', 'SAMPLE — Orbital Reach Industries', 'Defense/Special', 'Direct',
 'Primary', 'TX', 'ERCOT', 'Multiple', 'Launch complex',
 'Prospecting', null, 0, false, false,
 null,
 'Qualify the launch and factory loads; lead with time-to-power',
 'Vertically integrated and may build its own generation', null),

-- ── INDUSTRIAL / CHEMICAL ──────────────────────────────────

('IND-002', 'SAMPLE — Bramwell Chemical Works', 'Industrial-Chemical', 'Direct',
 'Primary', 'MA', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Pick one plant to qualify rather than approaching the group',
 'No contact yet and no load figure for any site', null),

('IND-004', 'SAMPLE — Ardent Polymers', 'Industrial-Chemical', 'Direct',
 'Primary', 'DE', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Re-map the footprint after the recent divestiture',
 'Footprint changed this year; the old site list is stale', null),

('IND-005', 'SAMPLE — Kestrelex Specialty Chemicals', 'Industrial-Chemical', 'Direct',
 'Primary', 'multi', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Establish whether the US business can decide without the parent',
 'Overseas parent; US decision autonomy unclear', null),

('IND-008', 'SAMPLE — Northfield Surfactants', 'Industrial-Chemical', 'Direct',
 'Primary', 'IL', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Test whether process continuity is a live pain or a stated one',
 'Mid-cap; no load profile on file and no contact yet', null),

('IND-009', 'SAMPLE — Bayline Vinyls', 'Industrial-Chemical', 'Direct',
 'Primary', 'TX', 'CenterPoint', 'Multiple', 'Coastal plant',
 'Prospecting', null, 0, false, false,
 null,
 'Open on air-permit headroom; map the plants in the same airshed',
 'Competitive home territory; no contact yet', null),

('IND-014', 'SAMPLE — Quillon Semiconductor', 'Industrial-Semicon', 'Direct',
 'Primary', 'DE', 'Delmarva', 'Multiple', 'Wafer fab',
 'Prospecting', null, 0, false, false,
 null,
 'Reach them while the energy strategy is still being written',
 'Newly separated business; procurement process still forming', null),

-- ── OIL & GAS — DOWNSTREAM ─────────────────────────────────

('OG-003', 'SAMPLE — Redstone Refining', 'O&G-Down', 'Direct',
 'Secondary', 'KS', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Qualify reliability pain at the two inland refineries',
 'Inland sites; the permitting argument lands harder on the coast', null),

('OG-010', 'SAMPLE — Copperline Energy Partners', 'O&G-Down', 'Direct',
 'Primary', 'TX', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Pick one refinery as the beachhead rather than pitching the fleet',
 'Large fleet; needs sequencing before any enterprise conversation', null),

('OG-017', 'SAMPLE — Halbrook Petroleum', 'O&G-Down', 'Direct',
 'Primary', 'OH', 'multi', 'Multiple', 'Gulf refinery',
 'Prospecting', null, 0, false, false,
 null,
 'Lead with the coastal site where air permitting is tightest',
 'Large fleet; head office is far from the site that matters', null),

-- ── OIL & GAS — MIDSTREAM ──────────────────────────────────

('OG-013', 'SAMPLE — Perdiz Midstream', 'O&G-Mid', 'Direct',
 'Primary', 'TX', 'ERCOT', 'Multiple', 'Gas processing complex',
 'Prospecting', null, 0, false, false,
 null,
 'Map processing and fractionation loads — they already own the fuel',
 'Assets spread across a basin; loads are distributed', null),

('OG-015', 'SAMPLE — Silt Creek Pipeline Partners', 'O&G-Mid', 'Direct',
 'Primary', 'TX', 'multi', 'Grid-fighter', null,
 'Prospecting', null, 0, false, false,
 null,
 'Find out whether any single station clears the minimum unit size',
 'Many small loads; may be sub-scale everywhere', null),

('OG-016', 'SAMPLE — Bluestem Gathering Co', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'KS', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Probe both angles: compression load, and their own build ambitions',
 'May want to partner rather than buy', null),

('OG-018', 'SAMPLE — Cordillera NGL Partners', 'O&G-Mid', 'Direct',
 'Secondary', 'OK', 'PSO', 'Multiple', 'NGL fractionation hub',
 'Prospecting', null, 0, false, false,
 null,
 'Follow the load rather than the head office — the hub is out of state',
 'Assets in several states; the biggest loads are not near HQ', null),

('OG-019', 'SAMPLE — Tamarack Transmission', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'OK', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Test the dual angle: compression load, and their announced power projects',
 'Building generation themselves — buyer, partner, or neither', null),

('OG-020', 'SAMPLE — Northbank Energy Transport', 'O&G-Mid', 'Direct/Partner',
 'Secondary', 'TX', 'multi', 'Multiple', null,
 'Prospecting', null, 0, false, false,
 null,
 'Establish where US decisions are actually made',
 'Overseas parent, and pursuing its own generation projects', null),

-- ── OTHER ──────────────────────────────────────────────────

('OTH-011', 'SAMPLE — Verano Estate Winery', 'Other-Winery', 'Direct',
 'Primary', 'CA', 'PG&E', 'Grid-fighter', 'Estate winery',
 'Prospecting', null, 0, false, false,
 null,
 'Qualify load size first — a fast no is the useful outcome here',
 'Probably sub-scale; verify before investing time', null),

('OTH-012', 'SAMPLE — Meridian Health Properties', 'Other-REIT', 'Channel/Partner',
 'Primary', 'IL', 'multi', 'Grid-fighter', null,
 'Prospecting', null, 0, false, false,
 null,
 'Clarify who owns the load — the landlord or the tenant',
 'Relationship type unclear; loads split across a portfolio', null);


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
