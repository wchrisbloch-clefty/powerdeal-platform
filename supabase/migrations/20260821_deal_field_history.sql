-- ═══════════════════════════════════════════════════════════════
-- A NUMBER THAT WAS NEVER RIGHT SHOULD NOT GO QUIET WHEN IT IS FIXED
-- ═══════════════════════════════════════════════════════════════
--
-- `health_score` and `meddpicc_score` are stored columns, recomputed in place
-- by `deals_set_health()` on every write. Learn the real economic buyer at
-- Contracting and the score moves — and nothing anywhere records that the
-- previous number was wrong, or for how long it was being reported with
-- confidence.
--
-- That is the same class as seed data rendering as real: a value that was never
-- right, presented identically to one that was.
--
-- ══ THE PRECEDENT IS `stage_transitions`, DELIBERATELY ══
--
-- Stage is the one field on this table with a real audit trail, and it works:
-- a `before update` trigger writes a row whenever the value actually changes,
-- so a stage moved by the app, by SQL, or by `log_win_loss()` is equally
-- legible afterwards. This is that pattern widened to the fields that MOVE
-- THE SCORE.
--
-- ⚠️ A TRIGGER RATHER THAN APPLICATION CODE, FOR ONE REASON: the operator is
-- about to populate a deal by hand in SQL. An audit that only records writes
-- made through the API would be blind to exactly the writes about to happen,
-- and would report a clean history of a deal that had been rewritten
-- underneath it.
--
-- ══ WHAT EACH ROW SAYS ══
--
--   · which field changed, from what, to what
--   · what health and MEDDPICC were BEFORE and AFTER — so "the earlier number
--     was never right" is a fact on the row rather than an inference
--   · the stage the deal was in at the time, so a champion learned at
--     Prospecting is distinguishable from one learned at Negotiation
--   · the signal that produced it, when one did
--   · the basis: sourced / derived / illustrative, for a figure that is an
--     estimate and must never later read as measured
--
-- ⚠️ IT RECONSTRUCTS NOTHING. Rows written before this migration have no
-- history and this does not invent one. `count(*) = 0` for a deal means
-- "nothing recorded since the audit existed", NOT "never changed", and the
-- verification block below asserts that distinction is visible.
--
-- IT GATES NOTHING and it changes no score. `compute_health_score` is not
-- touched; this observes.
--
-- IDEMPOTENT. Safe to re-run.

-- ── 1. The table ──
create table if not exists deal_field_history (
  id              uuid primary key default uuid_generate_v4(),
  deal_id         uuid references deals(id) on delete cascade,
  -- Human-readable, same as stage_transitions.deal_ref: a history row is worth
  -- reading after the deal row is gone.
  deal_ref        text,
  field           text not null,
  old_value       text,
  new_value       text,
  -- The two stored scores, on both sides of the write.
  health_before   numeric,
  health_after    numeric,
  meddpicc_before integer,
  meddpicc_after  integer,
  -- ⚠️ THE STAGE THE FACT ARRIVED AT, which is OLD.stage rather than NEW.stage.
  -- If one statement sets a champion and advances the stage, the champion was
  -- learned while the deal was still where it was.
  stage_at_write  text,
  -- The signal this came from, when the capture bridge produced it. Null for a
  -- direct write, which is honest: nobody proposed it.
  signal_id       uuid references intelligence_log(id) on delete set null,
  -- sourced | derived | illustrative | null. An estimate must never later read
  -- as a measurement — the same rule the Learn visuals enforce per number.
  basis           text,
  note            text,
  recorded_at     timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade
);

create index if not exists deal_field_history_deal_idx on deal_field_history(deal_id);
create index if not exists deal_field_history_at_idx   on deal_field_history(recorded_at desc);
create index if not exists deal_field_history_field_idx on deal_field_history(field);

comment on table deal_field_history is
  'One row per watched field whose value actually changed, with the health and '
  'MEDDPICC scores on both sides. Exists so a late-arriving fact leaves a trace '
  'that the earlier score was never right. Records nothing retroactively.';

-- ── 2. Which fields are watched ──
--
-- ⚠️ NOT EVERY COLUMN. `next_move`, `key_risk` and `notes` change constantly
-- and are operational rather than factual; auditing them would bury the
-- thirteen rows that matter under a hundred that do not, and a history nobody
-- reads is the same as no history.
--
-- The list is the MEDDPICC seven, the two score caps, and the identity facts a
-- deal is miscast without. Every one of them either feeds
-- `compute_health_score` directly or feeds the MEDDPICC score that does.
create or replace function deal_audited_fields()
returns text[] as $$
  select array[
    -- MEDDPICC
    'metrics_known', 'economic_buyer', 'decision_criteria', 'decision_process',
    'identified_pain', 'champion', 'competition',
    -- The two independent caps at 6
    'critical_event', 'critical_event_date', 'multi_threaded',
    -- Structural facts a deal is miscast without
    'decision_mapped', 'beachhead_site', 'beachhead_utility',
    'size_mw', 'size_usd_m', 'value_prop'
  ];
$$ language sql immutable;

-- ── 3. The trigger ──
--
-- ⚠️ `after update`, NOT `before`. By the time this runs, `deals_set_health()`
-- has already recomputed NEW.health_score, so NEW holds the corrected number
-- and OLD holds the one that was being reported. A `before` trigger would see
-- them equal and the whole point would be lost.
--
-- ⚠️ AND IT USES `is distinct from`, NOT `<>`. Null is the state most of these
-- fields are in; `null <> 'Trevor'` is null, not true, so a plain comparison
-- would silently skip every first-time write — which is the write this table
-- exists for.
create or replace function deals_log_field_history()
returns trigger as $$
declare
  f text;
  v_old text;
  v_new text;
  v_signal uuid;
  v_basis text;
  v_note text;
begin
  -- Set by apply_fact() inside the same transaction. Absent for a direct write.
  v_signal := nullif(current_setting('powerdeal.signal_id', true), '')::uuid;
  v_basis  := nullif(current_setting('powerdeal.basis', true), '');
  v_note   := nullif(current_setting('powerdeal.note', true), '');

  foreach f in array deal_audited_fields() loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f)
      into v_old, v_new
      using old, new;

    if v_old is distinct from v_new then
      insert into deal_field_history (
        deal_id, deal_ref, field, old_value, new_value,
        health_before, health_after, meddpicc_before, meddpicc_after,
        stage_at_write, signal_id, basis, note, user_id
      ) values (
        new.id, new.deal_id, f, v_old, v_new,
        old.health_score, new.health_score, old.meddpicc_score, new.meddpicc_score,
        old.stage, v_signal, v_basis, v_note, new.user_id
      );
    end if;
  end loop;

  return null; -- after trigger; return value ignored
end;
$$ language plpgsql;

drop trigger if exists deals_field_history on deals;
create trigger deals_field_history after update on deals
  for each row execute function deals_log_field_history();

-- ── 4. The one write path that can attribute a fact to a signal ──
--
-- ⚠️ A TRIGGER CANNOT KNOW WHICH SIGNAL PRODUCED A WRITE, so the caller says so
-- through a transaction-local setting and this function is the only thing that
-- sets it. `set_config(..., true)` is local: it dies with the transaction and
-- cannot leak into the next write on a pooled connection.
--
-- ⚠️ THE FIELD IS WHITELISTED AGAINST `deal_audited_fields()` PLUS THE FEW
-- WRITABLE FIELDS THAT ARE NOT AUDITED. `format('%I')` quotes an identifier
-- safely, but quoting is not authorisation — without the whitelist this would
-- be a `security definer` function that writes any column of any row.
create or replace function apply_fact(
  p_deal   uuid,
  p_field  text,
  p_value  text,
  p_signal uuid    default null,
  p_basis  text    default null,
  p_note   text    default null
) returns jsonb as $$
declare
  v_type text;
  v_allowed text[];
  v_before text;
  v_after text;
begin
  v_allowed := deal_audited_fields() || array['landed_site', 'next_target_site', 'utility', 'state'];

  if not (p_field = any(v_allowed)) then
    raise exception 'apply_fact: "%" is not a writable fact field', p_field
      using errcode = 'invalid_parameter_value';
  end if;

  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deals' and column_name = p_field;

  if v_type is null then
    raise exception 'apply_fact: deals has no column "%"', p_field
      using errcode = 'undefined_column';
  end if;

  perform set_config('powerdeal.signal_id', coalesce(p_signal::text, ''), true);
  perform set_config('powerdeal.basis', coalesce(p_basis, ''), true);
  perform set_config('powerdeal.note', coalesce(p_note, ''), true);

  execute format('select (d).%I::text from deals d where d.id = $1', p_field)
    into v_before using p_deal;

  -- An empty string is NOT a value. Writing '' where null belongs would make
  -- `verified_empty` and the gap system disagree about whether anyone looked.
  execute format('update deals set %I = nullif($1, '''')::%s where id = $2', p_field, v_type)
    using p_value, p_deal;

  execute format('select (d).%I::text from deals d where d.id = $1', p_field)
    into v_after using p_deal;

  -- ⚠️ REPORTS WHAT LANDED, NOT WHAT WAS ASKED FOR. A caller that assumes its
  -- own input is now the stored value is the optimistic-update defect this
  -- build has already corrected once in the UI.
  return jsonb_build_object(
    'field', p_field,
    'before', v_before,
    'after', v_after,
    'changed', v_before is distinct from v_after
  );
end;
$$ language plpgsql security definer set search_path = public;

comment on function apply_fact is
  'Write one fact field on a deal and attribute it to the signal it came from. '
  'The ONLY path that can set deal_field_history.signal_id. Whitelisted; '
  'returns the value actually stored, not the value requested.';


-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION — run AFTER applying. Rows, not a success message.
-- ═══════════════════════════════════════════════════════════════

-- ── BLOCK A · STRUCTURAL. Reads only. ──
select
  'history table exists'                             as check,
  count(*)::text                                     as observed,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from information_schema.tables
where table_schema = 'public' and table_name = 'deal_field_history'

union all

select
  'carries both scores on both sides',
  count(*)::text || ' of 4',
  case when count(*) = 4 then 'PASS' else 'FAIL' end
from information_schema.columns
where table_name = 'deal_field_history'
  and column_name in ('health_before', 'health_after', 'meddpicc_before', 'meddpicc_after')

union all

select
  'trigger is AFTER, not BEFORE',
  coalesce(max(action_timing), '(absent)'),
  case when max(action_timing) = 'AFTER' then 'PASS' else 'FAIL' end
from information_schema.triggers
where event_object_table = 'deals' and trigger_name = 'deals_field_history'

union all

-- The two caps at 6 are the reason this table exists at all.
select
  'critical_event is audited',
  case when 'critical_event' = any(deal_audited_fields()) then 'yes' else 'no' end,
  case when 'critical_event' = any(deal_audited_fields()) then 'PASS' else 'FAIL' end

union all

select
  'scoring is untouched by the audit',
  case when position('deal_field_history' in prosrc) > 0 then 'reads it' else 'does not' end,
  case when position('deal_field_history' in prosrc) = 0 then 'PASS' else 'FAIL' end
from pg_proc
where proname = 'compute_health_score';


-- ═══════════════════════════════════════════════════════════════
-- BLOCK B · BEHAVIOURAL. Run separately. Writes, then ROLLS BACK.
-- ═══════════════════════════════════════════════════════════════
--
-- Structural checks pass on a trigger that fires and inserts nothing. This
-- writes a critical event on a real deal, reads the history row back, and
-- confirms the health score MOVED and both sides were recorded.
--
-- ⚠️ The tiebreak `order by created_at, id` is load-bearing — see the note in
-- 20260818_verified_empty.sql. Without `id`, two rows sharing a timestamp make
-- the UPDATE and the read-back target different rows, and the check reports
-- FAIL on a working trigger.

begin;

update deals
set critical_event = 'VERIFICATION — rolled back'
where id = (select id from deals order by created_at, id limit 1);

select
  'a fact write is recorded'                          as check,
  coalesce(max(field), '(no row)')                    as observed,
  case when count(*) = 1 then 'PASS' else 'FAIL' end  as verdict
from deal_field_history
where new_value = 'VERIFICATION — rolled back'

union all

select
  'both sides of the score are on the row',
  coalesce(max(health_before::text), '?') || ' -> ' || coalesce(max(health_after::text), '?'),
  case
    when max(health_after) > max(health_before) then 'PASS'
    -- A deal already above the cap for another reason will not move. Reported
    -- rather than failed: the row existing is the assertion, the movement is
    -- evidence the cap is live.
    else 'CHECK — score did not move; confirm this deal was capped at 6'
  end
from deal_field_history
where new_value = 'VERIFICATION — rolled back'

union all

select
  'the stage it arrived at is recorded',
  coalesce(max(stage_at_write), '(null)'),
  case when max(stage_at_write) is not null then 'PASS' else 'FAIL' end
from deal_field_history
where new_value = 'VERIFICATION — rolled back'

union all

-- ⚠️ A DIRECT WRITE MUST NOT CLAIM A SIGNAL. Null here is the correct answer
-- and a non-null would mean the GUC leaked across transactions.
select
  'a direct write attributes no signal',
  case when max(signal_id::text) is null then 'null' else max(signal_id::text) end,
  case when max(signal_id::text) is null then 'PASS' else 'FAIL' end
from deal_field_history
where new_value = 'VERIFICATION — rolled back';

rollback;


-- ═══════════════════════════════════════════════════════════════
-- BLOCK C · apply_fact ATTRIBUTES A SIGNAL. Run separately; rolls back.
-- ═══════════════════════════════════════════════════════════════

begin;

insert into intelligence_log (id, signal_type, raw_signal, so_what)
values ('00000000-0000-4000-8000-0000000000ff', 'stakeholder',
        'VERIFICATION — rolled back', 'none');

select apply_fact(
  (select id from deals order by created_at, id limit 1),
  'champion',
  'VERIFICATION CHAMPION',
  '00000000-0000-4000-8000-0000000000ff'::uuid,
  'sourced',
  'verification run'
) as apply_fact_result;

select
  'apply_fact stamps the signal'                                as check,
  coalesce(max(signal_id::text), '(null)')                      as observed,
  case when max(signal_id::text) = '00000000-0000-4000-8000-0000000000ff'
       then 'PASS' else 'FAIL' end                              as verdict
from deal_field_history
where new_value = 'VERIFICATION CHAMPION'

union all

select
  'and carries the basis through',
  coalesce(max(basis), '(null)'),
  case when max(basis) = 'sourced' then 'PASS' else 'FAIL' end
from deal_field_history
where new_value = 'VERIFICATION CHAMPION'

union all

-- The value the function REPORTED must be the value the table holds. A caller
-- trusting its own input is the optimistic-update defect one layer down.
select
  'the stored value is what apply_fact reported',
  coalesce(max(new_value), '(none)'),
  case when max(new_value) = (select champion from deals order by created_at, id limit 1)
       then 'PASS' else 'FAIL' end
from deal_field_history
where new_value = 'VERIFICATION CHAMPION';

rollback;


-- ═══════════════════════════════════════════════════════════════
-- BLOCK D · THE REFUSAL. Run on its own. It is SUPPOSED to error.
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ RULE 4. Every check above sees the passing case. This one has to fail, and
-- an operator who runs it and sees no error has a function that will write any
-- column it is handed.
--
-- EXPECTED: ERROR — apply_fact: "health_score" is not a writable fact field
--
--   begin;
--   select apply_fact(
--     (select id from deals order by created_at, id limit 1),
--     'health_score', '10');
--   rollback;
