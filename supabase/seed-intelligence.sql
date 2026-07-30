-- ═══════════════════════════════════════════════════════
-- PowerDeal Platform — Intelligence Log + Market Watch Seed
-- Run AFTER schema.sql and seed.sql, and after signing in once.
-- Safe to re-run: clears prior seeded rows before inserting.
--
-- ── FIXES APPLIED TO THE ORIGINAL DRAFT ────────────────
-- 1. user_id was declared in the column list but MISSING from every VALUES
--    tuple (9 cols / 8 values, and 11 cols / 10 values). Every INSERT would
--    have failed with "INSERT has more target columns than expressions".
--    v_user_id is now supplied in each tuple.
-- 2. The DuPont/Qnity signal was mapped to BAE Systems. Its own text is about
--    IND-014 and IND-004 — remapped to those.
-- 3. The two midstream market-trend signals had deal_ids NULL while naming
--    six specific accounts in the body. Mapped to the accounts they name, so
--    they surface on those deal pages instead of nowhere.
-- 4. Deal lookups now tolerate a missing account rather than inserting a NULL
--    into the uuid[] — a NULL element there breaks the `contains` queries the
--    deal detail page uses.
-- ═══════════════════════════════════════════════════════

do $$
declare
  v_user_id uuid;

  -- Accounts referenced below
  v_bae     uuid;  -- DEF-001 BAE Systems
  v_gd      uuid;  -- DEF-006 General Dynamics
  v_l3      uuid;  -- DEF-007 L3Harris
  v_dupont  uuid;  -- IND-004 DuPont
  v_qnity   uuid;  -- IND-014 Qnity Electronics
  v_far     uuid;  -- OTH-011 Far Niente
  v_targa   uuid;  -- OG-013 Targa
  v_plains  uuid;  -- OG-015 Plains
  v_tallg   uuid;  -- OG-016 Tallgrass
  v_oneok   uuid;  -- OG-018 ONEOK
  v_wmb     uuid;  -- OG-019 Williams
  v_tce     uuid;  -- OG-020 TC Energy

  v_midstream_all     uuid[];
  v_midstream_partner uuid[];
begin
  select id into v_user_id from auth.users order by created_at limit 1;
  if v_user_id is null then
    raise exception 'No user found. Sign in to the app once, then re-run.';
  end if;

  select id into v_bae    from deals where deal_id = 'DEF-001' and user_id = v_user_id;
  select id into v_gd     from deals where deal_id = 'DEF-006' and user_id = v_user_id;
  select id into v_l3     from deals where deal_id = 'DEF-007' and user_id = v_user_id;
  select id into v_dupont from deals where deal_id = 'IND-004' and user_id = v_user_id;
  select id into v_qnity  from deals where deal_id = 'IND-014' and user_id = v_user_id;
  select id into v_far    from deals where deal_id = 'OTH-011' and user_id = v_user_id;
  select id into v_targa  from deals where deal_id = 'OG-013'  and user_id = v_user_id;
  select id into v_plains from deals where deal_id = 'OG-015'  and user_id = v_user_id;
  select id into v_tallg  from deals where deal_id = 'OG-016'  and user_id = v_user_id;
  select id into v_oneok  from deals where deal_id = 'OG-018'  and user_id = v_user_id;
  select id into v_wmb    from deals where deal_id = 'OG-019'  and user_id = v_user_id;
  select id into v_tce    from deals where deal_id = 'OG-020'  and user_id = v_user_id;

  if v_bae is null then
    raise exception 'Deals not loaded for this user. Run seed.sql first.';
  end if;

  -- array_remove strips NULLs so a missing account never poisons the array.
  v_midstream_all := array_remove(
    array[v_targa, v_oneok, v_wmb, v_tce, v_tallg, v_plains], null);
  v_midstream_partner := array_remove(array[v_wmb, v_tce, v_tallg], null);

  -- Idempotent: drop previously seeded rows before re-inserting.
  delete from intelligence_log
   where user_id = v_user_id
     and source_name in (
       'DuPont/Qnity spinoff announcement',
       'Midstream power convergence pattern',
       'Midstream fuel ownership structural advantage');

  delete from market_watch_log
   where user_id = v_user_id
     and source_name in (
       'Virginia State Corporation Commission',
       'South Carolina Public Service Commission',
       'California Public Utilities Commission');

  -- ── INTELLIGENCE LOG ────────────────────────────────────────
  insert into intelligence_log (
    user_id, signal_type, source_name, deal_ids,
    account_meaning, business_meaning, so_what, raw_signal, logged_at
  ) values

  (v_user_id, 'corporate-event', 'DuPont/Qnity spinoff announcement',
   array_remove(array[v_qnity, v_dupont], null),
   'Qnity Electronics (IND-014) is a fresh spin — new company setting energy strategy NOW with no incumbent inertia. DuPont (IND-004) footprint shrank — re-scope.',
   'Spin-offs are prime timing windows. New companies write their operating playbooks immediately. Watch for more industrial spins as energy strategy gets rewritten.',
   'Prioritize Qnity outreach before they settle into incumbent energy contracts.',
   'DuPont spun off electronics division as Qnity Electronics (Nov 2025); Qnity expanding US fabs (Newark DE line announced Mar 2026)',
   now() - interval '2 days'),

  (v_user_id, 'market-trend', 'Midstream power convergence pattern',
   v_midstream_partner,
   'Williams (OG-019), TC Energy (OG-020), and Tallgrass (OG-016) are all building or announcing power-for-data-center ventures. Dual-track these: Direct (their loads) AND Partner (co-develop BTM power using their gas/land/ROW).',
   'Midstream is converging on power. They own gas + land + ROW — potential partners more than just customers. The Phoenician pattern (co-investor over customer) repeats here.',
   'Run midstream accounts as Direct/Partner dual-track. Do not pitch as customers only. Probe the partner/co-development angle.',
   'Multiple midstreamers (Williams, TC Energy, Tallgrass) announcing their own power-for-data-center ventures in Q2 2026',
   now() - interval '2 days'),

  (v_user_id, 'market-trend', 'Midstream fuel ownership structural advantage',
   v_midstream_all,
   'Targa, ONEOK, Williams, TC Energy, Tallgrass, Plains — they own the fuel. Gas processing/compression loads sit ON their own gas supply. Fuel-cost basis advantage + remote sites = grid independence is the lead argument.',
   'Midstream may be the best-fit vertical in the entire book. Continuous loads, fuel ownership, grid-weak remote sites, ESG pressure. The no-tradeoff bundle hits hardest here.',
   'Aim midstream campaign messaging around fuel-ownership advantage and grid independence. Cost certainty is the dominant lever, not permitting.',
   'Pattern recognition: 6 midstream accounts all share the structural feature of owning their own fuel supply at the load site',
   now() - interval '2 days');

  -- ── MARKET WATCH LOG ────────────────────────────────────────
  insert into market_watch_log (
    user_id, category, source_name, source_tier,
    headline, summary, url, deal_ids, outreach_hook, impact_rank, swept_at
  ) values

  (v_user_id, 'rate-move', 'Virginia State Corporation Commission', 'verified',
   'Dominion Energy Virginia rate increase approved — $565.7M, 2026 — new large-user data-center rate class',
   'The SCC approved a $565.7M base rate increase for Dominion Virginia effective 2026, including a new rate class specifically targeting large-user data centers. Industrial customers in VA now face materially higher costs.',
   'https://www.scc.virginia.gov',
   array_remove(array[v_bae, v_gd, v_l3], null),
   'Dominion just made the grid more expensive for large users in VA — call BAE Norfolk, GD, L3Harris: "the cost-certainty case just got sharper."',
   9, now() - interval '20 days'),

  (v_user_id, 'rate-move', 'South Carolina Public Service Commission', 'reported',
   'Dominion Energy South Carolina ~12.7% rate increase pending — decision ~July 2, 2026 — industrial customers face ~14.9% increase',
   'Dominion SC has filed for a rate increase that would raise industrial customer bills approximately 14.9%. Decision expected around July 2, 2026.',
   null,
   array_remove(array[v_bae], null),
   'BAE Aiken SC site: ~15% industrial rate hike decision drops July 2 — perfect timing to open the cost-certainty conversation before the decision lands.',
   8, now() - interval '20 days'),

  (v_user_id, 'rate-move', 'California Public Utilities Commission', 'verified',
   'SDG&E authorized 3% annual base revenue increases through 2027 — priciest US utility, getting more expensive automatically',
   'The CPUC authorized SDG&E annual base revenue rate increases of approximately 3% per year through 2027. SDG&E is already the most expensive utility in the US — the spread versus SOFC widens automatically every year.',
   null,
   array_remove(array[v_bae, v_far], null),
   'BAE San Diego beachhead: the cost case sharpens automatically without you doing anything — call Trevor: "SDG&E authorized 3%/yr increases through 2027. Your cost gap is widening on a schedule."',
   9, now() - interval '20 days');

  raise notice 'Intelligence log and market watch seeded for user %.', v_user_id;
end $$;


-- ═══════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════
select
  (select count(*) from intelligence_log) as intelligence_entries,
  (select count(*) from market_watch_log) as market_watch_entries;

-- Every row should show at least one mapped account.
select
  m.headline,
  m.impact_rank,
  m.source_tier,
  (select string_agg(d.company, ', ' order by d.company)
     from deals d where d.id = any(m.deal_ids)) as hits
from market_watch_log m
order by m.impact_rank desc;
