-- ═══════════════════════════════════════════════════════
-- MIGRATION — critical_event / critical_event_date
--
-- The forcing function that makes doing nothing expensive: a budget cycle, a
-- program deadline, an expiring contract, a regulatory decision. No-decision is
-- the dominant loss mode in complex sales, and the absence of a forcing
-- function is its leading indicator — so a deal without one is CAPPED at 6,
-- exactly the way a single-threaded deal is.
--
-- ── RUN THIS, THEN RUN THE VERIFICATION AT THE BOTTOM ──
--
-- Re-running is safe. Every statement is idempotent: `add column if not
-- exists`, `create or replace function`, `drop trigger if exists` before
-- create. If you are unsure whether this applied, run it again and then run
-- the verification.
--
-- Idempotency matters here specifically. schema.sql declared pg_cron and pg_net
-- for months and neither was actually installed — this project has a proven
-- record of migrations registering without running, so "run it again to be
-- sure" has to be a safe instruction rather than a risky one.
-- ═══════════════════════════════════════════════════════

-- ── 1. Columns ──────────────────────────────────────────
alter table deals add column if not exists critical_event text;
alter table deals add column if not exists critical_event_date date;

comment on column deals.critical_event is
  'The forcing function that makes doing nothing expensive. Absence caps health at 6.';
comment on column deals.critical_event_date is
  'When the forcing function lands. Null is allowed: knowing the event without its date is still worth more than nothing.';

-- ── 2. Health score ─────────────────────────────────────
-- Mirrors computeHealthScore() in lib/deals.ts. The two must stay in step —
-- this one is the stored authority, that one drives instant UI feedback.
create or replace function compute_health_score(d deals)
returns numeric as $$
declare score numeric := 0;
begin
  score := score + (coalesce(d.meddpicc_score, 0)::numeric / 8) * 2.5;
  if d.multi_threaded then score := score + 2; end if;
  if d.economic_buyer is not null and d.economic_buyer <> '' then
    score := score + 1.5;
  end if;
  if coalesce(d.days_in_stage, 0) < 30 then score := score + 1.5;
  elsif coalesce(d.days_in_stage, 0) < 60 then score := score + 0.75;
  end if;
  if d.decision_mapped then score := score + 1.5; end if;
  if d.champion is not null and d.champion <> '' then score := score + 1; end if;

  score := least(10, score);

  -- Two independent caps, both at 6. A deal missing either one cannot present
  -- as healthy, and a deal missing both is not penalised twice — the lower
  -- ceiling simply applies.
  if not d.multi_threaded then score := least(6, score); end if;
  if d.critical_event is null or d.critical_event = '' then
    score := least(6, score);
  end if;

  -- The column's CHECK floor is 1.
  return greatest(1, round(score, 1));
end;
$$ language plpgsql immutable;

-- ── 3. Re-score existing rows ───────────────────────────
-- The trigger only fires on insert or update, so rows written before this
-- migration keep their old score until something touches them. A no-op update
-- forces the recompute. Without this, existing deals would show a health score
-- that the current function would not produce — the stored value and the code
-- disagreeing, silently.
update deals set updated_at = updated_at;


-- ═══════════════════════════════════════════════════════
-- VERIFICATION — run this AFTER the migration above.
--
-- Returns rows, not a success message. Every check is a row with its own
-- pass/fail and the value actually observed, because "no error" is exactly the
-- signal that failed us on pg_cron.
-- ═══════════════════════════════════════════════════════
--
-- with checks as (
--   -- Column exists, with the expected type and nullability.
--   select
--     'column: critical_event' as check_name,
--     (c.data_type = 'text' and c.is_nullable = 'YES') as passed,
--     coalesce(c.data_type || ', nullable=' || c.is_nullable, 'COLUMN MISSING') as observed,
--     'text, nullable=YES' as expected
--   from information_schema.columns c
--   where c.table_name = 'deals' and c.column_name = 'critical_event'
--
--   union all
--   select
--     'column: critical_event_date',
--     (c.data_type = 'date' and c.is_nullable = 'YES'),
--     coalesce(c.data_type || ', nullable=' || c.is_nullable, 'COLUMN MISSING'),
--     'date, nullable=YES'
--   from information_schema.columns c
--   where c.table_name = 'deals' and c.column_name = 'critical_event_date'
--
--   union all
--   -- The health function actually reads the new column. A migration that added
--   -- the column and left the function alone would pass every check above.
--   select
--     'health function reads critical_event',
--     (p.prosrc like '%critical_event%'),
--     case when p.prosrc like '%critical_event%'
--          then 'referenced' else 'NOT REFERENCED — function is stale' end,
--     'referenced'
--   from pg_proc p
--   where p.proname = 'compute_health_score'
--
--   union all
--   -- And that it BITES. Any deal without a critical event must be <= 6,
--   -- whatever else is true of it. This is the behavioural check; the three
--   -- above are structural.
--   select
--     'cap enforced on deals with no critical event',
--     not exists (
--       select 1 from deals
--       where (critical_event is null or critical_event = '')
--         and health_score > 6
--     ),
--     coalesce((
--       select 'violations: ' || count(*)::text from deals
--       where (critical_event is null or critical_event = '')
--         and health_score > 6
--     ), 'violations: 0'),
--     'violations: 0'
-- )
-- select
--   check_name,
--   case when passed then 'PASS' else 'FAIL' end as result,
--   observed,
--   expected
-- from checks
-- order by result desc, check_name;
--
--
-- ── Then look at the data itself ──
-- Four structural PASSes still tell you nothing about whether the column holds
-- anything useful. This shows the actual state of the book:
--
-- select
--   deal_id,
--   company,
--   stage,
--   health_score,
--   coalesce(critical_event, '— none on record —') as critical_event,
--   critical_event_date,
--   case
--     when critical_event is null or critical_event = '' then 'capped at 6'
--     else 'uncapped'
--   end as health_ceiling
-- from deals
-- order by health_score desc, deal_id
-- limit 25;
--
-- Expect every row in that list to show "capped at 6" immediately after this
-- migration, because nothing has a critical event yet. That is the correct
-- starting state, and it is also the point: the field is diagnostic, and an
-- empty one is a finding rather than a blank.
