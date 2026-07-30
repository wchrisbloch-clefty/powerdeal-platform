-- ═══════════════════════════════════════════════════════
-- PowerDeal — pg_cron schedules
--
-- BEFORE RUNNING, replace both placeholders throughout this file:
--   {PROJECT_REF}  → your Supabase project ref (the subdomain in your URL)
--   {CRON_SECRET}  → the value of CRON_SECRET (openssl rand -hex 32)
--
-- Times are UTC. The CT offsets below are for CDT (UTC-5). During CST
-- (UTC-6) each job fires one hour LATER in local time — pg_cron has no
-- timezone support, so this is unavoidable without two schedules. The
-- alternative is to re-run this file at each DST change; for a 6-8am
-- background sweep the hour of drift does not matter.
--
-- Requires: pg_cron + pg_net (both created in schema.sql).
-- ═══════════════════════════════════════════════════════

-- Idempotent: unschedule before scheduling so this file can be re-run.
select cron.unschedule('market-watch-friday') where exists (
  select 1 from cron.job where jobname = 'market-watch-friday');
select cron.unschedule('stall-alert-daily') where exists (
  select 1 from cron.job where jobname = 'stall-alert-daily');
select cron.unschedule('ccus-sweep-daily') where exists (
  select 1 from cron.job where jobname = 'ccus-sweep-daily');


-- ── Friday market watch sweep (8am CT = 13:00 UTC) ──
-- Runs after the week's news has landed but before anyone plans Monday.
select cron.schedule(
  'market-watch-friday',
  '0 13 * * 5',
  $$
  select net.http_post(
    url := 'https://{PROJECT_REF}.functions.supabase.co/market-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '{CRON_SECRET}'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);


-- ── Daily stall alert (7am CT = 12:00 UTC) ──
-- Also ticks days_in_stage, which feeds the health score. If this job stops
-- running, health scores silently stop degrading and stalled deals keep
-- looking healthy — check it first if the pipeline looks suspiciously good.
select cron.schedule(
  'stall-alert-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://{PROJECT_REF}.functions.supabase.co/stall-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '{CRON_SECRET}'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);


-- ── Daily CCUS sweep (6am CT = 11:00 UTC) ──
select cron.schedule(
  'ccus-sweep-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://{PROJECT_REF}.functions.supabase.co/ccus-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '{CRON_SECRET}'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);


-- ═══════════════════════════════════════════════════════
-- Verify + troubleshoot
-- ═══════════════════════════════════════════════════════
-- Scheduled jobs:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Recent runs (a 401 in return_message means CRON_SECRET does not match
-- the value set on the edge function):
--   select j.jobname, r.status, r.return_message, r.start_time
--   from cron.job_run_details r
--   join cron.job j using (jobid)
--   order by r.start_time desc limit 20;
--
-- Fire one by hand:
--   select net.http_post(
--     url := 'https://{PROJECT_REF}.functions.supabase.co/stall-alert',
--     headers := jsonb_build_object('x-cron-secret', '{CRON_SECRET}'),
--     body := '{}'::jsonb);
