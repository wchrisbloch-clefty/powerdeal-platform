-- ═══════════════════════════════════════════════════════════════
-- DID THE THREE EDGE FUNCTIONS ACTUALLY DO ANYTHING?
-- ═══════════════════════════════════════════════════════════════
--
-- Read-only. Nothing here writes, schedules, or unschedules.
--
-- ══ WHY THIS EXISTS SEPARATELY FROM diagnose-cron.sql ══
--
-- diagnose-cron.sql answers "why did a job not run". This answers the harder
-- question: the jobs ARE running, they report healthy, and that report is not
-- evidence of anything.
--
-- `net.http_post` is asynchronous. It queues a request, returns a bigint
-- immediately, and pg_cron records THAT statement as succeeded. The job goes
-- green whether the function answered 200, answered 500, or never answered.
-- "The statement ran" has never been evidence that anything on the other end
-- did.
--
-- ══ AND THERE IS A SECOND KEY IN PLAY ══
--
-- The app's SUPABASE_SERVICE_ROLE_KEY was migrated to an `sb_secret_` key.
-- These three functions did NOT move with it: inside the Supabase runtime,
-- `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` returns a value the PLATFORM
-- injects — its own legacy JWT — which no deployment setting on the app side
-- can change. So the app reading cleanly says nothing about them.
--
-- ══ FOUR LAYERS, EACH ANSWERING A DIFFERENT QUESTION ══
--
--   §1  did pg_cron fire?              cron.job_run_details
--   §2  did the function answer, and with what?   net._http_response
--   §3  did the function record its own run?      app_state 'agents:runs'
--   §4  did the data actually change?             the tables themselves
--
-- ⚠️ §4 IS THE ONLY ONE THAT CANNOT BE FAKED BY A HEALTHY-LOOKING FAILURE.
-- A function whose database client is refused can still return 200 if it
-- swallows the error — which is exactly what stall-alert did until the
-- days_in_stage tick was made to throw. Read §4 first if you are short of
-- time; the other three explain it.

-- ── §1. Did pg_cron fire the statement, and when? ──
-- A missing row means the JOB did not run. It says nothing about the HTTP call.
select
  j.jobname,
  r.status,
  r.start_time,
  r.end_time,
  left(coalesce(r.return_message, ''), 60) as return_message
from cron.job_run_details r
join cron.job j using (jobid)
where j.jobname in ('market-watch-friday', 'stall-alert-daily', 'ccus-sweep-daily')
order by r.start_time desc
limit 20;


-- ── §2. What did the function actually SAY? ──
-- This is the table that carries the HTTP result. A 401 here means the
-- gateway or the function's own auth rejected the call; a 500 means the
-- function threw — which, after the error-handling fixes, is what a refused
-- database client now produces instead of a cheerful 200.
--
-- ⚠️ net._http_response IS PRUNED. Supabase clears it periodically (commonly
-- after ~6 hours), so an empty result here is NOT evidence of no calls — it is
-- evidence of no RECENT calls. Do not read absence as a finding.
select
  id                                        as request_id,
  status_code,
  case
    when status_code is null      then '⚠️ never answered — timeout or unreachable'
    when status_code = 200        then 'answered ok'
    when status_code = 401        then '⚠️ REJECTED — x-cron-secret mismatch, or JWT verification is ON'
    when status_code between 500 and 599
      then '⚠️ FUNCTION THREW — read the body; a refused database client lands here'
    else '⚠️ unexpected'
  end                                       as verdict,
  left(coalesce(content, ''), 300)          as body,
  created
from net._http_response
order by created desc
limit 20;


-- ── §3. What does each function say about ITSELF? ──
-- The health surface both runtimes write to. lastSuccessAt moving forward is
-- the function's own claim; §4 is the check on that claim.
select
  key,
  jsonb_pretty(value) as agent_runs
from app_state
where key = 'agents:runs'
order by updated_at desc
limit 1;


-- ═══════════════════════════════════════════════════════════════
-- §4. DID THE DATA MOVE? The only layer a silent failure cannot fake.
-- ═══════════════════════════════════════════════════════════════

-- ── §4a. stall-alert: is days_in_stage still advancing? ──
--
-- ⚠️ THE SHARPEST TEST IN THIS FILE. stall-alert's whole first job is to
-- increment this column on every in-flight deal, once a day. If the tick has
-- stopped, health scores stop degrading and every stalled deal keeps looking
-- healthy — and until the fix, the function returned 200 while that happened.
--
-- ⚠️ THE FIRST VERSION OF THIS QUERY REPORTED "advancing" ON A FIXTURE WHERE
-- ONE OF TWO DEALS HAD NEVER TICKED. It compared max(days_in_stage) against
-- the aggregate, and a max is exactly the wrong statistic here: one healthy
-- deal hides every stuck one behind it. Caught by running it against a real
-- PostgreSQL with a deliberately mixed fixture, which is the only reason it is
-- not still wrong.
--
-- Counted PER DEAL instead. The signal is a deal older than a day that still
-- sits at zero: the tick runs daily over every in-flight deal, so a row that
-- has existed through a scheduled run and never moved was never written to.
--
-- `updated_at` is the ceiling for the plausible reading — a deal whose stage
-- changed yesterday legitimately restarts near zero, so age alone would flag
-- normal movement.
select
  count(*)                                                      as in_flight_deals,
  count(*) filter (
    where days_in_stage = 0
      and created_at < now() - interval '36 hours'
      and updated_at < now() - interval '36 hours'
  )                                                             as never_ticked,
  min(days_in_stage)                                            as min_days,
  max(days_in_stage)                                            as max_days,
  round(avg(days_in_stage), 1)                                  as avg_days,
  case
    when count(*) = 0
      then 'no in-flight deals — nothing for this job to do'
    when count(*) filter (
      where days_in_stage = 0
        and created_at < now() - interval '36 hours'
        and updated_at < now() - interval '36 hours'
    ) > 0
      then '⚠️ SOME DEALS HAVE NEVER TICKED — see never_ticked; the write is not landing on them'
    when max(days_in_stage) = 0
      then '⚠️ NOTHING HAS EVER TICKED — the job has never landed a write'
    else 'advancing'
  end                                                           as verdict
from deals
where user_id is not null
  and stage not in ('Closed-Won', 'Post-Sale', 'Archived');

-- ── §4b. ccus-sweep: is anything landing, and is it landing TWICE? ──
--
-- Two findings in one query. An empty table after a deployed daily sweep is
-- one failure; duplicate source_urls are the other, and they are what the
-- dedupe read produces when it is refused and its error ignored — every row in
-- the overlapping 48h window written again on every run.
select
  count(*)                                        as events,
  count(distinct source_url)                      as distinct_urls,
  count(*) - count(distinct source_url)           as duplicates,
  max(created_at)                                 as newest,
  case
    when count(*) = 0             then '⚠️ EMPTY — the sweep has never written'
    when count(*) > count(distinct source_url)
                                  then '⚠️ DUPLICATES — the dedupe read is failing silently'
    when max(created_at) < now() - interval '3 days'
                                  then '⚠️ STALE — nothing new in 3 days on a daily job'
    else 'writing'
  end                                             as verdict
from ccus_events;

-- ── §4c. market-watch: did the Friday sweep persist? ──
-- Weekly, so the staleness threshold is 8 days rather than 3.
select
  count(*)                                        as entries,
  max(swept_at)                                   as newest,
  case
    when count(*) = 0            then '⚠️ EMPTY — the sweep has never written'
    when max(swept_at) < now() - interval '8 days'
                                 then '⚠️ STALE — nothing new in 8 days on a weekly job'
    else 'writing'
  end                                             as verdict
from market_watch_log;


-- ═══════════════════════════════════════════════════════════════
-- §5. FIRE ONE BY HAND AND WATCH IT ANSWER
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ THE PROBLEM WITH DOING THIS IN SQL IS THE PROBLEM THIS FILE IS ABOUT:
-- net.http_post is asynchronous here too, so the statement below returns a
-- request_id and tells you nothing. You then wait and read net._http_response.
--
-- Run it from a terminal instead. curl is SYNCHRONOUS — the status code and
-- the body come back on the same command, with no table to poll and no pruning
-- window to race:
--
--   curl -sS -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://<project-ref>.functions.supabase.co/stall-alert' \
--     -H 'Content-Type: application/json' \
--     -H "x-cron-secret: $CRON_SECRET" \
--     -d '{}'
--
-- Repeat for market-watch and ccus-sweep. What each answer means:
--
--   200 + a JSON summary   the function ran AND its database client worked.
--                          After the error-handling fixes, every read and
--                          write path throws on refusal, so a 200 with counts
--                          is end-to-end evidence — which it was not before.
--   401                    x-cron-secret does not match, OR the function was
--                          deployed with JWT verification ON. Check
--                          supabase/config.toml before rotating anything.
--   500                    the function threw. The body names the cause; a
--                          refused database client now lands here rather than
--                          returning a healthy-looking 200.
--   no response            the function is not deployed at that name.
--
-- ⚠️ stall-alert HAS A SIDE EFFECT: firing it by hand increments
-- days_in_stage on every in-flight deal, exactly as the scheduled run does.
-- That is one extra day of age across the book, and it feeds the health score.
-- Fire market-watch or ccus-sweep to test connectivity; fire stall-alert only
-- when you mean to, or on a day its scheduled run has not yet happened.
--
-- ══ AND THE KEY QUESTION, ANSWERED DIRECTLY ══
--
-- To find out whether the platform-injected legacy JWT still works, you do not
-- need to infer it. Any 200 from market-watch or ccus-sweep is proof: both
-- call listUsers() before they do anything else, and listUsers throws on a
-- refused read. A working 200 means that key authenticated.
--
-- If they 500 with a message naming a JWT or a permission, the legacy key IS
-- affected, and the fix is on Supabase's side — the value is injected by the
-- platform and cannot be overridden from a deploy.
