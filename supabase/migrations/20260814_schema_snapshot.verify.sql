-- ── VERIFICATION ──
-- Same shape as the url_hash probe and for the same reason: every observation
-- is gathered inside a DO block, because a report that calls schema_snapshot()
-- in its own SELECT cannot run when the function is absent — and absent is the
-- first state it exists to diagnose.
--
-- NO FABRICATED IDENTIFIERS HERE. This block reads and never writes, so it
-- carries none of the foreign-key defect that made the url_hash probe report
-- FAIL on its own setup. Recorded explicitly rather than left to inference:
-- "the other file had a bug, this one was checked for it" is the note that
-- stops the next reader re-deriving it.
do $$
declare
  has_fn  boolean;
  n       int;
  cols    text[];
  cons    text[];
begin
  drop table if exists _probe_result;
  create temp table _probe_result (check_name text, ok boolean, observed text);

  select exists (
    select 1 from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where p.proname = 'schema_snapshot' and ns.nspname = 'public'
  ) into has_fn;
  insert into _probe_result values ('schema_snapshot() exists', has_fn,
    coalesce((select pg_get_function_identity_arguments(p.oid)::text || ' → set'
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where p.proname = 'schema_snapshot' and ns.nspname = 'public' limit 1),
      'absent'));

  if not has_fn then
    insert into _probe_result values
      ('returns at least one table',              null, 'function absent'),
      ('feed_items reports url_hash',             null, 'function absent'),
      ('feed_items reports the unique signature', null, 'function absent');
  else
    begin
      execute $q$ select count(*) from schema_snapshot() $q$ into n;
      insert into _probe_result values ('returns at least one table', n > 0,
        n::text || ' table(s)');
    exception when others then
      insert into _probe_result values ('returns at least one table', false, sqlerrm);
    end;

    begin
      execute $q$ select columns, unique_constraints from schema_snapshot()
                   where table_name = 'feed_items' $q$ into cols, cons;
      insert into _probe_result values ('feed_items reports url_hash',
        cols @> array['url_hash'],
        coalesce(array_length(cols, 1)::text || ' columns', 'feed_items not returned'));
      insert into _probe_result values ('feed_items reports the unique signature',
        cons @> array['user_id,url_hash'],
        coalesce(array_to_string(cons, ' | '), 'none'));
    exception when others then
      insert into _probe_result values
        ('feed_items reports url_hash',             false, sqlerrm),
        ('feed_items reports the unique signature', false, sqlerrm);
    end;
  end if;
end $$;

select check_name as check,
       case when ok then 'PASS' when ok is false then 'FAIL' else 'COULD NOT RUN' end as result,
       left(observed, 70) as observed
  from _probe_result;
drop table if exists _probe_result;
