-- ═══════════════════════════════════════════════════════
-- PowerDeal — pg_cron schedules
--
-- BEFORE RUNNING: replace {CRON_SECRET} throughout this file with the real
-- value. The project ref is already filled in. A blind replace-all is correct
-- and safe: the string appears 6 times, but only 3 are live — one inside each
-- cron.schedule body below. The other 3 are in this comment block and in the
-- fire-by-hand example at the bottom, where replacing them is harmless (this
-- buffer is scratch; nothing here is committed with a secret in it).
--
-- {CRON_SECRET} is deliberately NOT committed. It is the only thing standing
-- between the public internet and three functions that write to every user's
-- data, so it stays out of git — paste it in the SQL editor at run time.
-- Generate with: openssl rand -hex 32
--
-- ⚠️  The functions MUST be deployed with JWT verification OFF (supabase/
-- config.toml sets this declaratively; --no-verify-jwt does it per deploy).
-- pg_cron sends only the x-cron-secret header and has no Supabase JWT to
-- present — with verification on, the platform gateway 401s every call BEFORE
-- the function's own auth check runs. The schedule looks healthy, nothing
-- executes, and cron.job_run_details is the only place the 401 appears.
--
-- Times are UTC. The CT offsets below are for CDT (UTC-5). During CST
-- (UTC-6) each job fires one hour LATER in local time — pg_cron has no
-- timezone support, so this is unavoidable without two schedules. The
-- alternative is to re-run this file at each DST change; for a 6-8am
-- background sweep the hour of drift does not matter.
--
-- Requires: pg_cron + pg_net. schema.sql attempts to create them and now
-- asserts they exist, because a `create extension if not exists` that silently
-- no-ops leaves you here scheduling jobs that report active = t and can never
-- fire. Confirm before trusting anything below:
--   select extname, extversion from pg_extension
--    where extname in ('pg_cron', 'pg_net');
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
    url := 'https://nwbbcczawvmgtjeelyvf.functions.supabase.co/market-watch',
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
    url := 'https://nwbbcczawvmgtjeelyvf.functions.supabase.co/stall-alert',
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
    url := 'https://nwbbcczawvmgtjeelyvf.functions.supabase.co/ccus-sweep',
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
--     url := 'https://nwbbcczawvmgtjeelyvf.functions.supabase.co/stall-alert',
--     headers := jsonb_build_object('x-cron-secret', '{CRON_SECRET}'),
--     body := '{}'::jsonb);
