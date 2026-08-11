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

  -- The doctrine's four tiers, in doctrine order.
  --
  -- 'tier-1b' rather than 'integrator': one concept must not carry two names.
  -- It also sorts correctly — 'integrator' sorted ahead of 'tier-1' in every
  -- `order by tier`, which put the fourth tier first in every read.
  --
  -- ⚠️ TIER 1B EXISTS IN DOCTRINE (v3.1.9/v3.1.10) AND IS ABSENT FROM THE
  -- REPO'S PROMPT FILE. prompts/powerdeal-v3.1.8-system-prompt.md contains the
  -- word "integrator" zero times. Until the prompt is synced, a Tier 1B card
  -- generates with no framing — and the prompt's standing instruction to lead
  -- with what grid and combustion cannot do will steer it toward a heat-rate
  -- argument, which is the answer doctrine forbids against an integrator.
  tier            text not null check (tier in ('tier-1','tier-1b','tier-2','tier-3')),

  -- What WE argue against this competitor in this deal.
  posture         text,
  -- What the competitor (or the buyer relaying them) actually said.
  what_was_said   text,
  -- Which of our arguments actually moved them. The compounding half.
  what_landed     text,

  -- 'not-present' is how a DEFAULT-ON competitor is switched off.
  --
  -- The grid is on by default and is not stored as a row: absence means
  -- present, so the zero-click state is already correct for the great majority
  -- of deals. Toggling it OFF is the exception, and writing a row is how the
  -- exception is recorded. That is the opposite of the usual convention and is
  -- deliberate — the alternative seeds a row onto every deal to express the
  -- normal case, which makes an empty table indistinguishable from an
  -- unconfigured one.
  --
  -- 'eliminated' is NOT the same thing: it means we beat them. 'not-present'
  -- means they were never in this deal — a remote off-grid site where the real
  -- fight is a recip engine and grid supply was never an option.
  status          text not null default 'active'
                  check (status in ('active','eliminated','lost-to','won-against','not-present')),

  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade,

  -- One row per competitor per deal. Two rows for the same competitor would
  -- let two postures against the same opponent diverge inside one deal.
  constraint deal_competitors_unique unique (deal_id, competitor)
);

-- ── Rename repair: 'integrator' → 'tier-1b' ──
--
-- Same no-op hazard as the status constraint below, with data attached: on an
-- existing table the inline CHECK above never runs, so stored 'integrator' rows
-- would keep a name the code no longer knows and every card against them would
-- fail to resolve a tier.
--
-- ORDER MATTERS. The constraint is dropped BEFORE the rows are rewritten —
-- 'tier-1b' would violate the old constraint — and re-added afterwards. The
-- trio is idempotent: on a second run the update matches zero rows.
alter table deal_competitors drop constraint if exists deal_competitors_tier_check;
update deal_competitors set tier = 'tier-1b' where tier = 'integrator';
alter table deal_competitors add constraint deal_competitors_tier_check
  check (tier in ('tier-1','tier-1b','tier-2','tier-3'));


-- ── Constraint repair, for a table that predates 'not-present' ──
--
-- `create table if not exists` above is a NO-OP on an existing table, including
-- its CHECK constraints. If this migration was applied before 'not-present'
-- existed, re-running it would appear to succeed and leave the old constraint
-- in place — and the failure would surface in production, the first time
-- somebody switched the grid off on a deal.
--
-- Dropping first makes the pair idempotent: `add constraint` alone would fail
-- on the second run.
alter table deal_competitors drop constraint if exists deal_competitors_status_check;
alter table deal_competitors add constraint deal_competitors_status_check
  check (status in ('active','eliminated','lost-to','won-against','not-present'));

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
--   -- Reports on the repair above. On a table applied before 'not-present'
--   -- existed, `create table if not exists` is a no-op and this is the only
--   -- check that would notice.
--   select 'status admits not-present — the toggle-off state',
--          count(*) = 1,
--          coalesce(max(pg_get_constraintdef(oid)), 'NO not-present IN THE STATUS CONSTRAINT')
--   from pg_constraint
--   where conname = 'deal_competitors_status_check'
--     and pg_get_constraintdef(oid) like '%not-present%'
--
--   union all
--   select 'tier 1B carries the doctrine name, not the code one',
--          count(*) = 1,
--          coalesce(max(pg_get_constraintdef(oid)), 'STILL ''integrator'' — two names for one concept')
--   from pg_constraint
--   where conname = 'deal_competitors_tier_check'
--     and pg_get_constraintdef(oid) like '%tier-1b%'
--     and pg_get_constraintdef(oid) not like '%integrator%'
--
--   union all
--   select 'no row was left behind under the old name',
--          count(*) = 0,
--          case when count(*) = 0 then 'zero rows on the retired tier name'
--               else count(*)::text || ' row(s) still tiered ''integrator''' end
--   from deal_competitors where tier = 'integrator'
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
--     (v_deal, 'Packaged integrator', 'tier-1b',
--      'Bundled price hides financing cost and cannot be unbundled later',
--      (select user_id from deals limit 1));
--
--   -- 'not-present' must be accepted: it is how a default-on competitor is
--   -- switched off, and rejecting it would make the grid untoggleable.
--   insert into deal_competitors (deal_id, competitor, tier, status, user_id)
--   values (v_deal, 'CenterPoint', 'tier-1', 'not-present',
--           (select user_id from deals limit 1));
--
--   select count(*), string_agg(distinct tier, ', ' order by tier)
--     into v_count, v_tiers
--     from deal_competitors
--    where deal_id = v_deal and status = 'active';
--
--   raise notice 'ACTIVE competitors       : % (expect 3, the not-present row excluded)', v_count;
--   raise notice 'distinct tiers          : % (doctrine order: tier-1 before tier-1b)', v_tiers;
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
--   -- The RETIRED name must be refused too. A constraint that still accepted
--   -- 'integrator' would let the two names coexist, which is the thing the
--   -- rename exists to prevent.
--   begin
--     insert into deal_competitors (deal_id, competitor, tier, user_id)
--     values (v_deal, 'Old name', 'integrator', (select user_id from deals limit 1));
--     raise exception 'FAIL: the retired tier name ''integrator'' was accepted';
--   exception when check_violation then
--     raise notice 'retired tier name rejected    : correct';
--   end;
--
--   -- The status constraint was WIDENED to admit 'not-present'. Widening is
--   -- where a typo stops being caught, so the closed arm is tested too: an
--   -- underscore instead of a hyphen must be refused, not silently stored as a
--   -- status nothing reads.
--   begin
--     insert into deal_competitors (deal_id, competitor, tier, status, user_id)
--     values (v_deal, 'Typo Co', 'tier-1', 'not_present', (select user_id from deals limit 1));
--     raise exception 'FAIL: an undefined status was accepted';
--   exception when check_violation then
--     raise notice 'undefined status rejected     : correct';
--   end;
--
--   raise notice 'PASS: multi-posture, unique per competitor, tier + status constrained';
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
