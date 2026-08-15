-- ═══════════════════════════════════════════════════════════════
-- WHY DID A pg_cron JOB NOT RUN?
-- ═══════════════════════════════════════════════════════════════
--
-- Written for the CCUS sweep missing two consecutive daily runs while
-- `stall-alert-daily` and `market-watch-friday` — same database, same
-- pg_cron, same embedded secret — fired normally.
--
-- ⚠️ THE OBVIOUS HYPOTHESIS IS RULED OUT BY THE SHAPE OF THE FAILURE.
-- All three jobs carry the SAME literal CRON_SECRET in their command text.
-- A stale secret would 401 all three together, not one of them. And a 401
-- could not have produced a *missing* run in the first place — see below.
--
-- ⚠️ A 401 NEVER APPEARS IN cron.job_run_details.
-- `net.http_post` is asynchronous: it queues the request, returns a bigint
-- request_id, and pg_cron records the statement as succeeded. The job goes
-- green whether the function answers 200, 401, or never answers. The HTTP
-- result lands later in `net._http_response`. The troubleshooting comment in
-- schedule.sql claimed otherwise and has been corrected.
--
-- So the two tables answer two different questions, and the ORDER matters:
--   §1-§3  cron.job_run_details — did the job fire at all?
--   §4-§5  net._http_response   — what did the function actually say?
--
-- Read-only. Nothing here writes, reschedules, or unschedules anything.

-- ── §1. Are the jobs even active? ──
-- `active = false` is the single most common cause of a silently missing run,
-- and it is invisible everywhere else. A job can sit inactive for months.
select
  jobname,
  schedule,
  active,
  case when active then 'scheduled' else '⚠️ INACTIVE — will never fire' end as verdict
from cron.job
where jobname in ('market-watch-friday', 'stall-alert-daily', 'ccus-sweep-daily')
order by jobname;

-- ── §2. Which jobs are DECLARED but not scheduled at all? ──
-- Reported as rows rather than by their absence from §1, because a missing
-- row is exactly what a reader skims past. schedule.sql unschedules before it
-- reschedules, so an interrupted run leaves a job deleted rather than stale.
select
  expected.jobname,
  case
    when j.jobid is null then '⚠️ NOT SCHEDULED — cron.schedule was never run for this job'
    else 'present'
  end as verdict
from (values
  ('market-watch-friday'),
  ('stall-alert-daily'),
  ('ccus-sweep-daily')
) as expected(jobname)
left join cron.job j on j.jobname = expected.jobname
order by expected.jobname;

-- ── §3. Every run of the last 8 days, per job ──
-- The count is the finding. Two daily jobs over 8 days should show ~8 rows
-- each; a job showing 6 missed two firings, and that is a pg_cron fact
-- independent of anything the edge function did.
select
  j.jobname,
  count(*) filter (where r.status = 'succeeded') as fired_ok,
  count(*) filter (where r.status <> 'succeeded') as fired_failed,
  max(r.start_time) as last_fired,
  -- `succeeded` here means THE SQL RAN. It does not mean the HTTP call
  -- worked; see §4. Named in the output so the column cannot be misread.
  'succeeded = the SQL ran, NOT that the function answered' as caveat
from cron.job j
left join cron.job_run_details r
  on r.jobid = j.jobid and r.start_time > now() - interval '8 days'
where j.jobname in ('market-watch-friday', 'stall-alert-daily', 'ccus-sweep-daily')
group by j.jobname
order by j.jobname;

-- ── §3b. The individual runs, newest first ──
-- Gaps are visible by eye here in a way a count cannot show: two missing days
-- in the middle of a run of successes is a different problem from a job that
-- stopped a week ago and never resumed.
select
  j.jobname,
  r.start_time,
  r.status,
  left(coalesce(r.return_message, ''), 80) as return_message
from cron.job_run_details r
join cron.job j using (jobid)
where j.jobname in ('market-watch-friday', 'stall-alert-daily', 'ccus-sweep-daily')
  and r.start_time > now() - interval '8 days'
order by r.start_time desc
limit 40;

-- ── §4. What the edge functions actually returned ──
-- THIS is where a 401 lives. `net._http_response` is where pg_net's background
-- worker deposits the reply, keyed by the request_id http_post returned.
--
-- Guarded with to_regclass because the table is an internal name that has
-- moved between pg_net versions — a hard reference would abort the whole
-- script on the exact instance where the answer is, which is the crash-on-the-
-- condition-you-are-detecting bug this repo has now hit twice.
do $$
declare
  tbl text;
  rec record;
begin
  tbl := coalesce(
    to_regclass('net._http_response')::text,
    to_regclass('net.http_response')::text
  );

  if tbl is null then
    raise notice '⚠️ pg_net response table not found under either known name. The HTTP results cannot be read on this instance — §1-§3 still stand on their own.';
    return;
  end if;

  raise notice '── HTTP responses from the last 8 days (source: %) ──', tbl;

  for rec in execute format(
    $q$
      select
        id,
        status_code,
        left(coalesce(error_msg, ''), 60)          as error_msg,
        left(coalesce(content::text, ''), 80)      as body,
        created
      from %s
      where created > now() - interval '8 days'
      order by created desc
      limit 40
    $q$, tbl)
  loop
    raise notice '% | status=% | error=% | body=% | %',
      rec.id,
      coalesce(rec.status_code::text, 'NO RESPONSE'),
      coalesce(nullif(rec.error_msg, ''), '-'),
      coalesce(nullif(rec.body, ''), '-'),
      rec.created;
  end loop;
end $$;

-- ── §5. The verdict, in one row ──
-- Written as a decision table so the answer does not depend on the reader
-- correlating four result sets by eye at the end of a long day.
do $$
declare
  is_active   boolean;
  exists_job  boolean;
  runs_8d     int;
  other_8d    int;
begin
  select j.active is true, true into is_active, exists_job
    from cron.job j where j.jobname = 'ccus-sweep-daily';

  if not coalesce(exists_job, false) then
    raise notice '';
    raise notice '▶ VERDICT: ccus-sweep-daily is NOT SCHEDULED. cron.schedule was never run for it, or an interrupted schedule.sql unscheduled it and stopped. Re-run schedule.sql.';
    return;
  end if;

  if not is_active then
    raise notice '';
    raise notice '▶ VERDICT: ccus-sweep-daily EXISTS BUT IS INACTIVE. It will never fire. Re-activate it: update cron.job set active = true where jobname = ''ccus-sweep-daily'';';
    return;
  end if;

  select count(*) into runs_8d
    from cron.job_run_details r join cron.job j using (jobid)
   where j.jobname = 'ccus-sweep-daily' and r.start_time > now() - interval '8 days';

  select count(*) into other_8d
    from cron.job_run_details r join cron.job j using (jobid)
   where j.jobname = 'stall-alert-daily' and r.start_time > now() - interval '8 days';

  raise notice '';
  raise notice '▶ ccus-sweep-daily fired % time(s) in 8 days; stall-alert-daily fired %.', runs_8d, other_8d;

  if runs_8d < other_8d then
    raise notice '▶ VERDICT: pg_cron genuinely SKIPPED firings. The secret is not the cause — it is embedded identically in all three jobs, so a stale one would take all three down together. Look at instance restarts and any manual cron.unschedule around the gap in §3b.';
  elsif runs_8d = 0 then
    raise notice '▶ VERDICT: the job is active and has NEVER fired in 8 days. Check that the pg_cron extension itself is enabled and the database was not paused.';
  else
    raise notice '▶ VERDICT: pg_cron fired on schedule. The missing runs are NOT a cron problem — the edge function did not do its work. Read §4: a 401 there means CRON_SECRET does not match the function''s, which is fixed by re-running schedule.sql with the current secret (cron.schedule stored the literal at creation time, so `supabase secrets set` does NOT update it).';
  end if;
end $$;
