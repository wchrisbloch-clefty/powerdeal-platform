-- ── VERIFICATION ──
-- Every observation is gathered INSIDE the DO block, because a report that
-- names `url_hash` in its own SELECT cannot run when `url_hash` is missing —
-- and missing is the state it exists to diagnose. The first draft of this
-- query errored out on the pre-migration table instead of printing FAIL.
do $$
declare
  has_col boolean;
  has_con boolean;
  n int;
begin
  drop table if exists _probe_result;
  create temp table _probe_result (check_name text, ok boolean, observed text);

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

  -- BEHAVIOURAL. Structural checks pass on a table where the upsert still
  -- fails: ON CONFLICT resolves against the constraint at runtime, and that is
  -- the call the sweep actually makes.
  begin
    execute $q$
      insert into feed_items (title, url_hash, user_id, cached_at)
      values ('probe', 'probe-key', '00000000-0000-0000-0000-000000000001', now())
      on conflict (user_id, url_hash) do update set title = 'probe-updated'
    $q$;
    insert into _probe_result values ('upsert resolves against the constraint', true, 'ok');
  exception when others then
    insert into _probe_result values ('upsert resolves against the constraint', false, sqlerrm);
  end;

  begin
    execute $q$
      insert into feed_items (title, url_hash, user_id, cached_at)
      values ('probe', 'probe-key', '00000000-0000-0000-0000-000000000001', now())
      on conflict (user_id, url_hash) do update set title = 'probe-updated'
    $q$;
    execute $q$ select count(*) from feed_items where url_hash = 'probe-key' $q$ into n;
    insert into _probe_result values ('re-upsert updates, does not duplicate', n = 1,
      n::text || ' row(s) for probe-key');
  exception when others then
    insert into _probe_result values ('re-upsert updates, does not duplicate', false, sqlerrm);
  end;

  if has_col then
    execute $q$ delete from feed_items where url_hash = 'probe-key' $q$;
  end if;
end $$;

select check_name as check,
       case when ok then 'PASS' else 'FAIL' end as result,
       left(observed, 70) as observed
  from _probe_result;
drop table if exists _probe_result;
