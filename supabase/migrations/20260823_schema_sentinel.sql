-- ═══════════════════════════════════════════════════════════════
-- "IT RAN" AND "IT RAN TO COMPLETION" WERE THE SAME OBSERVATION
-- ═══════════════════════════════════════════════════════════════
--
-- §0 of 20260822 reported ONE of the three triggers schema.sql declares. Not
-- two — one. That matters, because it rules out the tidy explanation.
--
-- ══ WHAT THE ARCHAEOLOGY SAYS, AND WHAT IT DOES NOT ══
--
--   triggers enter schema.sql        3db09a1   30 Jul
--   the real 21 deals are loaded     e22e221   30 Jul
--   the pg_cron guard is added       4f38fd3    3 Aug
--
-- The guard is FOUR DAYS YOUNGER than both. A `before insert` trigger cannot be
-- bypassed, so if `deals_health_score` had existed on 30 July those rows would
-- have been computed on the way in. They were not. The guard therefore cannot
-- be why the trigger was missing — it is why the obvious remedy, re-running
-- schema.sql, could never fix it afterwards, and why eight later commits'
-- worth of schema changes could never land either.
--
-- ⚠️ SO THE ORIGINAL CAUSE IS STILL UNIDENTIFIED, AND THIS MIGRATION DOES NOT
-- PRETEND OTHERWISE. One of three triggers is not the fingerprint of a clean
-- abort at a single statement — it is the fingerprint of a file applied in
-- PIECES, which is what pasting sections into a SQL editor produces. That is a
-- hypothesis. The inventory in §2 is how it gets tested rather than argued:
-- it reports every object schema.sql declares and whether it exists, so "how
-- far did it get" becomes a reading rather than a guess.
--
-- The sentinel catches the NEXT one. It cannot explain this one, and a comment
-- claiming it did would be the stale-comment class in a new file.
--
-- IDEMPOTENT. Safe to re-run.


-- ═══════════════════════════════════════════════════════════════
-- §1 · THE SENTINEL, FOR A DATABASE THAT ALREADY EXISTS
-- ═══════════════════════════════════════════════════════════════
--
-- Fresh instances get this from the last statement of schema.sql. This is the
-- same function, for instances that predate it.
--
-- ⚠️ RUN THIS ONLY AFTER CONFIRMING §2 REPORTS A COMPLETE INVENTORY. Creating
-- the sentinel on a half-applied database is a lie told by the mechanism built
-- to detect lies: it would report "revision 4 completed" about a database
-- missing two triggers. §2 first, then this.
create or replace function schema_applied_through()
returns integer as $$ select 4 $$ language sql immutable;

comment on function schema_applied_through is
  'The revision of supabase/schema.sql that ran to completion on this database. '
  'Created by the LAST statement in that file, so its presence means the file '
  'finished. Compared against SCHEMA_REVISION in lib/schema-revision.ts.';


-- ═══════════════════════════════════════════════════════════════
-- §2 · THE INVENTORY — HOW FAR DID schema.sql ACTUALLY GET?
-- ═══════════════════════════════════════════════════════════════
--
-- Run this FIRST, on its own, and read every row. It is the generalisation of
-- the trigger count in 20260822: rather than asking about one object, it asks
-- about every class of object schema.sql declares, so a partial application
-- reports its own shape.
--
-- ⚠️ EXPECTED COUNTS ARE WRITTEN OUT AND WILL GO STALE. That is deliberate and
-- it is the honest trade: a query that derived them from schema.sql would need
-- to parse the file it is checking, and this runs in a SQL editor with no file
-- access. tests/schema-sentinel.test.ts parses schema.sql and asserts these
-- numbers still match, so the staleness is caught in CI rather than by a
-- reader who assumed.

select 'tables'   as object_class,
       count(*)::text || ' of 15' as observed,
       case when count(*) = 15 then 'ok' else 'INCOMPLETE' end as verdict
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'deals','contacts','stage_transitions','win_loss_log','deal_competitors',
    'intelligence_log','market_watch_log','feed_items','ccus_events','prompts',
    'user_settings','app_state','learn_sessions','state_market_structure','utilities')

union all

select 'functions',
       count(*)::text || ' of 5',
       case when count(*) = 5 then 'ok' else 'INCOMPLETE' end
from pg_proc
where proname in (
  'update_updated_at','compute_health_score','deals_set_health',
  'deals_log_transition','seed_new_user')

union all

-- ⚠️ THE ROW THAT FOUND THIS. One of three is not a rounding error.
--
-- ⚠️ BY NAME, NOT BY COUNT — and the first run on a fresh database is what
-- taught that. Counting every trigger on `deals` reported "4 of 3", because
-- 20260821 adds `deals_field_history`. A count is satisfied by the wrong set
-- just as easily as the right one: three triggers of which one is unrelated
-- reads identically to the three this file declares.
select 'triggers on deals',
       count(*)::text || ' of 3 named',
       case when count(*) = 3 then 'ok' else 'INCOMPLETE — this is the one that was 1' end
from pg_trigger
where tgrelid = 'deals'::regclass
  and tgname in ('deals_updated_at', 'deals_health_score', 'deals_stage_transition')

union all

select 'triggers elsewhere',
       count(*)::text || ' of 2 named',
       case when count(*) = 2 then 'ok' else 'INCOMPLETE' end
from pg_trigger
where tgname in ('settings_updated_at', 'app_state_updated_at')

union all

-- ⚠️ NAMES THE EXTENSIONS WITHOUT REFUSING ANYTHING. This is the condition the
-- old guard aborted on. It is reported here and enforced only in
-- supabase/functions/schedule.sql, which is the file that cannot work without
-- them.
select 'pg_cron / pg_net',
       coalesce(string_agg(extname, ', ' order by extname), '(neither)'),
       case when count(*) = 2 then 'ok'
            else 'ABSENT — schedule.sql will refuse; schema.sql does not care' end
from pg_extension where extname in ('pg_cron','pg_net')

union all

select 'the sentinel itself',
       case when exists (select 1 from pg_proc where proname = 'schema_applied_through')
            then 'present' else 'ABSENT' end,
       case when exists (select 1 from pg_proc where proname = 'schema_applied_through')
            then 'ok'
            else 'schema.sql has never run to completion here' end;


-- ═══════════════════════════════════════════════════════════════
-- §3 · VERIFICATION
-- ═══════════════════════════════════════════════════════════════

select
  'the sentinel answers'                                        as check,
  coalesce((select schema_applied_through()::text), '(absent)') as observed,
  case when (select schema_applied_through()) = 4 then 'PASS' else 'FAIL' end as verdict

union all

-- ⚠️ RULE 4. The sentinel means nothing if it can report completion on an
-- incomplete database, which is exactly what §1's warning is about. This row
-- couples the two: a claim of completion while an object is missing is a FAIL,
-- not a PASS with a caveat.
select
  'and nothing it claims complete is missing',
  (select count(*)::text from pg_trigger
    where tgrelid = 'deals'::regclass
      and tgname in ('deals_updated_at','deals_health_score','deals_stage_transition'))
    || ' of the 3 schema.sql declares',
  case
    when (select count(*) from pg_trigger
           where tgrelid = 'deals'::regclass
             and tgname in ('deals_updated_at','deals_health_score','deals_stage_transition')) = 3
      then 'PASS'
    else 'FAIL — the sentinel is claiming a completion that did not happen'
  end;


-- ═══════════════════════════════════════════════════════════════
-- §4 · THE NEGATIVE TEST. Rule 4; it is SUPPOSED to report FAIL.
-- ═══════════════════════════════════════════════════════════════
--
--   begin;
--   drop function schema_applied_through();
--   -- EXPECTED: §3's first row errors or reports (absent), and
--   -- /api/health/drift reports state 'never-completed'.
--   rollback;
