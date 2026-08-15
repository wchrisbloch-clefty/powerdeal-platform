-- ═══════════════════════════════════════════════════════════════
-- CLOSING THE DRIFT /api/schema/drift FOUND ON ITS FIRST RUN
-- ═══════════════════════════════════════════════════════════════
--
-- The route reported ok:false, 14 tables checked, 7 blocking, 24 notices.
-- Three of the blocking findings (deals.beachhead_utility, utilities,
-- state_market_structure) are the utility-structure migration, applied
-- separately. This migration closes the other four and every declared-and-
-- absent index.
--
-- ⚠️ ALL FOUR HAVE THE SAME CAUSE, AND IT IS THE THIRD TIME THIS WEEK.
-- `create table if not exists` IS A NO-OP ON AN EXISTING TABLE. Every column
-- added to schema.sql after `deals` and `prompts` were first created was
-- declared and never applied. The file and the database have disagreed for as
-- long as those columns have existed, and nothing in the repo could see it —
-- the suite compares code against schema.sql, and those two agreed.
--
-- This is the first instance caught by tooling rather than by a production
-- failure. The previous two were found by a feature being broken.
--
-- IDEMPOTENT. Every statement is `if not exists`. Safe to re-run, and safe on
-- an instance where some of it already applied.
--
-- ⚠️ IT DOES NOT DROP OR RECREATE ANYTHING. There are 21 real deals in this
-- database. Nothing here touches a row.

-- ── 1. deals: three MEDDPICC / partner columns ──
-- Defaults match schema.sql exactly. `metrics_known` defaults FALSE rather
-- than NULL, so existing rows get the same value a new row would — a NULL
-- there would read as "unknown" in a boolean field the scorer treats as a gap.
alter table deals add column if not exists metrics_known     boolean default false;
alter table deals add column if not exists decision_criteria text;
alter table deals add column if not exists partner_notes     text;

-- Backfill the boolean so no row is left NULL on a column declared with a
-- default. `add column ... default` fills existing rows in PG11+, but this is
-- explicit and costs nothing on 21 rows.
update deals set metrics_known = false where metrics_known is null;

-- ── 2. prompts: the whole table ──
-- Verbatim from schema.sql. Kept in sync by the drift check itself from now on.
create table if not exists prompts (
  id              uuid primary key default uuid_generate_v4(),
  version         text not null,
  module          text not null,
  content         text not null,
  synced_at       timestamptz default now(),
  is_active       boolean default true,
  user_id         uuid references auth.users(id) on delete cascade
);

create unique index if not exists prompts_one_active_per_module
  on prompts(module, user_id) where is_active;

-- RLS, matching every other table. A new table without it is readable by any
-- authenticated user — and `prompts` holds the system prompt.
alter table prompts enable row level security;
drop policy if exists users_own_rows on prompts;
create policy users_own_rows on prompts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 3. Every index schema.sql declares ──
-- Copied verbatim from the file rather than retyped, so this cannot drift from
-- the thing it exists to reconcile. `if not exists` makes the ones already
-- present a no-op.
create index if not exists deals_user_id_idx on deals(user_id);
create index if not exists deals_stage_idx on deals(stage);
create index if not exists deals_vertical_idx on deals(vertical);
create index if not exists deals_health_idx on deals(health_score);
create index if not exists deals_state_idx on deals(state);
create index if not exists deals_utility_idx on deals(utility);
create index if not exists contacts_deal_idx on contacts(deal_id);
create index if not exists contacts_user_idx on contacts(user_id);
create index if not exists stage_transitions_deal_idx on stage_transitions(deal_id);
create index if not exists stage_transitions_at_idx on stage_transitions(transitioned_at desc);
create index if not exists win_loss_user_idx on win_loss_log(user_id);
create index if not exists win_loss_deal_idx on win_loss_log(deal_id);
create index if not exists win_loss_outcome_idx on win_loss_log(outcome_type);
create index if not exists deal_competitors_deal_idx on deal_competitors(deal_id);
create index if not exists deal_competitors_tier_idx on deal_competitors(tier);
create index if not exists deal_competitors_user_idx on deal_competitors(user_id);
create index if not exists intelligence_log_at_idx on intelligence_log(logged_at desc);
create index if not exists intelligence_log_deals_idx on intelligence_log using gin(deal_ids);
create index if not exists intelligence_log_user_idx on intelligence_log(user_id);
create index if not exists market_watch_swept_idx on market_watch_log(swept_at desc);
create index if not exists market_watch_deals_idx on market_watch_log using gin(deal_ids);
create index if not exists market_watch_user_idx on market_watch_log(user_id);
create index if not exists feed_items_published_idx on feed_items(published_at desc);
create index if not exists feed_items_category_idx on feed_items(category);
create index if not exists feed_items_cached_idx on feed_items(cached_at desc);
create index if not exists feed_items_deals_idx on feed_items using gin(deal_ids);
create index if not exists feed_items_user_idx on feed_items(user_id);
create index if not exists ccus_events_date_idx on ccus_events(event_date desc);
create index if not exists ccus_events_state_idx on ccus_events(state);
create index if not exists ccus_events_user_idx on ccus_events(user_id);


-- Deferred deliberately: the `utilities` and `state_market_structure` indexes
-- belong to the utility-structure migration. Creating an index on a table this
-- migration does not create would fail the whole script if the two are applied
-- in the wrong order, and an ordering dependency between two migrations is a
-- dependency somebody will get wrong at 11pm.
