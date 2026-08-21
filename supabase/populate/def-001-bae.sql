-- ═══════════════════════════════════════════════════════════════
-- POPULATE DEF-001 BY HAND
-- ═══════════════════════════════════════════════════════════════
--
-- Data, not schema. Run it once, edit the placeholders first.
--
-- ⚠️ RUN 20260821_deal_field_history.sql FIRST IF YOU WANT THE HISTORY.
-- Without it this still works and writes nothing to `deal_field_history` —
-- which would be indistinguishable from a deal that never changed. With it,
-- every line below leaves a row saying what the score was before and after.
--
-- ⚠️ EVERY VALUE MARKED «LIKE THIS» IS YOURS TO SET. They are pre-filled from
-- prior account work and are the operator's to correct. Nothing here was
-- researched by the platform.
--
-- ⚠️ WHY THIS IS SQL RATHER THAN CLICKING. As of this commit the application
-- can write exactly two fields on an existing deal — `stage` and
-- `verified_empty`. Everything below has no write surface. The capture bridge
-- changes that; this exists so the book does not wait for it.
--
-- IT IS A SINGLE STATEMENT. One UPDATE means one trigger pass, so
-- `compute_health_score` runs once against the finished row rather than
-- climbing through six intermediate states. Set what you know, delete the lines
-- you do not.
--
-- ⚠️ A CONSEQUENCE WORTH KNOWING BEFORE YOU READ THE HISTORY. Every field
-- written by one statement gets its own row, and all of those rows carry the
-- SAME `health_before` and `health_after`, because the score moved once for the
-- whole batch. The rows say which facts arrived together; they do not
-- apportion the movement between them, and nothing here can — the score is a
-- function of the finished row, not a sum of per-field contributions.
--
-- If you want a specific fact's effect isolated, write it in its own statement.

begin;

-- ── Confirm you are about to write the row you think you are ──
-- Read this BEFORE the update. If it returns no rows, the deal_id is wrong and
-- the UPDATE below would silently affect nothing — the shape of every quiet
-- failure in this build.
select deal_id, company, stage, health_score, meddpicc_score,
       champion, economic_buyer, critical_event, beachhead_site
from deals
where deal_id = 'DEF-001';

update deals set

  -- ── MEDDPICC ─────────────────────────────────────────────────
  -- Champion. +1.0 health directly, and one MEDDPICC point.
  -- The role in parentheses is not parsed by anything; it is there because
  -- "Trevor Reitsma" alone stops meaning anything in four months.
  champion = «'Trevor Reitsma (Energy & Utilities Manager)'»,

  -- Economic buyer. +1.5 health — the single largest non-MEDDPICC term.
  -- ⚠️ THE NAME OF THE PERSON WHO SIGNS, not the department. If you do not know
  -- it, DELETE THIS LINE rather than writing a title: a placeholder here scores
  -- 1.5 points for knowledge you do not have, and the deal reports healthier
  -- than it is.
  economic_buyer = «'FULL NAME, TITLE — or delete this line'»,

  -- Identified pain. MEDDPICC point. Free text; no length limit that matters.
  identified_pain = «'What actually hurts today, in their words'»,

  -- Decision criteria. MEDDPICC point. What they will judge on.
  decision_criteria = «'e.g. uptime guarantee, $/kWh vs current, permitting risk'»,

  -- Decision process. MEDDPICC point. The paper path, including who signs and
  -- what the gate is. This is the field most often knowable before the people.
  decision_process = «'e.g. site GM recommends -> corporate capital committee -> CFO signs; FY gate in Q1'»,

  -- Metrics known. Boolean, MEDDPICC point. TRUE only if you can state the
  -- number they are measured on. "They care about cost" is not a metric.
  metrics_known = «false»,

  -- ── THE TWO CAPS AT 6 ────────────────────────────────────────
  -- Either one absent holds health at 6 no matter what else is true. This is
  -- the field nothing in the application could set until this commit.
  --
  -- ⚠️ THIS IS THE HIGHEST-LEVERAGE LINE IN THE FILE — *IF THE OTHER CAP IS
  -- ALREADY SATISFIED*. On a deal that is multi-threaded and otherwise scoring
  -- 10, adding this moves health 6.0 -> 10.0; verified against PostgreSQL
  -- 16.13. On a deal that is NOT multi-threaded it moves nothing, because the
  -- second cap holds it at 6 regardless — which is what happened on the first
  -- run of this file, and is why the claim is written conditionally.
  critical_event = «'FY26 capex expansion — $135M across Austin TX and Hudson NH, announced May 2026'»,

  -- The date the forcing function bites. Null is legitimate and is rendered as
  -- "no date on record" rather than guessed at — do not invent one.
  critical_event_date = «null»,   -- e.g. '2026-10-01'

  -- Multi-threaded. The OTHER cap at 6. True only if you have a real second
  -- relationship, not a second name on an email.
  multi_threaded = «false»,

  -- ── SITE AND TERRITORY ───────────────────────────────────────
  -- Beachhead site. Where the first system actually goes.
  beachhead_site = «'Electronic Systems San Diego'»,

  -- ⚠️ BEACHHEAD UTILITY WINS OVER THE ACCOUNT-LEVEL `utility` IN THE RESOLVER.
  -- The account field describes the company; the beachhead is where the tariff
  -- actually is, and the tariff is what the economics run on.
  beachhead_utility = «'SDG&E'»,

  -- ── SIZE ─────────────────────────────────────────────────────
  -- ⚠️ 116 IS ILLUSTRATIVE. It is a sizing estimate, not a measured load, and
  -- nothing in the schema can carry that distinction on the column itself.
  -- The `note` on the history row below is where it is recorded. If you would
  -- not defend this number in front of their facilities engineer, set it to
  -- null instead — an absent size renders as a stated gap, which is true.
  size_mw = «116»,

  -- Deal value. Null until there is a real number; the platform never
  -- estimates one.
  size_usd_m = «null»

where deal_id = 'DEF-001';

-- ── Record the basis for the estimate ────────────────────────────
-- ⚠️ THE ONLY PLACE size_mw's PROVENANCE LIVES. The column holds a number and
-- a number renders identically whether it was measured or guessed. This row is
-- what stops 116 reading as a fact about San Diego in six months.
--
-- Safe to skip if you set size_mw to null. Fails harmlessly if the history
-- migration has not been applied.
update deal_field_history
set basis = 'illustrative',
    note  = 'Sizing estimate from prior account work, not a measured load. '
            'Not to be quoted to the customer as their number.'
where deal_id = (select id from deals where deal_id = 'DEF-001')
  and field = 'size_mw'
  and recorded_at > now() - interval '1 minute';

-- ── Read back what actually landed ───────────────────────────────
-- ⚠️ NOT WHAT WAS ASKED FOR. Every field above is nullable and a typo in a
-- placeholder writes a plausible wrong value without complaint.
select deal_id, stage,
       meddpicc_score, health_score,
       champion, economic_buyer, critical_event, beachhead_site, beachhead_utility, size_mw
from deals
where deal_id = 'DEF-001';

-- What the audit recorded, and what the score was doing while each fact was
-- missing. `health_before` on the critical_event row is the number this deal
-- had been reporting with confidence.
select field, old_value, new_value, health_before, health_after, stage_at_write, basis
from deal_field_history
where deal_id = (select id from deals where deal_id = 'DEF-001')
order by recorded_at desc;

-- ⚠️ NOTHING IS WRITTEN UNTIL YOU CHANGE THIS. Read the two selects above
-- first. `commit;` when they say what you meant.
rollback;
