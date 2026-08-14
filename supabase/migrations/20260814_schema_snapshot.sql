-- ═══════════════════════════════════════════════════════════════
-- schema_snapshot() — lets the app read its own schema.
-- ═══════════════════════════════════════════════════════════════
--
-- PostgREST cannot select from information_schema directly, so the drift check
-- needs one function to reach it. Read-only, no arguments, no dynamic SQL.
--
-- WHY THIS EXISTS: schema.sql declared feed_items.url_hash for the whole life
-- of the feed feature and the live table never had it. `create table if not
-- exists` is a no-op on an existing table. Nothing in the repo could see the
-- difference; the app can.
--
-- SHAPE NOTE: unique constraints come back as `text[]` of comma-joined column
-- lists ("user_id,url_hash"), not as a nested array. `unique` is a reserved
-- word and Postgres multidimensional arrays must be rectangular — constraints
-- are not. A flat, pre-joined signature avoids both and is what the comparison
-- comes down to anyway.
--
-- Idempotent (rule 1).

create or replace function schema_snapshot()
returns table (
  table_name         text,
  columns            text[],
  unique_constraints text[],
  indexes            text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with cols as (
    select c.table_name::text as t,
           array_agg(c.column_name::text order by c.ordinal_position) as cols
      from information_schema.columns c
     where c.table_schema = 'public'
     group by c.table_name
  ),
  uniq as (
    select rel.relname::text as t,
           array_agg(
             (select string_agg(a.attname::text, ',' order by k.ord)
                from unnest(con.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a
                  on a.attrelid = con.conrelid and a.attnum = k.attnum)
           ) as cons
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where con.contype = 'u' and ns.nspname = 'public'
     group by rel.relname
  ),
  idx as (
    select i.tablename::text as t, array_agg(i.indexname::text) as names
      from pg_indexes i
     where i.schemaname = 'public'
     group by i.tablename
  )
  select cols.t,
         cols.cols,
         coalesce(uniq.cons, '{}'::text[]),
         coalesce(idx.names, '{}'::text[])
    from cols
    left join uniq on uniq.t = cols.t
    left join idx  on idx.t  = cols.t;
$$;

-- The drift route runs as the service role. No grant to anon/authenticated:
-- a schema listing is reconnaissance, and there is no reader-facing need.
revoke all on function schema_snapshot() from public;
