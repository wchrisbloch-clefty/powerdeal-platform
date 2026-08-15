-- ── VERIFICATION ──
-- Same shape as the other probes: every observation inside a DO block, a real
-- user_id borrowed rather than invented, and COULD NOT RUN when there is none.
do $$
declare
  probe_user uuid;
  why_no_user text;
  n int;
  numeric_cols text[];
begin
  drop table if exists _probe_result;
  create temp table _probe_result (check_name text, ok boolean, observed text);

  insert into _probe_result values (
    'learn_sessions table exists',
    to_regclass('public.learn_sessions') is not null,
    coalesce(to_regclass('public.learn_sessions')::text, 'absent'));

  insert into _probe_result values (
    'every column is present',
    not exists (
      select 1 from unnest(array['id','mode','opener','turns','created_at','updated_at','user_id']) c
       where not exists (select 1 from information_schema.columns
         where table_name='learn_sessions' and column_name=c)),
    coalesce((select count(*)::text || ' columns' from information_schema.columns
      where table_name='learn_sessions'), 'table absent'));

  -- ⚠️ THE ABSENCE OF A NUMERIC COLUMN IS THE DESIGN, NOT AN OVERSIGHT.
  -- No score, no streak, no level, no mastery rating. A scored practice
  -- surface stops being a practice surface — people practise what they score
  -- well on, and the one thing this tab must survive is somebody opening it to
  -- work on the argument they are worst at. The table has nowhere to put one.
  select array_agg(column_name::text)
    into numeric_cols
    from information_schema.columns
   where table_name = 'learn_sessions'
     and data_type in ('numeric','integer','bigint','smallint','real','double precision');

  -- ⚠️ VACUOUS-PASS GUARD. The first version of this check reported PASS on a
  -- table that did not exist — "no numeric columns" is trivially true of no
  -- columns at all. A check that can only pass is not a check, and this one
  -- was green in exactly the state it exists to be red in.
  insert into _probe_result values (
    'NO numeric column — nowhere to put a score',
    case when to_regclass('public.learn_sessions') is null then null
         else numeric_cols is null end,
    case when to_regclass('public.learn_sessions') is null
           then 'table absent — nothing to inspect, which is NOT the same as clean'
         else coalesce('⚠️ found: ' || array_to_string(numeric_cols, ', '), 'none, as designed')
    end);

  insert into _probe_result values (
    'RLS is enabled',
    coalesce((select relrowsecurity from pg_class
      where oid = to_regclass('public.learn_sessions')), false),
    case when to_regclass('public.learn_sessions') is null then 'table absent'
         when (select relrowsecurity from pg_class
                where oid = to_regclass('public.learn_sessions')) then 'enabled'
         else '⚠️ DISABLED — every authenticated user can read every session' end);

  insert into _probe_result values (
    'users_own_rows policy is present',
    exists (select 1 from pg_policies
      where tablename='learn_sessions' and policyname='users_own_rows'),
    coalesce((select cmd || ' / ' || coalesce(qual,'no using clause') from pg_policies
      where tablename='learn_sessions' and policyname='users_own_rows'), 'absent'));

  insert into _probe_result values (
    'all three indexes exist',
    not exists (
      select 1 from unnest(array['learn_sessions_user_idx','learn_sessions_updated_idx',
                                 'learn_sessions_mode_idx']) i
       where not exists (select 1 from pg_indexes where indexname = i)),
    (select count(*)::text || ' of 3' from pg_indexes
      where indexname in ('learn_sessions_user_idx','learn_sessions_updated_idx',
                          'learn_sessions_mode_idx')));

  -- ── Borrow a user ──
  begin
    select id into probe_user from auth.users limit 1;
  exception when others then probe_user := null;
  end;
  if probe_user is null then why_no_user := 'no user_id available in auth.users'; end if;

  -- ── Behavioural ──
  if probe_user is null then
    insert into _probe_result values ('a session round-trips with its turns', null, why_no_user);
  else
    begin
      execute $q$ delete from learn_sessions where opener = 'probe-opener' and user_id = $1 $q$
        using probe_user;
      execute $q$
        insert into learn_sessions (mode, opener, turns, user_id)
        values ('drill', 'probe-opener',
                '[{"role":"user","text":"q","at":"2026-08-15T00:00:00Z"}]'::jsonb, $1)
      $q$ using probe_user;
      -- The jsonb has to come back as jsonb, not as a string. A turns column
      -- that round-trips as text renders the whole conversation as one blob.
      execute $q$ select jsonb_array_length(turns) from learn_sessions
                   where opener = 'probe-opener' and user_id = $1 $q$ into n using probe_user;
      execute $q$ delete from learn_sessions where opener = 'probe-opener' and user_id = $1 $q$
        using probe_user;
      insert into _probe_result values ('a session round-trips with its turns', n = 1,
        n::text || ' turn(s) read back');
    exception when others then
      insert into _probe_result values ('a session round-trips with its turns', false, sqlerrm);
    end;
  end if;
end $$;

select check_name as check,
       case when ok then 'PASS' when ok is false then 'FAIL' else 'COULD NOT RUN' end as result,
       left(observed, 70) as observed
  from _probe_result;
drop table if exists _probe_result;
