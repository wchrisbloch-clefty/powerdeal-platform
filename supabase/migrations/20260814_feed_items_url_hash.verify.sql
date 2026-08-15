-- ── VERIFICATION ──
-- Every observation is gathered INSIDE the DO block, because a report that
-- names `url_hash` in its own SELECT cannot run when `url_hash` is missing —
-- and missing is the state it exists to diagnose. The first draft of this
-- query errored out on the pre-migration table instead of printing FAIL.
--
-- THE PROBE BORROWS A REAL user_id. It never invents one.
-- The first version of this file inserted
-- '00000000-0000-0000-0000-000000000001' and both behavioural checks came back
-- FAIL reading "violates foreign key constraint" — `feed_items.user_id`
-- references `auth.users(id)`. Two red rows that said nothing about url_hash,
-- on a migration that had in fact applied correctly. A probe that fails on its
-- own setup is a probe that reports on itself, and the reader cannot tell that
-- from the failure it was written to catch.
--
-- When there is no user to borrow, the behavioural checks report
-- COULD NOT RUN — not PASS and not FAIL. A check that cannot look must never
-- report clean (checklist rule 9), and it must not report broken either.
do $$
declare
  has_col    boolean;
  has_con    boolean;
  probe_user uuid;
  why_no_user text;
  n int;
begin
  drop table if exists _probe_result;
  create temp table _probe_result (check_name text, ok boolean, observed text);

  -- ── Structural ──
  select exists (select 1 from information_schema.columns
    where table_name='feed_items' and column_name='url_hash') into has_col;
  insert into _probe_result values ('url_hash column exists', has_col,
    coalesce((select data_type from information_schema.columns
      where table_name='feed_items' and column_name='url_hash'), 'absent'));

  select exists (select 1 from pg_constraint
    where conname='feed_items_user_url_key' and contype='u') into has_con;
  insert into _probe_result values ('unique (user_id, url_hash)', has_con,
    coalesce((select pg_get_constraintdef(oid) from pg_constraint
      where conname='feed_items_user_url_key'), 'absent'));

  -- ── Borrow a user_id that already satisfies the FK ──
  -- Prefer a row in the table under test; fall back to auth.users so the probe
  -- still runs on an empty feed. Both reads are guarded: on a role that cannot
  -- see auth.users this must degrade to COULD NOT RUN, not abort the block.
  begin
    select user_id into probe_user
      from feed_items where user_id is not null limit 1;
  exception when others then
    probe_user := null;
  end;

  if probe_user is null then
    begin
      select id into probe_user from auth.users limit 1;
    exception when others then
      probe_user := null;
    end;
  end if;

  if probe_user is null then
    why_no_user := 'no user_id available in feed_items or auth.users';
  end if;

  -- ── Behavioural ──
  -- Structural checks pass on a table where the upsert still fails: ON CONFLICT
  -- resolves against the constraint at runtime, and that is the call the sweep
  -- actually makes.
  if probe_user is null then
    insert into _probe_result values
      ('upsert resolves against the constraint', null, why_no_user),
      ('re-upsert updates, does not duplicate',  null, why_no_user);
  else
    -- Clear any probe row left by an interrupted earlier run, so a stale row
    -- cannot make the duplicate check fail on a schema that is correct.
    if has_col then
      execute $q$ delete from feed_items where url_hash = 'probe-key' and user_id = $1 $q$
        using probe_user;
    end if;

    begin
      execute $q$
        insert into feed_items (title, url_hash, user_id, cached_at)
        values ('probe', 'probe-key', $1, now())
        on conflict (user_id, url_hash) do update set title = 'probe-updated'
      $q$ using probe_user;
      insert into _probe_result values ('upsert resolves against the constraint', true, 'ok');
    exception when others then
      insert into _probe_result values ('upsert resolves against the constraint', false, sqlerrm);
    end;

    begin
      execute $q$
        insert into feed_items (title, url_hash, user_id, cached_at)
        values ('probe', 'probe-key', $1, now())
        on conflict (user_id, url_hash) do update set title = 'probe-updated'
      $q$ using probe_user;
      execute $q$ select count(*) from feed_items where url_hash = 'probe-key' and user_id = $1 $q$
        into n using probe_user;
      insert into _probe_result values ('re-upsert updates, does not duplicate', n = 1,
        n::text || ' row(s) for probe-key');
    exception when others then
      insert into _probe_result values ('re-upsert updates, does not duplicate', false, sqlerrm);
    end;

    if has_col then
      execute $q$ delete from feed_items where url_hash = 'probe-key' and user_id = $1 $q$
        using probe_user;
    end if;
  end if;
end $$;

select check_name as check,
       case when ok then 'PASS' when ok is false then 'FAIL' else 'COULD NOT RUN' end as result,
       left(observed, 70) as observed
  from _probe_result;
drop table if exists _probe_result;
