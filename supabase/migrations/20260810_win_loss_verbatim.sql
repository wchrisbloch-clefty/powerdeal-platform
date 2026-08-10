-- ═══════════════════════════════════════════════════════
-- MIGRATION — win-loss verbatim, and an atomic close
--
-- Two things, deliberately in one migration because they are one fact:
--
--   1. buyer_verbatim on win_loss_log — what the buyer ACTUALLY SAID about
--      why, in their words. Not a category selection. After a handful of
--      closes this is the most persuasive competitive asset in the system,
--      because it is buyers talking rather than a vendor claiming.
--
--   2. log_win_loss() — writes the outcome AND sets the deal's terminal stage
--      in a single transaction.
--
-- The function exists because of (2). Writing the win-loss row from the app and
-- then updating the deal in a second call leaves a window where win_loss_log
-- says the deal was lost while deals.stage still says Discovery — two records
-- disagreeing about the same fact, which is the exact defect class this build
-- has spent its length eliminating. A partial failure there is silent: no
-- error surfaces, the outcome is logged, and the pipeline still shows an open
-- deal forever.
--
-- See migrations/README.md for the checklist this satisfies.
-- ═══════════════════════════════════════════════════════

-- ── 1. The verbatim column ──────────────────────────────
alter table win_loss_log add column if not exists buyer_verbatim text;

comment on column win_loss_log.buyer_verbatim is
  'What the buyer actually said, in their words. Never a paraphrase and never a category — the value is that it is quotable.';

create index if not exists win_loss_deal_idx on win_loss_log(deal_id);
create index if not exists win_loss_outcome_idx on win_loss_log(outcome_type);

-- ── 2. Atomic close ─────────────────────────────────────
-- Returns the new win_loss_log row so the caller never has to re-read to find
-- out what happened.
create or replace function log_win_loss(
  p_deal_id        uuid,
  p_outcome_type   text,
  p_reason         text default null,
  p_lesson         text default null,
  p_competitor_won text default null,
  p_revisit_trigger text default null,
  p_buyer_verbatim text default null
)
returns win_loss_log as $$
declare
  d        deals;
  v_stage  text;
  v_row    win_loss_log;
begin
  select * into d from deals where id = p_deal_id;
  if not found then
    raise exception 'Deal % not found', p_deal_id;
  end if;

  if p_outcome_type not in ('No-Decision','Competitive','Disqualified','Won') then
    raise exception 'Invalid outcome_type: %', p_outcome_type;
  end if;

  -- The stage is DERIVED from the outcome, not chosen. A dropdown here would
  -- let the two disagree again, one field apart, which is the thing this
  -- function exists to prevent.
  v_stage := case when p_outcome_type = 'Won' then 'Closed-Won' else 'Archived' end;

  insert into win_loss_log
    (deal_id, company, outcome_type, reason, lesson, competitor_won,
     revisit_trigger, buyer_verbatim, user_id)
  values
    (d.id, d.company, p_outcome_type, p_reason, p_lesson, p_competitor_won,
     p_revisit_trigger, p_buyer_verbatim, d.user_id)
  returning * into v_row;

  -- Same transaction. Either both land or neither does.
  update deals set stage = v_stage, updated_at = now() where id = p_deal_id;

  return v_row;
end;
$$ language plpgsql;


-- ═══════════════════════════════════════════════════════
-- VERIFICATION — run AFTER the migration.
--
-- Returns rows with observed values, not a success message. Structural checks
-- alone would pass on a migration that added the column and never created the
-- function, so the last two checks exercise the BEHAVIOUR against a temporary
-- deal and then remove it.
-- ═══════════════════════════════════════════════════════
--
-- with structural as (
--   select
--     'column: buyer_verbatim' as check_name,
--     (c.data_type = 'text' and c.is_nullable = 'YES') as passed,
--     coalesce(c.data_type || ', nullable=' || c.is_nullable, 'COLUMN MISSING') as observed
--   from information_schema.columns c
--   where c.table_name = 'win_loss_log' and c.column_name = 'buyer_verbatim'
--
--   union all
--   select
--     'function: log_win_loss exists',
--     count(*) = 1,
--     'definitions: ' || count(*)::text
--   from pg_proc where proname = 'log_win_loss'
--
--   union all
--   select
--     'function sets a terminal stage',
--     bool_or(prosrc like '%Closed-Won%' and prosrc like '%Archived%'),
--     case when bool_or(prosrc like '%Closed-Won%')
--          then 'derives stage from outcome' else 'DOES NOT SET STAGE' end
--   from pg_proc where proname = 'log_win_loss'
-- )
-- select check_name, case when passed then 'PASS' else 'FAIL' end as result, observed
-- from structural order by result desc, check_name;
--
--
-- ── Behavioural: prove the close is actually atomic ──
-- Creates a throwaway deal, closes it, checks BOTH records agree, removes it.
-- Safe to run against live data: it touches only the row it creates.
--
-- do $$
-- declare
--   v_deal uuid;
--   v_stage text;
--   v_verbatim text;
--   v_count int;
-- begin
--   insert into deals (deal_id, company, vertical, stage, user_id)
--   values ('ZZ-VERIFY', 'Verification Co', 'Other', 'Discovery',
--           (select user_id from deals limit 1))
--   returning id into v_deal;
--
--   perform log_win_loss(
--     v_deal, 'No-Decision',
--     'Budget reallocated', 'Needed a critical event', null, 'FY28 budget cycle',
--     'We agreed it was better but nobody would own the capital this year.');
--
--   select stage into v_stage from deals where id = v_deal;
--   select buyer_verbatim, count(*) over () into v_verbatim, v_count
--     from win_loss_log where deal_id = v_deal;
--
--   raise notice 'deal stage after close  : % (expect Archived)', v_stage;
--   raise notice 'win_loss rows written   : % (expect 1)', v_count;
--   raise notice 'verbatim stored         : %', left(coalesce(v_verbatim,'NULL'), 40);
--
--   if v_stage <> 'Archived' then
--     raise exception 'FAIL: outcome logged but deal stage is %, not Archived', v_stage;
--   end if;
--   if v_verbatim is null then
--     raise exception 'FAIL: verbatim was not stored';
--   end if;
--   raise notice 'PASS: both records agree';
--
--   delete from win_loss_log where deal_id = v_deal;
--   delete from deals where id = v_deal;
--   raise notice 'cleaned up';
-- end $$;
--
--
-- ── Then read the asset itself ──
-- select
--   w.closed_at::date,
--   w.company,
--   w.outcome_type,
--   coalesce(w.competitor_won, '—') as lost_to,
--   coalesce(w.buyer_verbatim, '— no verbatim captured —') as buyer_said
-- from win_loss_log w
-- order by w.closed_at desc
-- limit 25;
--
-- Expect zero rows immediately after this migration. The table has never been
-- written to — it has existed in schema.sql since the beginning with no
-- application surface at all.
