-- ═══════════════════════════════════════════════════════
-- PowerDeal — pg_cron schedules
--
-- ⚠️ THE SECRET IS NO LONGER PASTED INTO THIS FILE. IT LIVES IN THE VAULT.
--
-- It used to be a literal, replaced by hand in three cron.schedule bodies
-- before running. That is a second copy of a value whose first copy lives in
-- the Supabase edge-function environment — and on 2026-08-12 the two drifted.
-- Every net.http_post got a 401. pg_cron recorded success, because
-- net.http_post is asynchronous and the statement it runs is the ENQUEUE, not
-- the request. Five stall-alert runs and seven ccus-sweep runs were missed,
-- every one of them reporting healthy.
--
-- The job bodies now READ the secret at fire time:
--
--   (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--
-- so rotating it is one statement and the schedule never has to be rewritten.
-- Set it once, before running this file:
--
--   select vault.create_secret('<value>', 'cron_secret',
--            'Shared secret for pg_cron -> edge function calls');
--
--   -- rotating later, without touching any schedule:
--   select vault.update_secret(
--            (select id from vault.secrets where name = 'cron_secret'),
--            '<new value>');
--
-- Generate with: openssl rand -hex 32
--
-- ══ WHAT THIS DOES NOT FIX, AND SAYING SO IS THE POINT ══
--
-- The edge functions still read CRON_SECRET from their own environment, and
-- that copy cannot be removed. An auth gate has to authenticate the caller
-- BEFORE trusting it; making it query the database first inverts that, turns
-- a database blip into a 500 where a 401 belongs, and needs a security-definer
-- RPC to expose vault to PostgREST at all — which hands the secret to anything
-- holding the service key.
--
-- So: three copies became two, and the one that drifted is gone.
-- scripts/cron-secret-check.mjs proves the remaining two agree by BEHAVIOUR
-- rather than by comparing values, which is the only comparison possible from
-- outside both of them.
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
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
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
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
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
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
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
-- ⚠️ A 401 NEVER APPEARS IN cron.job_run_details. This comment used to say
-- it did, and it sent the CCUS investigation to the wrong table.
--
-- `net.http_post` is ASYNCHRONOUS. It queues the request, returns a bigint
-- request_id immediately, and pg_cron records THAT statement as succeeded.
-- The job succeeds whether the edge function returns 200, 401 or never
-- answers at all. The HTTP response lands later, in `net._http_response`.
--
-- So the two tables answer two different questions and you need both:
--
--   cron.job_run_details  — did pg_cron fire the statement?
--                           A missing row here means the JOB did not run.
--   net._http_response    — what did the function say?
--                           A 401 here means CRON_SECRET does not match.
--
-- Run supabase/functions/diagnose-cron.sql; it queries both and joins them.
--
-- Recent runs — fired or not, says nothing about the HTTP result:
--   select j.jobname, r.status, r.return_message, r.start_time
--   from cron.job_run_details r
--   join cron.job j using (jobid)
--   order by r.start_time desc limit 20;
--
-- Fire one by hand:
--   select net.http_post(
--     url := 'https://nwbbcczawvmgtjeelyvf.functions.supabase.co/stall-alert',
--     headers := jsonb_build_object('x-cron-secret',
--       (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
--     body := '{}'::jsonb);
--
-- ⚠️ Firing stall-alert by hand ticks days_in_stage on every in-flight deal.
-- Use ccus-sweep or market-watch to test connectivity.
--
-- Confirm the vault row exists before scheduling — a missing secret makes the
-- header NULL, jsonb_build_object drops the key, and every call 401s exactly
-- as it did in August:
--   select name, created_at, updated_at from vault.secrets where name = 'cron_secret';
