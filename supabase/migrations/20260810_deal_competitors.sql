-- ═══════════════════════════════════════════════════════
-- MIGRATION — per-deal competitive state
--
-- Posture is a SET, not a value. A single opportunity can face the grid, a
-- combustion OEM and a packaged integrator at the same time — three different
-- arguments inside one deal, and they are not compatible with each other.
--
-- Per-DEAL, not per-account, and Williams proves why twice over: it is a
-- midstream customer AND a Tier 1B integrator competitor at the account level,
-- and a single deal there is likely to face a multi-competitor mix. One
-- account-level posture field cannot hold either situation, and whichever half
-- it held would be wrong for the other.
--
-- See migrations/README.md for the checklist this satisfies.
-- ═══════════════════════════════════════════════════════

create table if not exists deal_competitors (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         uuid not null references deals(id) on delete cascade,

  -- Free text, not an enum. The named competitor in a given deal is a fact
  -- about that deal ("Wartsila via Burns & McDonnell"), and an enum would
  -- force it into a bucket and lose the part that matters.
  competitor      text not null,

  -- The doctrine's three-tier set, plus 'integrator'.
  --
  -- ⚠️ 'integrator' HAS NO DOCTRINE YET. The three tiers below are defined in
  -- prompts/powerdeal-v3.1.8-system-prompt.md section 1A. The integrator
  -- category was moved out of code and into the methodology and has not landed
  -- there. Cards generated against this tier will have no framing to draw on
  -- until it does. Recorded rather than invented here — a tier definition is
  -- doctrine, and doctrine is not the code's to write.
  tier            text not null check (tier in ('tier-1','tier-2','tier-3','integrator')),

  -- What WE argue against this competitor in this deal.
  posture         text,
  -- What the competitor (or the buyer relaying them) actually said.
  what_was_said   text,
  -- Which of our arguments actually moved them. The compounding half.
  what_landed     text,

  status          text not null default 'active'
                  check (status in ('active','eliminated','lost-to','won-against')),

  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade,

  -- One row per competitor per deal. Two rows for the same competitor would
  -- let two postures against the same opponent diverge inside one deal.
  constraint deal_competitors_unique unique (deal_id, competitor)
);

create index if not exists deal_competitors_deal_idx on deal_competitors(deal_id);
create index if not exists deal_competitors_tier_idx on deal_competitors(tier);
create index if not exists deal_competitors_user_idx on deal_competitors(user_id);


-- ═══════════════════════════════════════════════════════
-- VERIFICATION — run AFTER the migration.
-- Rows with observed values, not a success message.
-- ═══════════════════════════════════════════════════════
--
-- with structural as (
--   select 'table: deal_competitors' as check_name,
--          count(*) = 1 as passed,
--          'tables found: ' || count(*)::text as observed
--   from information_schema.tables
--   where table_name = 'deal_competitors'
--
--   union all
--   select 'columns present',
--          count(*) = 11,
--          'columns: ' || count(*)::text || ' (expect 11)'
--   from information_schema.columns where table_name = 'deal_competitors'
--
--   union all
--   select 'tier is constrained to the doctrine set',
--          count(*) >= 1,
--          'check constraints on tier: ' || count(*)::text
--   from information_schema.constraint_column_usage ccu
--   join information_schema.check_constraints cc using (constraint_name)
--   where ccu.table_name = 'deal_competitors' and ccu.column_name = 'tier'
--
--   union all
--   select 'one row per competitor per deal',
--          count(*) = 1,
--          'unique constraints: ' || count(*)::text
--   from pg_constraint
--   where conname = 'deal_competitors_unique'
--
--   union all
--   select 'cascades when a deal is deleted',
--          count(*) = 1,
--          case when count(*) = 1 then 'on delete cascade' else 'NO CASCADE — orphans possible' end
--   from pg_constraint
--   where confrelid = 'deals'::regclass
--     and conrelid = 'deal_competitors'::regclass
--     and confdeltype = 'c'
-- )
-- select check_name, case when passed then 'PASS' else 'FAIL' end as result, observed
-- from structural order by result desc, check_name;
--
--
-- ── Behavioural: a deal really can hold three postures at once ──
-- Same rollback safety as the win-loss block: a DO block is one statement, so
-- a raise inside it undoes everything it created. Verified against a real
-- PostgreSQL, negative case included.
--
-- do $$
-- declare
--   v_deal uuid;
--   v_count int;
--   v_tiers text;
-- begin
--   insert into deals (deal_id, company, vertical, stage, user_id)
--   values ('ZZ-COMPET', 'Multi-Posture Co', 'Other', 'Discovery',
--           (select user_id from deals limit 1))
--   returning id into v_deal;
--
--   insert into deal_competitors (deal_id, competitor, tier, posture, user_id) values
--     (v_deal, 'The Grid', 'tier-1',
--      'Rate escalation with no control and no exit', (select user_id from deals limit 1)),
--     (v_deal, 'Wartsila recip', 'tier-1',
--      'Emissions envelope and permit timeline', (select user_id from deals limit 1)),
--     (v_deal, 'Packaged integrator', 'integrator',
--      'Bundled price hides financing cost and cannot be unbundled later',
--      (select user_id from deals limit 1));
--
--   select count(*), string_agg(distinct tier, ', ' order by tier)
--     into v_count, v_tiers
--     from deal_competitors where deal_id = v_deal;
--
--   raise notice 'competitors on one deal : % (expect 3)', v_count;
--   raise notice 'distinct tiers          : %', v_tiers;
--
--   if v_count <> 3 then
--     raise exception 'FAIL: a deal cannot hold three postures — got %', v_count;
--   end if;
--
--   -- The uniqueness rule must bite: a second row for the same competitor
--   -- would let two postures against one opponent diverge inside one deal.
--   begin
--     insert into deal_competitors (deal_id, competitor, tier, user_id)
--     values (v_deal, 'The Grid', 'tier-1', (select user_id from deals limit 1));
--     raise exception 'FAIL: duplicate competitor was accepted';
--   exception when unique_violation then
--     raise notice 'duplicate competitor rejected : correct';
--   end;
--
--   -- And an undefined tier must be refused rather than stored.
--   begin
--     insert into deal_competitors (deal_id, competitor, tier, user_id)
--     values (v_deal, 'Something else', 'tier-9', (select user_id from deals limit 1));
--     raise exception 'FAIL: an undefined tier was accepted';
--   exception when check_violation then
--     raise notice 'undefined tier rejected       : correct';
--   end;
--
--   raise notice 'PASS: multi-posture, unique per competitor, tier constrained';
--
--   delete from deal_competitors where deal_id = v_deal;
--   delete from deals where id = v_deal;
--   raise notice 'cleaned up';
-- end $$;
--
--
-- ── Then read the state ──
-- select d.deal_id, d.company, c.tier, c.competitor, c.status,
--        coalesce(c.posture, '— no posture recorded —') as posture,
--        coalesce(c.what_landed, '— nothing recorded as landing —') as what_landed
-- from deal_competitors c
-- join deals d on d.id = c.deal_id
-- order by d.deal_id, c.tier, c.competitor;
--
-- Expect zero rows immediately after this migration.
