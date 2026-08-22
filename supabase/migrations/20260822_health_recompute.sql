-- ═══════════════════════════════════════════════════════════════
-- THE STORED SCORES WERE NEVER PRODUCED BY THE FUNCTION THAT NAMES THEM
-- ═══════════════════════════════════════════════════════════════
--
-- Twenty-one deals, every `health_score` a whole integer, and
-- `compute_health_score` returns `round(score, 1)`. Whole integers across the
-- board is not a coincidence — it is the signature of values that were written
-- by hand and never derived. Twenty of twenty-one compute to exactly 1.5:
-- `days_in_stage` under 30 and nothing else earning a point.
--
-- Stored values were inflated 100–167%. Every health number the product has
-- shown is fiction: the average, the at-risk count, the distribution, and
-- worst, the ORDERING — deals appeared to differ from one another when twenty
-- of them are identical.
--
-- ══ WHY THE PREVIOUS MIGRATION DID NOT CATCH IT ══
--
-- 20260810_critical_event.sql ran `update deals set updated_at = updated_at`
-- for exactly this purpose and reported four PASSes. Its checks proved that
-- the FUNCTION reads the column and that no deal without a critical event
-- exceeds 6. Both true. Neither can detect that no stored value has ever been
-- produced by the function at all — a verification block proving the RULE
-- while the DATA never met it.
--
-- That is now rule 20 in supabase/migrations/README.md: verify the re-score,
-- not the rule. Assert `stored = computed` on real rows.
--
-- ══ AND THERE IS A SECOND DERIVED COLUMN WITH THE SAME PROBLEM ══
--
-- ⚠️ `meddpicc_score` IS NEVER COMPUTED IN SQL. It is a plain integer column
-- with `default 0`, and `compute_health_score` reads it. So repairing health
-- alone would leave it derived from an input that nothing maintains — a fix
-- that produces correct arithmetic over a stale operand.
--
-- Worse, it is computed in TWO places already: `computeMeddpiccScore` and
-- `computeHealthScore` in lib/deals.ts, which POST and PATCH call and write
-- explicitly. With the trigger restored, whichever wrote last wins. So this
-- migration makes the DATABASE authoritative for both, and
-- tests/health-parity.test.ts asserts the TypeScript and SQL rules agree —
-- because two implementations of one score is the defect, and the mitigation
-- for an unavoidable second copy is to assert they cannot disagree.
--
-- ⚠️ ONE KNOWN GAP, STATED RATHER THAN HIDDEN. The MEDDPICC 'C' pillar scores
-- off `deal_competitors` rows. Adding a competitor does not write to `deals`,
-- so no trigger fires and the score goes stale until the deal is next written.
-- `health_drift()` below is what catches that, and it is why the drift check is
-- runtime rather than a one-off.
--
-- IDEMPOTENT. Safe to re-run: re-running recomputes to the same values.


-- ═══════════════════════════════════════════════════════════════
-- §0 · DIAGNOSE FIRST. Run this BEFORE the migration and keep the output.
-- ═══════════════════════════════════════════════════════════════
--
-- The fix below works whether the trigger is missing, detached or disabled. The
-- diagnosis is still worth having: "it was never created" and "it was created
-- and then disabled" are different stories about how this database is managed,
-- and only one of them can happen again the same way.

select
  'compute_health_score exists'                       as check,
  count(*)::text                                      as observed,
  case when count(*) > 0 then 'yes' else 'NO' end     as verdict
from pg_proc where proname = 'compute_health_score'

union all

select
  'deals_set_health exists',
  count(*)::text,
  case when count(*) > 0 then 'yes' else 'NO' end
from pg_proc where proname = 'deals_set_health'

union all

-- ⚠️ pg_trigger, NOT information_schema.triggers. The information_schema view
-- HIDES disabled triggers entirely, so a trigger that exists and is switched
-- off looks identical to one that was never created. That distinction is the
-- whole question here.
select
  'deals_health_score trigger',
  coalesce(max(
    case tgenabled
      when 'O' then 'enabled (origin)'
      when 'D' then 'DISABLED'
      when 'R' then 'enabled (replica only)'
      when 'A' then 'enabled (always)'
      else 'unknown: ' || tgenabled::text
    end), 'ABSENT'),
  coalesce(max(case when tgenabled = 'O' then 'ok' else 'NOT FIRING' end), 'ABSENT')
from pg_trigger
where tgrelid = 'deals'::regclass and tgname = 'deals_health_score'

union all

select
  'it fires on UPDATE',
  coalesce(max(case when (tgtype & 16) > 0 then 'yes' else 'NO — insert only' end), 'ABSENT'),
  coalesce(max(case when (tgtype & 16) > 0 then 'ok' else 'NOT ON UPDATE' end), 'ABSENT')
from pg_trigger
where tgrelid = 'deals'::regclass and tgname = 'deals_health_score'

union all

-- ⚠️ THE ONE THAT ANSWERS "WAS THE SCHEMA EVER FULLY APPLIED". Every trigger
-- in schema.sql is defined after line 460. If they are ALL missing, the file
-- stopped early — and the `raise exception` guard for pg_cron/pg_net sits at
-- line 54, above everything.
--
-- ⚠️ NAMED, NOT COUNTED — AND THIS ROW IS WHY THE RULE EXISTS. It first read
-- `not tgisinternal`, which counts EVERY trigger on `deals` including
-- `deals_field_history` from migration 20260821. So the "1 of 3" this file
-- reported could have been one of schema.sql's three, or it could have been
-- ZERO of them plus the unrelated one. A count is satisfied by the wrong set as
-- easily as the right one, and here the wrong set changes the conclusion.
-- The third column lists what was actually found, so the reading is never again
-- a number that has to be trusted.
select
  'triggers on deals, of the 3 schema.sql defines',
  count(*)::text || ' of 3 named',
  case when count(*) = 3 then 'ok'
       else 'SCHEMA NOT FULLY APPLIED — found: '
            || coalesce(string_agg(tgname, ', ' order by tgname), '(none)') end
from pg_trigger
where tgrelid = 'deals'::regclass
  and tgname in ('deals_updated_at', 'deals_health_score', 'deals_stage_transition')

union all

-- And, separately, everything else that is on the table. Not a verdict — a
-- reading, so the named count above can be interpreted rather than guessed at.
select
  'other triggers on deals (not from schema.sql)',
  coalesce(string_agg(tgname, ', ' order by tgname), '(none)'),
  'informational'
from pg_trigger
where tgrelid = 'deals'::regclass and not tgisinternal
  and tgname not in ('deals_updated_at', 'deals_health_score', 'deals_stage_transition')

union all

-- The measurement that matters more than any of the above.
select
  'rows whose stored health disagrees with the function',
  count(*)::text || ' of ' || (select count(*) from deals)::text,
  case when count(*) = 0 then 'ok' else 'DRIFTED' end
from deals d
where d.health_score is distinct from compute_health_score(d.*);


-- ═══════════════════════════════════════════════════════════════
-- §1 · MEDDPICC BECOMES A DERIVED VALUE THE DATABASE MAINTAINS
-- ═══════════════════════════════════════════════════════════════
--
-- Mirrors `meddpiccResult()` in lib/deals.ts: eight pillars, one point each.
--
-- ⚠️ `stable`, NOT `immutable`, because the 'C' pillar reads another table.
-- Declaring it immutable would let the planner cache a result across a
-- competitor insert — a stored derived value going stale inside a single
-- statement, which is this migration's own subject.
--
-- ⚠️ THE NULL-COUNT CASE DIFFERS FROM TYPESCRIPT AND THE SCORE DOES NOT.
-- `meddpiccResult` leaves competition UNSCORED when the competitor read fails,
-- so it prints "unknown" rather than "gap". A SQL count is never null, so this
-- always scores the pillar. Both produce the same NUMBER — unscored adds
-- nothing and neither does a zero count — and only the display distinguishes
-- them. That is why the parity test compares scores rather than pillar states.
create or replace function compute_meddpicc_score(d deals)
returns integer as $$
  select
      (case when coalesce(d.metrics_known, false) then 1 else 0 end)
    + (case when d.economic_buyer is not null and d.economic_buyer <> '' then 1 else 0 end)
    + (case when d.decision_criteria is not null and d.decision_criteria <> '' then 1 else 0 end)
    + (case when d.decision_process is not null and d.decision_process <> '' then 1 else 0 end)
    + (case when d.identified_pain is not null and d.identified_pain <> '' then 1 else 0 end)
    + (case when d.champion is not null and d.champion <> '' then 1 else 0 end)
    + (case when exists (select 1 from deal_competitors dc where dc.deal_id = d.id) then 1 else 0 end)
    + (case when coalesce(d.decision_mapped, false) then 1 else 0 end);
$$ language sql stable;

comment on function compute_meddpicc_score is
  'The eight MEDDPICC pillars, one point each. Mirrors meddpiccResult() in '
  'lib/deals.ts; tests/health-parity.test.ts asserts the two cannot disagree.';


-- ═══════════════════════════════════════════════════════════════
-- §2 · THE TRIGGER NOW MAINTAINS BOTH DERIVED COLUMNS
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ MEDDPICC IS SET FIRST AND HEALTH READS THE FRESH VALUE. Reversing these
-- two lines computes health from the previous MEDDPICC score and the error is
-- invisible: the number is plausible, it is off by at most 2.5, and nothing
-- anywhere would say so. Order is load-bearing.
--
-- ⚠️ IT OVERWRITES WHAT THE CLIENT SENT, DELIBERATELY. POST and PATCH compute
-- both scores in TypeScript and write them. Two implementations of one score
-- means last-writer-wins, and that is the defect rather than a redundancy. The
-- database is authoritative from here; the TypeScript stays because the UI
-- needs the number before a round trip, and the parity test is what keeps the
-- override invisible.
create or replace function deals_set_health()
returns trigger as $$
begin
  new.meddpicc_score := compute_meddpicc_score(new);
  new.health_score := compute_health_score(new);
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_health_score on deals;
create trigger deals_health_score before insert or update on deals
  for each row execute function deals_set_health();


-- ═══════════════════════════════════════════════════════════════
-- §3 · THE ONE-TIME RECOMPUTE
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ EXPLICIT, NOT `set updated_at = updated_at`. The no-op update is what the
-- last migration used and it depends entirely on the trigger firing — which is
-- the thing that was broken. A repair that assumes the broken mechanism works
-- is not a repair; it is the same bet, placed again.
--
-- Two statements. The second reads the value the first wrote, so the trigger is
-- not load-bearing here either. With the trigger installed it recomputes the
-- same answers from NEW, so the two paths converge rather than fighting.
--
-- ⚠️ THIS WRITES `deal_field_history` ROWS through the audit trigger, one per
-- deal whose meddpicc_score changes. That is correct and worth expecting: the
-- correction of a wrong number is exactly the kind of change that table exists
-- to record. `health_score` is not an audited field, so the health movement
-- itself is captured as before/after on those rows rather than as its own.

update deals d set meddpicc_score = compute_meddpicc_score(d);
update deals d set health_score   = compute_health_score(d);


-- ═══════════════════════════════════════════════════════════════
-- §4 · THE RUNTIME DRIFT CHECK
-- ═══════════════════════════════════════════════════════════════
--
-- A stored value that can silently disagree with its own function is worse
-- than a wrong one, because the derivation claims otherwise. This is the same
-- defect as schema drift, one layer in, so it gets the same treatment: a live
-- measurement on real rows, surfaced beside the schema drift count.
--
-- ⚠️ IT COMPARES AGAINST THE DATABASE'S OWN FUNCTION, never a reimplementation.
-- A TypeScript copy of the rule in the drift checker would be a third
-- implementation, and a drift check that can itself drift reports on nothing.
create or replace function health_drift()
returns table (
  deal_id text,
  company text,
  stored_health numeric,
  computed_health numeric,
  stored_meddpicc integer,
  computed_meddpicc integer
) as $$
  select d.deal_id, d.company,
         d.health_score, compute_health_score(d.*),
         d.meddpicc_score, compute_meddpicc_score(d.*)
  from deals d
  where d.health_score   is distinct from compute_health_score(d.*)
     or d.meddpicc_score is distinct from compute_meddpicc_score(d.*)
  order by d.deal_id;
$$ language sql stable security definer set search_path = public;

comment on function health_drift is
  'Rows whose stored derived scores disagree with the functions that name them. '
  'Empty is the only healthy answer. Read by /api/schema/drift.';


-- ═══════════════════════════════════════════════════════════════
-- §5 · VERIFICATION — STORED vs COMPUTED, ON REAL ROWS
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ THIS IS THE DISTINCTION THE LAST MIGRATION MISSED. It does not assert that
-- the function is correct, that the cap is applied, or that the column is read.
-- All three were true while every stored value was fiction. It asserts that
-- what is IN THE TABLE equals what the function produces for that row.

select
  'every row agrees with the function'                                  as check,
  count(*) filter (where health_score is distinct from compute_health_score(d.*))::text
    || ' disagree of ' || count(*)::text                                as observed,
  case
    when count(*) = 0 then 'FAIL — no rows, so this proves nothing'
    when count(*) filter (where health_score is distinct from compute_health_score(d.*)) = 0
      then 'PASS'
    else 'FAIL'
  end                                                                   as verdict
from deals d

union all

select
  'and so does meddpicc',
  count(*) filter (where meddpicc_score is distinct from compute_meddpicc_score(d.*))::text
    || ' disagree of ' || count(*)::text,
  case
    when count(*) = 0 then 'FAIL — no rows, so this proves nothing'
    when count(*) filter (where meddpicc_score is distinct from compute_meddpicc_score(d.*)) = 0
      then 'PASS'
    else 'FAIL'
  end
from deals d

union all

-- ⚠️ THE WHOLE-INTEGER TELL, AS AN ASSERTION. It is what exposed this: a real
-- distribution of `round(score, 1)` over twenty-one deals containing NO
-- decimal is not plausible. This does not fail the migration — a pipeline can
-- legitimately land on whole numbers — but it prints the count so a reader can
-- see whether the shape changed.
select
  'health scores with a decimal part',
  count(*) filter (where health_score <> round(health_score))::text
    || ' of ' || count(*)::text,
  'INFORMATIONAL — all-whole was the signature of hand-written values'
from deals

union all

select
  'drift function reports nothing',
  (select count(*)::text from health_drift()),
  case when (select count(*) from health_drift()) = 0 then 'PASS' else 'FAIL' end

union all

select
  'the trigger is attached to UPDATE and enabled',
  coalesce(max(case when tgenabled = 'O' and (tgtype & 16) > 0 then 'yes' else 'no' end), 'ABSENT'),
  coalesce(max(case when tgenabled = 'O' and (tgtype & 16) > 0 then 'PASS' else 'FAIL' end), 'FAIL')
from pg_trigger
where tgrelid = 'deals'::regclass and tgname = 'deals_health_score';


-- ═══════════════════════════════════════════════════════════════
-- §6 · THE NEGATIVE TEST. Rule 4. Run it; it is SUPPOSED to report FAIL.
-- ═══════════════════════════════════════════════════════════════
--
-- Every check above has now seen the passing case. An operator who runs this
-- and sees PASS has a verification that cannot fail — which is precisely the
-- state the last migration shipped in.
--
--   begin;
--   -- Break one row the way the live data was broken: a hand-written value.
--   update deals set health_score = 4 where deal_id = (select deal_id from deals order by deal_id limit 1);
--   -- EXPECTED: '1 disagree of N' and FAIL, and health_drift() returns 1 row.
--   select count(*) from health_drift();
--   rollback;
--
-- ⚠️ THE UPDATE WILL BE UNDONE BY THE TRIGGER ITSELF once it is installed —
-- `deals_set_health` recomputes on the way in, so the hand-written 4 never
-- lands. That is the fix working, and it means this negative test only
-- demonstrates a failure on a database where the trigger is still missing.
-- To exercise it after the fix, disable the trigger for the transaction:
--
--   begin;
--   alter table deals disable trigger deals_health_score;
--   update deals set health_score = 4 where deal_id = (select deal_id from deals order by deal_id limit 1);
--   select * from health_drift();          -- EXPECTED: one row
--   rollback;                              -- restores the trigger with it
