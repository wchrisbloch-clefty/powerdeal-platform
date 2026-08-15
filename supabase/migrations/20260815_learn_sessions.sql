-- ═══════════════════════════════════════════════════════════════
-- LEARN SESSIONS — resume-only persistence.
-- ═══════════════════════════════════════════════════════════════
--
-- A session is stored for exactly one reason: so it can be picked back up.
--
-- ⚠️ THERE IS NO NUMERIC COLUMN, AND THAT IS THE DESIGN.
-- No score, no percentage correct, no streak, no level, no mastery rating, no
-- proficiency metric, no confidence value. Not now and not later.
--
-- The reason is not squeamishness about measurement. A scored practice surface
-- stops being a practice surface — people practise what they score well on,
-- and the one thing this tab has to survive is somebody opening it to work on
-- the argument they are worst at. A number on the screen is enough to stop
-- that. The table therefore has nowhere to put one, which is a structural
-- guarantee rather than a policy somebody has to remember.
--
-- IDEMPOTENT. Safe to re-run.
--
-- ⚠️ THIS ADDS A TABLE. It drops nothing and touches no existing row.

create table if not exists learn_sessions (
  id              uuid primary key default uuid_generate_v4(),
  mode            text not null,
  opener          text not null,
  -- [{role, text, at}] — the whole conversation. jsonb rather than a turns
  -- table: a session is read and written whole, always, and a join to
  -- reconstruct it would buy nothing.
  turns           jsonb not null default '[]'::jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);

-- `create table if not exists` IS A NO-OP ON AN EXISTING TABLE. Three columns
-- and a whole table have now been declared-and-never-applied in this project
-- because of it, so every column above is also asserted individually here.
-- These are no-ops on a fresh create and the fix on a table that predates a
-- column.
alter table learn_sessions add column if not exists mode       text;
alter table learn_sessions add column if not exists opener     text;
alter table learn_sessions add column if not exists turns      jsonb default '[]'::jsonb;
alter table learn_sessions add column if not exists created_at timestamptz default now();
alter table learn_sessions add column if not exists updated_at timestamptz default now();
alter table learn_sessions add column if not exists user_id    uuid references auth.users(id) on delete cascade;

create index if not exists learn_sessions_user_idx    on learn_sessions(user_id);
create index if not exists learn_sessions_updated_idx on learn_sessions(updated_at desc);
create index if not exists learn_sessions_mode_idx    on learn_sessions(mode);

-- RLS, matching every other table. A new table without it is readable by any
-- authenticated user, and the failure errors nowhere.
alter table learn_sessions enable row level security;
drop policy if exists users_own_rows on learn_sessions;
create policy users_own_rows on learn_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at is maintained by the application, which sends it with every
-- write, so no trigger is attached. A trigger would silently overwrite the
-- timestamp the session object carries and make the resume list disagree with
-- the session it opens.
