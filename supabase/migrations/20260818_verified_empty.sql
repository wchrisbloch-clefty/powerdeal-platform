-- ═══════════════════════════════════════════════════════════════
-- ASKED-AND-FOUND-NOTHING, RECORDED RATHER THAN INFERRED
-- ═══════════════════════════════════════════════════════════════
--
-- The gap system draws a field's state from its column type, which produces a
-- statement that is FALSE about this operator's book:
--
--   · a null text field  -> 'unknown' -> "not checked"
--   · a false boolean    -> 'gap'     -> "not recorded"
--
-- So Economic Buyer reads "not checked" on all 21 deals, meaning nobody looked.
-- Somebody did look. There is no economic buyer named on any of them yet, and
-- the platform is asserting something untrue about its own operator's
-- diligence. A null genuinely cannot distinguish the two — which is exactly
-- why the distinction has to be RECORDED instead of inferred.
--
-- ══ ONE ARRAY, NOT TEN BOOLEANS ══
--
-- `verified_empty` holds the field keys the operator has confirmed are
-- genuinely empty. Ten boolean columns would each need a migration, and any one
-- of them could drift out of step with the others; one array adds a field for
-- free and has nothing to drift against.
--
-- ⚠️ text[], NOT jsonb. Deliberately the same discipline that kept pacing
-- position out of a jsonb blob: jsonb would slip past every assertion this
-- repo has about numeric columns while happily holding a number. A text array
-- of field keys cannot meaningfully hold one.
--
-- ══ WHAT THIS DOES NOT DO ══
--
-- IT DOES NOT TOUCH SCORING. compute_health_score() and meddpiccResult() never
-- read this column. It changes what the gap system is allowed to CLAIM, not
-- what scores.
--
-- IT GATES NOTHING. Optional, opt-in per field, default empty. A deal nobody
-- ever touches behaves exactly as it does today, because the default is
-- 'unchecked' and that is true of everything until the operator says otherwise.
--
-- IDEMPOTENT. Safe to re-run. Touches no row's data — the default applies to
-- existing rows without rewriting them.

-- ── 1. The column ──
alter table deals
  add column if not exists verified_empty text[] not null default '{}';

comment on column deals.verified_empty is
  'MEDDPICC/Spine field keys the operator has confirmed are genuinely empty. '
  'Turns "not checked" into "not recorded" for those fields in the gap system. '
  'Never read by scoring. Opt-in per field; empty is the honest default.';

-- ── 2. An index only if it earns one ──
-- Deliberately none. This column is read with the row it belongs to and is
-- never a filter predicate. An index here would be a declaration that alters
-- no behaviour — the same thing the deleted --sp-* tokens and the deleted
-- border-color class group were.

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION — run this AFTER applying. Rows, not a success message.
-- ═══════════════════════════════════════════════════════════════
--
-- Structural checks alone would pass on a column that no code reads, so the
-- behavioural block below actually writes, reads back and reverts.

-- ── STRUCTURAL ──
select
  'column exists'                                   as check,
  count(*)::text                                    as observed,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from information_schema.columns
where table_name = 'deals' and column_name = 'verified_empty'

union all

select
  'is a text array, not jsonb',
  coalesce(max(udt_name), '(absent)'),
  case when max(udt_name) = '_text' then 'PASS' else 'FAIL' end
from information_schema.columns
where table_name = 'deals' and column_name = 'verified_empty'

union all

select
  'not null with an empty default',
  coalesce(max(is_nullable || ' / ' || coalesce(column_default, 'none')), '(absent)'),
  case
    when max(is_nullable) = 'NO' and max(column_default) like '%{}%' then 'PASS'
    else 'FAIL'
  end
from information_schema.columns
where table_name = 'deals' and column_name = 'verified_empty'

union all

-- ⚠️ EVERY EXISTING ROW MUST HAVE THE DEFAULT, NOT NULL. A null here would
-- read as "unknown" in a column whose whole purpose is to distinguish two
-- kinds of unknown.
select
  'every existing row defaults to empty',
  count(*) filter (where verified_empty is null)::text || ' null of ' || count(*)::text,
  case when count(*) filter (where verified_empty is null) = 0 then 'PASS' else 'FAIL' end
from deals

union all

-- ── BEHAVIOURAL ──
-- Writes a marker, reads it back, and reverts. If this returns FAIL the column
-- exists and does not work, which is the state a structural-only check hides.
select
  'a marker round-trips',
  observed,
  case when observed = 'economic_buyer' then 'PASS' else 'FAIL' end
from (
  with target as (
    select id from deals order by created_at limit 1
  ),
  marked as (
    update deals set verified_empty = array['economic_buyer']
    where id in (select id from target)
    returning id, verified_empty
  ),
  readback as (
    select coalesce(verified_empty[1], '(empty)') as observed from marked
  ),
  reverted as (
    update deals set verified_empty = '{}'
    where id in (select id from target) returning 1
  )
  select observed from readback, reverted limit 1
) round_trip

union all

-- Scoring must be untouched by the marker. Asserted against the FUNCTION, not
-- against a comment claiming it: rule 2's lesson is that a stored value and the
-- code that computes it drift silently.
select
  'health scoring does not read the column',
  case when position('verified_empty' in prosrc) > 0 then 'reads it' else 'does not' end,
  case when position('verified_empty' in prosrc) = 0 then 'PASS' else 'FAIL' end
from pg_proc
where proname = 'compute_health_score';
