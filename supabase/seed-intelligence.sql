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
-- 2. The IND-004/IND-014 signal was mapped to DEF-001. Its own text is about
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
  v_def001     uuid;  -- DEF-001 Ironvale Defense Systems
  v_def006      uuid;  -- DEF-006 Calderwood Marine Group
  v_def007      uuid;  -- DEF-007 Helix Avionics Group
  v_ind004  uuid;  -- IND-004 Ardent Polymers
  v_ind014   uuid;  -- IND-014 Quillon Semiconductor
  v_oth011     uuid;  -- OTH-011 Verano Estate Winery
  v_og013   uuid;  -- OG-013 Perdiz Midstream
  v_og015  uuid;  -- OG-015 Silt Creek Pipeline Partners
  v_og016   uuid;  -- OG-016 Bluestem Gathering Co
  v_og018   uuid;  -- OG-018 Cordillera NGL Partners
  v_og019     uuid;  -- OG-019 Tamarack Transmission
  v_og020     uuid;  -- OG-020 Northbank Energy Transport

  v_midstream_all     uuid[];
  v_midstream_partner uuid[];
begin
  select id into v_user_id from auth.users order by created_at limit 1;
  if v_user_id is null then
    raise exception 'No user found. Sign in to the app once, then re-run.';
  end if;

  select id into v_def001    from deals where deal_id = 'DEF-001' and user_id = v_user_id;
  select id into v_def006     from deals where deal_id = 'DEF-006' and user_id = v_user_id;
  select id into v_def007     from deals where deal_id = 'DEF-007' and user_id = v_user_id;
  select id into v_ind004 from deals where deal_id = 'IND-004' and user_id = v_user_id;
  select id into v_ind014  from deals where deal_id = 'IND-014' and user_id = v_user_id;
  select id into v_oth011    from deals where deal_id = 'OTH-011' and user_id = v_user_id;
  select id into v_og013  from deals where deal_id = 'OG-013'  and user_id = v_user_id;
  select id into v_og015 from deals where deal_id = 'OG-015'  and user_id = v_user_id;
  select id into v_og016  from deals where deal_id = 'OG-016'  and user_id = v_user_id;
  select id into v_og018  from deals where deal_id = 'OG-018'  and user_id = v_user_id;
  select id into v_og019    from deals where deal_id = 'OG-019'  and user_id = v_user_id;
  select id into v_og020    from deals where deal_id = 'OG-020'  and user_id = v_user_id;

  if v_def001 is null then
    raise exception 'Deals not loaded for this user. Run seed.sql first.';
  end if;

  -- array_remove strips NULLs so a missing account never poisons the array.
  v_midstream_all := array_remove(
    array[v_og013, v_og018, v_og019, v_og020, v_og016, v_og015], null);
  v_midstream_partner := array_remove(array[v_og019, v_og020, v_og016], null);

  -- Idempotent: drop previously seeded rows before re-inserting.
  delete from intelligence_log
   where user_id = v_user_id
     and source_name in (
       'Ardent Polymers/Quillon spinoff announcement',
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

  (v_user_id, 'corporate-event', 'Ardent Polymers/Quillon spinoff announcement',
   array_remove(array[v_ind014, v_ind004], null),
   'Quillon Semiconductor (IND-014) is a fresh spin — new company setting energy strategy NOW with no incumbent inertia. Ardent Polymers (IND-004) footprint shrank — re-scope.',
   'Spin-offs are prime timing windows. New companies write their operating playbooks immediately. Watch for more industrial spins as energy strategy gets rewritten.',
   'Prioritize Quillon outreach before they settle into incumbent energy contracts.',
   'Ardent Polymers spun off electronics division as Quillon Semiconductor (Nov 2025); Quillon expanding US fabs (Newark DE line announced Mar 2026)',
   now() - interval '2 days'),

  (v_user_id, 'market-trend', 'Midstream power convergence pattern',
   v_midstream_partner,
   'Tamarack Transmission (OG-019), Northbank Energy Transport (OG-020), and Bluestem Gathering Co (OG-016) are all building or announcing power-for-data-center ventures. Dual-track these: Direct (their loads) AND Partner (co-develop BTM power using their gas/land/ROW).',
   'Midstream is converging on power. They own gas, land and right-of-way — potential partners more than just customers, which changes who the conversation is with.',
   'Run midstream accounts as Direct/Partner dual-track. Do not pitch as customers only. Probe the partner/co-development angle.',
   'Multiple midstreamers (Tamarack Transmission, Northbank Energy Transport, Bluestem Gathering Co) announcing their own power-for-data-center ventures in Q2 2026',
   now() - interval '2 days'),

  (v_user_id, 'market-trend', 'Midstream fuel ownership structural advantage',
   v_midstream_all,
   'Perdiz Midstream, Cordillera NGL Partners, Tamarack Transmission, Northbank Energy Transport, Bluestem Gathering Co, Silt Creek Pipeline Partners — they own the fuel. Gas processing/compression loads sit ON their own gas supply. Fuel-cost basis advantage + remote sites = grid independence is the lead argument.',
   'Continuous loads, fuel ownership and grid-weak remote sites cluster in this vertical, so the cost-certainty argument needs no permitting angle to stand up.',
   'Lead with fuel ownership and grid independence for this vertical; cost certainty carries the argument without the permitting angle.',
   'Six accounts in this vertical share one structural feature: they own the fuel supply at the load site',
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
   array_remove(array[v_def001, v_def006, v_def007], null),
   'Dominion just made the grid more expensive for large users in VA — call Ironvale Norfolk, Calderwood, Helix Avionics Group: "the cost-certainty case just got sharper."',
   9, now() - interval '20 days'),

  (v_user_id, 'rate-move', 'South Carolina Public Service Commission', 'reported',
   'Dominion Energy South Carolina ~12.7% rate increase pending — decision ~July 2, 2026 — industrial customers face ~14.9% increase',
   'Dominion SC has filed for a rate increase that would raise industrial customer bills approximately 14.9%. Decision expected around July 2, 2026.',
   null,
   array_remove(array[v_def001], null),
   'Ironvale Aiken SC site: ~15% industrial rate hike decision drops July 2 — perfect timing to open the cost-certainty conversation before the decision lands.',
   8, now() - interval '20 days'),

  (v_user_id, 'rate-move', 'California Public Utilities Commission', 'verified',
   'SDG&E authorized 3% annual base revenue increases through 2027 — priciest US utility, getting more expensive automatically',
   'The CPUC authorized SDG&E annual base revenue rate increases of approximately 3% per year through 2027. SDG&E is already the most expensive utility in the US — the spread versus SOFC widens automatically every year.',
   null,
   array_remove(array[v_def001, v_oth011], null),
   'Ironvale San Diego beachhead: the cost case sharpens automatically without you doing anything — call the named contact: "SDG&E authorized 3%/yr increases through 2027. Your cost gap is widening on a schedule."',
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
