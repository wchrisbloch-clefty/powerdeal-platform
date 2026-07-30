-- ═══════════════════════════════════════════════════════
-- PowerDeal Platform — Supabase Schema
-- Version: 1.0 | The live Pipeline Spine
--
-- The `deals` table replaces Pipeline-Spine.md and is the authoritative
-- deal database. Every Spine field maps 1:1 to a column here.
--
-- Run in the Supabase SQL Editor, then run seed.sql.
-- ═══════════════════════════════════════════════════════

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── DEALS (the Pipeline Spine) ──────────────────────────
create table if not exists deals (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         text not null,                 -- DC-001, DEF-001, OG-010 etc.
  company         text not null,
  vertical        text not null,                 -- Defense, O&G-Down, O&G-Mid, Industrial-Chemical, ...
  relationship_type text not null default 'Direct',  -- Direct / Channel / Partner
  geo_tier        text,                          -- Primary / Secondary / National
  state           text,
  utility         text,
  value_prop      text,                          -- Grid-fighter / Combustion-fighter / Both
  beachhead_site  text,
  stage           text not null default 'Prospecting',
  -- Stages: Prospecting, Qualified, Intro Call, Discovery, Solution Design,
  --         Economic Proposal, Negotiation, Contracting, Closed-Won, Post-Sale, Archived
  size_mw         numeric,
  size_usd_m      numeric,
  meddpicc_score  integer default 0 check (meddpicc_score between 0 and 8),
  health_score    numeric default 3 check (health_score between 1 and 10),
  multi_threaded  boolean default false,
  decision_mapped boolean default false,
  days_in_stage   integer default 0,
  next_move       text,
  next_move_date  date,
  key_risk        text,

  -- MEDDPICC breakdown
  metrics_known     boolean default false,
  economic_buyer    text,                        -- name when known, null when unknown
  decision_criteria text,
  decision_process  text,
  identified_pain   text,
  champion          text,
  competition       text,

  -- Land-and-expand tracking
  landed_site       text,
  next_target_site  text,
  expansion_mw_captured numeric default 0,
  expansion_mw_addressable numeric,

  -- Relationship / partner notes
  partner_notes     text,

  -- Metadata
  notes           text,
  artifacts       jsonb default '[]'::jsonb,     -- [{type,label,url,format,created_at}]
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade,

  -- DEVIATION FROM SPEC: the spec had `deal_id text not null unique`, which is
  -- a global uniqueness constraint. That breaks the moment a second user signs
  -- up — the seed assigns DEF-001 to everyone, so the second signup's seed
  -- would fail. Scoped per-user instead, which is what the ID actually means.
  constraint deals_user_deal_id_key unique (user_id, deal_id)
);

create index if not exists deals_user_id_idx on deals(user_id);
create index if not exists deals_stage_idx on deals(stage);
create index if not exists deals_vertical_idx on deals(vertical);
create index if not exists deals_health_idx on deals(health_score);
create index if not exists deals_state_idx on deals(state);
create index if not exists deals_utility_idx on deals(utility);

-- ── CONTACTS (schema ready, no UI yet) ───────────────────
create table if not exists contacts (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         uuid references deals(id) on delete cascade,
  full_name       text not null,
  title           text,
  email           text,
  linkedin_url    text,
  role_type       text,    -- Champion / Economic Buyer / Security Gate / Sustainability / Committee
  notes           text,
  source          text,    -- Navigator / Manual / LinkedIn / ZoomInfo
  created_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists contacts_deal_idx on contacts(deal_id);
create index if not exists contacts_user_idx on contacts(user_id);

-- ── STAGE TRANSITIONS (leading indicator) ────────────────
create table if not exists stage_transitions (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         uuid references deals(id) on delete cascade,
  deal_ref        text,                          -- human-readable deal_id (DC-001)
  from_stage      text not null,
  to_stage        text not null,
  days_in_prior   integer,
  transitioned_at timestamptz default now(),
  notes           text,
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists stage_transitions_deal_idx on stage_transitions(deal_id);
create index if not exists stage_transitions_at_idx on stage_transitions(transitioned_at desc);

-- ── WIN-LOSS LOG ──────────────────────────────────────────
create table if not exists win_loss_log (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         uuid references deals(id) on delete set null,
  company         text not null,
  outcome_type    text not null check (outcome_type in ('No-Decision','Competitive','Disqualified','Won')),
  reason          text,
  lesson          text,
  competitor_won  text,                          -- if Competitive, who/what won
  revisit_trigger text,
  closed_at       timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists win_loss_user_idx on win_loss_log(user_id);

-- ── INTELLIGENCE LOG ─────────────────────────────────────
create table if not exists intelligence_log (
  id              uuid primary key default uuid_generate_v4(),
  signal_type     text not null,
  -- pain, trigger-event, competitive, stakeholder, macro-policy, ESG, objection, win-loss
  source_name     text,
  deal_ids        uuid[] default '{}',           -- which deals this signal hits
  account_meaning text,                          -- account-level implication
  business_meaning text,                         -- business/market-level implication
  so_what         text,                          -- the action it suggests
  raw_signal      text,                          -- what was dropped in
  logged_at       timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists intelligence_log_at_idx on intelligence_log(logged_at desc);
create index if not exists intelligence_log_deals_idx on intelligence_log using gin(deal_ids);
create index if not exists intelligence_log_user_idx on intelligence_log(user_id);

-- ── MARKET WATCH LOG ─────────────────────────────────────
create table if not exists market_watch_log (
  id              uuid primary key default uuid_generate_v4(),
  category        text not null,
  -- rate-move, capacity-cap-tag, policy, customer-announcement, earnings,
  -- grid-stress, value-prop-enhancer, peer-signal, ccus
  source_name     text,
  source_tier     text default 'reported',       -- verified / reported / inferred
  headline        text not null,
  summary         text,
  url             text,
  deal_ids        uuid[] default '{}',           -- accounts this hits
  outreach_hook   text,                          -- the suggested re-engagement angle
  peers_to_add    text[] default '{}',           -- prospect names surfaced
  impact_rank     integer default 5,             -- 1-10, used for sorting
  swept_at        timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists market_watch_swept_idx on market_watch_log(swept_at desc);
create index if not exists market_watch_deals_idx on market_watch_log using gin(deal_ids);
create index if not exists market_watch_user_idx on market_watch_log(user_id);

-- ── FEED ITEMS (market intelligence + social) ────────────
create table if not exists feed_items (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  synthesis       text,                          -- AI-generated 2-sentence summary
  tier            text default 'reported',       -- verified / reported / inferred
  confidence      numeric default 0.7,           -- 0..1
  arrival         text default 'rss',            -- rss / youtube / reddit / share / manual / seed
  platform        text default 'rss',
  source_id       text,                          -- source config id
  source_name     text,
  url             text,
  url_hash        text,                          -- dedupe key: hash(canonical url)
  image_url       text,
  byline          text,
  published_at    timestamptz,
  category        text,                          -- power-markets / og / industrial / data-center / policy / ccus / defense
  vertical_tags   text[] default '{}',
  deal_ids        uuid[] default '{}',           -- auto-mapped accounts
  action          text,                          -- "what to do about it"
  action_tier     text default 'inferred',
  breaking        boolean default false,
  cached_at       timestamptz default now(),     -- 24hr cache invalidation
  user_id         uuid references auth.users(id) on delete cascade,

  -- One row per URL per reader. Makes the summarize cache a real cache:
  -- re-running a sweep upserts instead of duplicating.
  constraint feed_items_user_url_key unique (user_id, url_hash)
);
create index if not exists feed_items_published_idx on feed_items(published_at desc);
create index if not exists feed_items_category_idx on feed_items(category);
create index if not exists feed_items_cached_idx on feed_items(cached_at desc);
create index if not exists feed_items_deals_idx on feed_items using gin(deal_ids);
create index if not exists feed_items_user_idx on feed_items(user_id);

-- ── CCUS TRACKER ─────────────────────────────────────────
create table if not exists ccus_events (
  id              uuid primary key default uuid_generate_v4(),
  event_type      text not null,
  -- class-vi-permit-application, class-vi-permit-approved, class-vi-permit-denied,
  -- state-primacy-granted, state-primacy-pending, gccsi-project-update,
  -- doe-funding, iea-project-update
  project_name    text,
  state           text,
  operator        text,
  details         text,
  source_url      text,
  source_tier     text default 'verified',
  deal_ids        uuid[] default '{}',           -- related pipeline accounts
  event_date      date,
  logged_at       timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);
create index if not exists ccus_events_date_idx on ccus_events(event_date desc);
create index if not exists ccus_events_state_idx on ccus_events(state);
create index if not exists ccus_events_user_idx on ccus_events(user_id);

-- ── PROMPTS (Sprint 3 — live sync; file-based for now) ──
create table if not exists prompts (
  id              uuid primary key default uuid_generate_v4(),
  version         text not null,                 -- e.g. "3.1.8"
  module          text not null,                 -- "system", "brief", "qualify", ...
  content         text not null,                 -- the prompt text
  synced_at       timestamptz default now(),
  is_active       boolean default true,
  user_id         uuid references auth.users(id) on delete cascade
);

-- DEVIATION FROM SPEC: the spec used `unique(module, user_id, is_active)`,
-- which permits only ONE inactive row per module — so archiving a second
-- version fails. A partial index over active rows is what was intended:
-- one active prompt per module per user, unlimited history.
create unique index if not exists prompts_one_active_per_module
  on prompts(module, user_id) where is_active;

-- ── USER SETTINGS ─────────────────────────────────────────
create table if not exists user_settings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade unique,
  theme           text default 'light',          -- light / dark

  source_prefs    jsonb default '{
    "muted": [],
    "enabled": [],
    "order": [],
    "custom": []
  }'::jsonb,

  watchlist       jsonb default '{
    "accounts": [],
    "topics": ["SOFC", "ERCOT", "HGB non-attainment", "Class VI", "SDG&E", "Dominion"],
    "verticals": ["O&G", "Industrial-Chemical", "Defense", "Data Center"],
    "utilities": ["SDG&E", "Dominion", "Eversource", "CenterPoint", "Oncor", "Xcel"]
  }'::jsonb,

  display_density text default 'comfortable',    -- compact / comfortable / spacious
  default_map_layer text default 'ng-infrastructure',

  notify_market_watch boolean default true,
  notify_stall_alert boolean default true,
  notify_weekly_recap boolean default true,
  updated_at      timestamptz default now()
);

-- ── APP STATE (weekly recap, monthly review — CB Hub pattern) ──
create table if not exists app_state (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade,
  key             text not null,
  value           jsonb not null,
  updated_at      timestamptz default now(),
  unique(user_id, key)
);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — every table, every command
-- ═══════════════════════════════════════════════════════
alter table deals              enable row level security;
alter table contacts           enable row level security;
alter table stage_transitions  enable row level security;
alter table win_loss_log       enable row level security;
alter table intelligence_log   enable row level security;
alter table market_watch_log   enable row level security;
alter table feed_items         enable row level security;
alter table ccus_events        enable row level security;
alter table prompts            enable row level security;
alter table user_settings      enable row level security;
alter table app_state          enable row level security;

-- Policies are written with an explicit WITH CHECK so INSERT and UPDATE are
-- gated as tightly as SELECT — a user can never write a row owned by someone
-- else, not just fail to read one.
do $$
declare t text;
begin
  foreach t in array array[
    'deals','contacts','stage_transitions','win_loss_log','intelligence_log',
    'market_watch_log','feed_items','ccus_events','prompts','user_settings','app_state'
  ]
  loop
    execute format('drop policy if exists users_own_rows on %I', t);
    execute format($f$
      create policy users_own_rows on %I
        for all
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $f$, t);
  end loop;
end $$;

-- ── UPDATED_AT TRIGGER ────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists deals_updated_at on deals;
create trigger deals_updated_at before update on deals
  for each row execute function update_updated_at();

drop trigger if exists settings_updated_at on user_settings;
create trigger settings_updated_at before update on user_settings
  for each row execute function update_updated_at();

drop trigger if exists app_state_updated_at on app_state;
create trigger app_state_updated_at before update on app_state
  for each row execute function update_updated_at();

-- ═══════════════════════════════════════════════════════
-- HEALTH SCORE (server-side authority)
--
-- Mirrors computeHealthScore() in lib/deals.ts. The app writes through the
-- TS version for instant UI feedback; this trigger is the backstop so a
-- direct SQL edit or an edge function can't leave a stale score behind.
--
-- The single-thread cap is the point of the whole formula: a deal with one
-- contact cannot score above 6 no matter how complete the rest is.
-- ═══════════════════════════════════════════════════════
create or replace function compute_health_score(d deals)
returns numeric as $$
declare score numeric := 0;
begin
  score := score + (coalesce(d.meddpicc_score, 0)::numeric / 8) * 2.5;
  if d.multi_threaded then score := score + 2; end if;
  if d.economic_buyer is not null and d.economic_buyer <> '' then
    score := score + 1.5;
  end if;
  if coalesce(d.days_in_stage, 0) < 30 then score := score + 1.5;
  elsif coalesce(d.days_in_stage, 0) < 60 then score := score + 0.75;
  end if;
  if d.decision_mapped then score := score + 1.5; end if;
  if d.champion is not null and d.champion <> '' then score := score + 1; end if;

  score := least(10, score);
  if not d.multi_threaded then score := least(6, score); end if;
  -- The column's CHECK floor is 1.
  return greatest(1, round(score, 1));
end;
$$ language plpgsql immutable;

create or replace function deals_set_health()
returns trigger as $$
begin
  new.health_score := compute_health_score(new);
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_health_score on deals;
create trigger deals_health_score before insert or update on deals
  for each row execute function deals_set_health();

-- ═══════════════════════════════════════════════════════
-- STAGE TRANSITION LOGGING
-- Fires whenever `stage` actually changes: writes the transition row and
-- resets days_in_stage. Keeps the leading indicator honest even when the
-- stage is changed outside the app.
-- ═══════════════════════════════════════════════════════
create or replace function deals_log_transition()
returns trigger as $$
begin
  if new.stage is distinct from old.stage then
    insert into stage_transitions
      (deal_id, deal_ref, from_stage, to_stage, days_in_prior, user_id)
    values
      (new.id, new.deal_id, old.stage, new.stage, old.days_in_stage, new.user_id);
    new.days_in_stage := 0;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_stage_transition on deals;
create trigger deals_stage_transition before update on deals
  for each row execute function deals_log_transition();

-- ═══════════════════════════════════════════════════════
-- FIRST-LOGIN SEED
--
-- Copies the template pipeline (rows with user_id is null, loaded by
-- seed.sql) into a new user's account and creates their settings row.
-- Called by the app on first login; safe to call repeatedly.
-- ═══════════════════════════════════════════════════════
create or replace function seed_new_user()
returns integer as $$
declare inserted integer;
begin
  insert into user_settings (user_id) values (auth.uid())
    on conflict (user_id) do nothing;

  insert into deals (
    deal_id, company, vertical, relationship_type, geo_tier, state, utility,
    value_prop, beachhead_site, stage, size_mw, size_usd_m, meddpicc_score,
    multi_threaded, decision_mapped, days_in_stage, next_move, key_risk,
    metrics_known, economic_buyer, decision_criteria, decision_process,
    identified_pain, champion, competition, landed_site, next_target_site,
    expansion_mw_captured, expansion_mw_addressable, partner_notes, notes, user_id
  )
  select
    t.deal_id, t.company, t.vertical, t.relationship_type, t.geo_tier, t.state,
    t.utility, t.value_prop, t.beachhead_site, t.stage, t.size_mw, t.size_usd_m,
    t.meddpicc_score, t.multi_threaded, t.decision_mapped, t.days_in_stage,
    t.next_move, t.key_risk, t.metrics_known, t.economic_buyer,
    t.decision_criteria, t.decision_process, t.identified_pain, t.champion,
    t.competition, t.landed_site, t.next_target_site, t.expansion_mw_captured,
    t.expansion_mw_addressable, t.partner_notes, t.notes, auth.uid()
  from deals t
  where t.user_id is null
  on conflict (user_id, deal_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function seed_new_user() to authenticated;
