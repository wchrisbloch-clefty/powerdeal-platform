-- ── VERIFICATION ──
-- Same shape as the url_hash and schema_snapshot probes, and for the same
-- reasons: every observation is gathered INSIDE a DO block, because a report
-- that names `metrics_known` in its own SELECT cannot run on the table that
-- lacks it — and lacking it is the state this exists to diagnose.
--
-- The behavioural probe BORROWS A REAL user_id and never invents one.
-- `deals.user_id` and `prompts.user_id` both reference `auth.users(id)`; the
-- first version of the url_hash probe fabricated a UUID and returned two FAILs
-- that said nothing about the migration. When there is no user to borrow, the
-- behavioural checks report COULD NOT RUN — not PASS, which would be a check
-- reporting clean without looking, and not FAIL, which would blame the
-- migration.
do $$
declare
  probe_user uuid;
  why_no_user text;
  n int;
  missing text[];
begin
  drop table if exists _probe_result;
  create temp table _probe_result (check_name text, ok boolean, observed text);

  -- ── Structural: the three deals columns ──
  select array_agg(c)
    into missing
    from unnest(array['metrics_known','decision_criteria','partner_notes']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_name = 'deals' and column_name = c
   );

  insert into _probe_result values (
    'deals has metrics_known, decision_criteria, partner_notes',
    missing is null,
    coalesce('absent: ' || array_to_string(missing, ', '), 'all three present'));

  -- The DEFAULT matters, not just the column. A `metrics_known` that exists
  -- with no default lets a new row arrive NULL, which the MEDDPICC scorer
  -- reads as a gap on a deal nobody has assessed either way.
  insert into _probe_result values (
    'metrics_known defaults to false',
    coalesce((select column_default from information_schema.columns
       where table_name='deals' and column_name='metrics_known'), '') like 'false%',
    coalesce((select column_default from information_schema.columns
       where table_name='deals' and column_name='metrics_known'), 'column absent'));

  -- And no existing row was left NULL by the add.
  begin
    execute $q$ select count(*) from deals where metrics_known is null $q$ into n;
    insert into _probe_result values ('no deal row has a NULL metrics_known', n = 0,
      n::text || ' NULL row(s)');
  exception when others then
    insert into _probe_result values ('no deal row has a NULL metrics_known', false, sqlerrm);
  end;

  -- ── Structural: the prompts table ──
  insert into _probe_result values (
    'prompts table exists',
    to_regclass('public.prompts') is not null,
    coalesce(to_regclass('public.prompts')::text, 'absent'));

  insert into _probe_result values (
    'prompts_one_active_per_module index exists',
    exists (select 1 from pg_indexes
      where tablename = 'prompts' and indexname = 'prompts_one_active_per_module'),
    coalesce((select indexdef from pg_indexes
      where indexname = 'prompts_one_active_per_module'), 'absent'));

  -- ⚠️ RLS ON A NEW TABLE IS NOT OPTIONAL. `prompts` holds the system prompt.
  -- A table created without it is readable by any authenticated user, and the
  -- failure is invisible — nothing errors, the rows are simply not protected.
  insert into _probe_result values (
    'prompts has RLS enabled',
    coalesce((select relrowsecurity from pg_class
      where oid = to_regclass('public.prompts')), false),
    case when to_regclass('public.prompts') is null then 'table absent'
         when (select relrowsecurity from pg_class
                where oid = to_regclass('public.prompts')) then 'enabled'
         else '⚠️ DISABLED — every authenticated user can read every row' end);

  insert into _probe_result values (
    'prompts carries the users_own_rows policy',
    exists (select 1 from pg_policies
      where tablename = 'prompts' and policyname = 'users_own_rows'),
    coalesce((select cmd || ' / ' || coalesce(qual, 'no using clause')
      from pg_policies where tablename='prompts' and policyname='users_own_rows'),
      'absent'));

  -- ── Structural: the indexes ──
  -- Counted rather than listed. Thirty-two names is a wall; the number that
  -- should be zero is the finding.
  select array_agg(i)
    into missing
    from unnest(array[
      'deals_user_id_idx','deals_stage_idx','deals_vertical_idx','deals_health_idx',
      'deals_state_idx','deals_utility_idx','contacts_deal_idx','contacts_user_idx',
      'stage_transitions_deal_idx','stage_transitions_at_idx','win_loss_user_idx',
      'win_loss_deal_idx','win_loss_outcome_idx','deal_competitors_deal_idx',
      'deal_competitors_tier_idx','deal_competitors_user_idx','intelligence_log_at_idx',
      'intelligence_log_deals_idx','intelligence_log_user_idx','market_watch_swept_idx',
      'market_watch_deals_idx','market_watch_user_idx','feed_items_published_idx',
      'feed_items_category_idx','feed_items_cached_idx','feed_items_deals_idx',
      'feed_items_user_idx','ccus_events_date_idx','ccus_events_state_idx',
      'ccus_events_user_idx'
    ]) as i
   where not exists (select 1 from pg_indexes where indexname = i);

  insert into _probe_result values (
    'every declared index exists',
    missing is null,
    coalesce(array_length(missing, 1)::text || ' missing: ' ||
             left(array_to_string(missing, ', '), 50), 'all present'));

  -- ── Borrow a user for the behavioural probes ──
  begin
    select user_id into probe_user from deals where user_id is not null limit 1;
  exception when others then probe_user := null;
  end;

  if probe_user is null then
    begin
      select id into probe_user from auth.users limit 1;
    exception when others then probe_user := null;
    end;
  end if;

  if probe_user is null then
    why_no_user := 'no user_id available in deals or auth.users';
  end if;

  -- ── Behavioural ──
  -- Structural checks pass on a table the app still cannot write. These make
  -- the calls the app actually makes.
  if probe_user is null then
    insert into _probe_result values
      ('a deal accepts the three new columns', null, why_no_user),
      ('prompts accepts a row and enforces one-active-per-module', null, why_no_user);
  else
    begin
      execute $q$ delete from deals where deal_id = 'PROBE-000' and user_id = $1 $q$
        using probe_user;
      execute $q$
        insert into deals (deal_id, company, vertical, stage, user_id,
                           metrics_known, decision_criteria, partner_notes)
        values ('PROBE-000', 'probe', 'Other', 'Prospecting', $1,
                true, 'probe criteria', 'probe notes')
      $q$ using probe_user;
      execute $q$ delete from deals where deal_id = 'PROBE-000' and user_id = $1 $q$
        using probe_user;
      insert into _probe_result values ('a deal accepts the three new columns', true, 'ok');
    exception when others then
      insert into _probe_result values ('a deal accepts the three new columns', false, sqlerrm);
    end;

    begin
      execute $q$ delete from prompts where module = 'probe' and user_id = $1 $q$
        using probe_user;
      execute $q$
        insert into prompts (version, module, content, user_id, is_active)
        values ('0.0.0-probe', 'probe', 'probe', $1, true)
      $q$ using probe_user;

      -- The partial unique index is the point of the table. A second ACTIVE
      -- row for the same module must be refused; an inactive one must not be.
      begin
        execute $q$
          insert into prompts (version, module, content, user_id, is_active)
          values ('0.0.1-probe', 'probe', 'probe', $1, true)
        $q$ using probe_user;
        insert into _probe_result values (
          'prompts accepts a row and enforces one-active-per-module', false,
          '⚠️ a SECOND active row for the same module was accepted');
      exception when unique_violation then
        execute $q$
          insert into prompts (version, module, content, user_id, is_active)
          values ('0.0.1-probe', 'probe', 'probe', $1, false)
        $q$ using probe_user;
        execute $q$ select count(*) from prompts where module='probe' and user_id=$1 $q$
          into n using probe_user;
        insert into _probe_result values (
          'prompts accepts a row and enforces one-active-per-module', n = 2,
          n::text || ' row(s): one active, one not');
      end;

      execute $q$ delete from prompts where module = 'probe' and user_id = $1 $q$
        using probe_user;
    exception when others then
      insert into _probe_result values (
        'prompts accepts a row and enforces one-active-per-module', false, sqlerrm);
    end;
  end if;
end $$;

select check_name as check,
       case when ok then 'PASS' when ok is false then 'FAIL' else 'COULD NOT RUN' end as result,
       left(observed, 70) as observed
  from _probe_result;
drop table if exists _probe_result;
