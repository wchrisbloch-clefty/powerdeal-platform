-- ═══════════════════════════════════════════════════════
-- MIGRATION — the utility layer, four levels
--
-- The old model was deal-bound and name-bound. Both assumptions break.
--
-- DEAL-BOUND: a market review of a prospect that is not in the pipeline has no
-- deal row, so utility resolution could not be reached at all. NOTHING IN THIS
-- MIGRATION JOINS deals. Level 0 answers from a two-letter state code, so
-- origination works on a company nobody has entered.
--
-- NAME-BOUND: the utility's name is not what decides the argument, its
-- structure is. A regulated IOU, a deregulated wires-only TDU, a muni, a
-- distribution co-op and an IPP are five different conversations.
--
-- SCOPE, DELIBERATELY SMALL: state market structure is stored because it is
-- ~50 rows that change once a decade and it makes origination work with zero
-- research. Utility detail is seeded ONLY for the utilities in the book and
-- added on demand. A comprehensive US utility reference would be thousands of
-- rows rotting continuously — the same failure mode as the maintained
-- battlecard library this build abandoned.
--
-- See migrations/README.md for the checklist this satisfies.
-- ═══════════════════════════════════════════════════════

-- ── Level 0 ──
--
-- Reference data, not user data: no user_id and no RLS scoping. Market
-- structure is a fact about a jurisdiction, identical for every user, and
-- scoping it per user would make it unreachable from an origination surface
-- that has no deal and therefore no owner to scope by.
create table if not exists state_market_structure (
  state       text primary key,
  structure   text not null check (structure in ('regulated','deregulated','hybrid')),
  -- Why it is not the obvious answer, where that is the case.
  note        text,
  updated_at  timestamptz default now()
);

-- ── Levels 1-3 ──
create table if not exists utilities (
  key                        text primary key,
  name                       text not null,
  state                      text not null,

  -- Level 1. Typed, never free text: the type is what changes the argument.
  type                       text not null
                             check (type in ('iou','muni','coop','wires-only','ipp')),

  -- Level 2. NULL is a real state — named but not yet characterised.
  -- Decides whether rate escalation is one story or splits into delivery and
  -- energy.
  service_model              text
                             check (service_model in ('vertically-integrated','wires-only','gnt-member')),
  iso                        text,

  -- Level 3. NULL IS THE HONEST DEFAULT, and every seeded utility ships with
  -- these unset. Inventing a standby charge to fill the field would be worse
  -- than the gap it filled: a pricing argument built on a fabricated tariff
  -- loses the deal on the day somebody reads the real one.
  standby_tariff             text,
  departing_load_charge      text,
  exit_fee                   text,
  minimum_take               text,

  -- Co-op only. NULL means UNVERIFIED, not absent — and unverified is treated
  -- as a live NO-GO candidate, because a co-op whose G&T contract nobody has
  -- checked is exactly the deal that flag exists for.
  all_requirements_contract  boolean,

  notes                      text,
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now()
);

create index if not exists utilities_state_idx on utilities(state);
create index if not exists utilities_type_idx on utilities(type);

-- ── Site-level territory ──
--
-- The account-level Utility Territory describes the company; the beachhead is
-- where the electrons and the tariff actually are, and on a national account
-- those are routinely different. Site wins in the resolver, so this column is
-- what makes "resolve from the beachhead site first" mean anything.
alter table deals add column if not exists beachhead_utility text;

-- ── Level 0 seed: 51 jurisdictions ──
--
-- on conflict do nothing, deliberately. Storing this is what lets a
-- reclassification be an UPDATE rather than a deploy, and re-running the
-- migration must not silently revert one. A corrected seed is applied by
-- hand, on purpose.
insert into state_market_structure (state, structure, note) values
  ('CT', 'deregulated', null),
  ('DC', 'deregulated', null),
  ('DE', 'deregulated', null),
  ('IL', 'deregulated', null),
  ('MA', 'deregulated', null),
  ('MD', 'deregulated', null),
  ('ME', 'deregulated', null),
  ('NH', 'deregulated', null),
  ('NJ', 'deregulated', null),
  ('NY', 'deregulated', null),
  ('OH', 'deregulated', null),
  ('PA', 'deregulated', null),
  ('RI', 'deregulated', null),
  ('TX', 'deregulated', 'ERCOT only. El Paso, and the parts of East Texas inside SPP or MISO, remain vertically integrated.'),
  ('CA', 'hybrid', 'Direct access is capped and largely closed; CCA load departure is the live mechanism, and departing-load charges follow it.'),
  ('GA', 'hybrid', 'Choice exists only for new loads above roughly 900 kW.'),
  ('MI', 'hybrid', 'Choice is capped near 10% of load.'),
  ('MT', 'hybrid', 'Choice retained by large customers only.'),
  ('NV', 'hybrid', 'Large customers may exit via an approved impact fee.'),
  ('OR', 'hybrid', 'Non-residential choice only, on capped schedules.'),
  ('VA', 'hybrid', 'Limited choice for large loads and for aggregated 100% renewable supply.'),
  ('AK', 'regulated', null),
  ('AL', 'regulated', null),
  ('AR', 'regulated', null),
  ('AZ', 'regulated', null),
  ('CO', 'regulated', null),
  ('FL', 'regulated', null),
  ('HI', 'regulated', null),
  ('IA', 'regulated', null),
  ('ID', 'regulated', null),
  ('IN', 'regulated', null),
  ('KS', 'regulated', null),
  ('KY', 'regulated', null),
  ('LA', 'regulated', null),
  ('MN', 'regulated', null),
  ('MO', 'regulated', null),
  ('MS', 'regulated', null),
  ('NC', 'regulated', null),
  ('ND', 'regulated', null),
  ('NE', 'regulated', 'Entirely public power — no investor-owned utility in the state.'),
  ('NM', 'regulated', null),
  ('OK', 'regulated', null),
  ('SC', 'regulated', null),
  ('SD', 'regulated', null),
  ('TN', 'regulated', 'TVA territory — distributors buy wholesale under long-term contracts.'),
  ('UT', 'regulated', null),
  ('VT', 'regulated', null),
  ('WA', 'regulated', null),
  ('WI', 'regulated', null),
  ('WV', 'regulated', null),
  ('WY', 'regulated', null)
on conflict (state) do nothing;


-- ── Levels 1-2 seed: the utilities in the book, and only those ──
--
-- Six rows, not six thousand. Everything else resolves at Level 0 from its
-- state until somebody has a reason to add it.
--
-- LEVEL 3 IS DELIBERATELY NULL ON EVERY ROW. Standby and departing-load terms
-- are not known here, and a seeded guess would be a fabricated number inside a
-- pricing argument. Null makes the resolver name it as a gap, which is the
-- correct output.
--
-- TAXONOMY NOTE: 'wires-only' appears in both the type and the service_model
-- sets. CenterPoint and Delmarva are investor-owned AND wires-only, so they are
-- seeded as type 'iou' with service_model 'wires-only' — ownership at Level 1,
-- structure at Level 2, which keeps the two levels distinguishable. Whether
-- type should carry 'wires-only' at all is a taxonomy call, flagged rather than
-- silently resolved.
insert into utilities (key, name, state, type, service_model, iso, notes) values
  ('pso', 'Public Service Company of Oklahoma', 'OK', 'iou', 'vertically-integrated', 'SPP',
   'AEP operating company in a regulated state.'),
  ('sdge', 'San Diego Gas & Electric', 'CA', 'iou', 'vertically-integrated', 'CAISO',
   'CCA load departure is live in this territory; departing-load charges follow it. Standby schedule not yet read.'),
  ('centerpoint', 'CenterPoint Energy Houston Electric', 'TX', 'iou', 'wires-only', 'ERCOT',
   'TDU inside ERCOT. The bill splits: regulated delivery, competitive energy from a REP. An all-in $/MWh is a number this customer does not recognise.'),
  ('delmarva', 'Delmarva Power & Light', 'DE', 'iou', 'wires-only', 'PJM',
   'Serves Delaware and the Maryland Eastern Shore; state column carries DE only.'),
  ('dominion', 'Dominion Energy Virginia', 'VA', 'iou', 'vertically-integrated', 'PJM',
   'Virginia is a hybrid market — limited choice for large loads. Whether this customer can buy competitively is a question, not an assumption.'),
  ('pge', 'Pacific Gas and Electric', 'CA', 'iou', 'vertically-integrated', 'CAISO',
   'Heavy CCA departure across the territory. Standby schedule not yet read.')
on conflict (key) do nothing;


-- ═══════════════════════════════════════════════════════
-- VERIFICATION — run AFTER the migration.
-- Rows with observed values, not a success message.
-- ═══════════════════════════════════════════════════════
--
-- with structural as (
--   select 'table: state_market_structure' as check_name,
--          count(*) = 1 as passed,
--          'tables found: ' || count(*)::text as observed
--   from information_schema.tables where table_name = 'state_market_structure'
--
--   union all
--   select 'table: utilities', count(*) = 1, 'tables found: ' || count(*)::text
--   from information_schema.tables where table_name = 'utilities'
--
--   union all
--   select 'deals carries a site-level territory',
--          count(*) = 1,
--          case when count(*) = 1 then 'deals.beachhead_utility present'
--               else 'MISSING — site-first resolution cannot work' end
--   from information_schema.columns
--   where table_name = 'deals' and column_name = 'beachhead_utility'
--
--   union all
--   -- THE REACHABILITY REQUIREMENT, asserted structurally. If either reference
--   -- table gained a foreign key to deals, a market review of an un-entered
--   -- prospect would have no path to Level 0 and origination would get nothing.
--   select 'the utility layer is reachable WITHOUT a deal',
--          count(*) = 0,
--          case when count(*) = 0 then 'no foreign keys to deals — resolvable from a state alone'
--               else 'DEAL-BOUND: ' || count(*)::text || ' fk(s) to deals' end
--   from pg_constraint
--   where confrelid = 'deals'::regclass
--     and conrelid in ('state_market_structure'::regclass, 'utilities'::regclass)
--
--   union all
--   select 'every US jurisdiction has a market structure',
--          count(*) = 51,
--          'rows: ' || count(*)::text || ' (expect 51 — 50 states + DC)'
--   from state_market_structure
--
--   union all
--   select 'all three structures are represented',
--          count(distinct structure) = 3,
--          'distinct structures: ' || string_agg(distinct structure, ', ' order by structure)
--   from state_market_structure
--
--   union all
--   select 'the book''s utilities are seeded',
--          count(*) = 6,
--          'utilities: ' || count(*)::text || ' — ' || string_agg(key, ', ' order by key)
--   from utilities
--
--   union all
--   -- The gap must be REAL. A seeded standby figure would be a fabricated
--   -- number inside a pricing argument, which is worse than the gap it filled.
--   select 'level 3 is honestly empty, not guessed',
--          count(*) = 0,
--          case when count(*) = 0 then 'no seeded tariff figures — every standby charge is a named gap'
--               else count(*)::text || ' seeded tariff value(s) — CHECK THE SOURCE' end
--   from utilities
--   where standby_tariff is not null or departing_load_charge is not null
--      or exit_fee is not null or minimum_take is not null
-- )
-- select check_name, case when passed then 'PASS' else 'FAIL' end as result, observed
-- from structural order by result desc, check_name;
--
--
-- ── Behavioural: Level 0 resolves with no deal in the database at all ──
--
-- A DO block is one statement, so a raise inside it undoes everything it
-- created. Verified against a real PostgreSQL, negative cases included.
--
-- do $$
-- declare
--   v_structure text;
--   v_note      text;
--   v_type      text;
--   v_arc       boolean;
--   v_found     boolean;
-- begin
--   -- LEVEL 0 FROM A STATE ALONE. No deal, no account, no research.
--   select structure into v_structure from state_market_structure where state = 'TX';
--   raise notice 'level 0, TX, no deal row        : %', v_structure;
--   if v_structure is null then
--     raise exception 'FAIL: Level 0 unreachable from a state alone — origination gets nothing';
--   end if;
--
--   -- A hybrid state must carry its caveat, or "deregulated enough" gets assumed.
--   select structure, note into v_structure, v_note from state_market_structure where state = 'CA';
--   raise notice 'level 0, CA                     : % — %', v_structure, coalesce(v_note, 'NO NOTE');
--   if v_structure <> 'hybrid' or v_note is null then
--     raise exception 'FAIL: hybrid states must carry the caveat that makes them hybrid';
--   end if;
--
--   -- LEVEL 1-2 for a utility in the book.
--   select type into v_type from utilities where key = 'centerpoint';
--   raise notice 'level 1, CenterPoint            : %', v_type;
--   select count(*) = 1 into v_found from utilities
--    where key = 'centerpoint' and service_model = 'wires-only';
--   if not v_found then
--     raise exception 'FAIL: wires-only structure lost — rate escalation would be told as one story';
--   end if;
--
--   -- A CO-OP WITH AN UNVERIFIED CONTRACT. Null must survive as null: unknown
--   -- is a live NO-GO candidate, and coercing it to false would silently clear
--   -- the largest qualification-stage risk in the model.
--   insert into utilities (key, name, state, type, service_model)
--   values ('zz-test-coop', 'Test Distribution Co-op', 'OK', 'coop', 'gnt-member');
--   select all_requirements_contract into v_arc from utilities where key = 'zz-test-coop';
--   if v_arc is not null then
--     raise exception 'FAIL: an unverified all-requirements contract defaulted to %, not unknown', v_arc;
--   end if;
--   raise notice 'co-op all-requirements, unset   : unknown (correct — a live NO-GO candidate)';
--
--   -- An undefined utility type must be refused rather than stored.
--   begin
--     insert into utilities (key, name, state, type) values ('zz-bad', 'X', 'OK', 'municipal');
--     raise exception 'FAIL: an undefined utility type was accepted';
--   exception when check_violation then
--     raise notice 'undefined utility type rejected : correct';
--   end;
--
--   -- And an undefined service model.
--   begin
--     insert into utilities (key, name, state, type, service_model)
--     values ('zz-bad2', 'X', 'OK', 'iou', 'vertical');
--     raise exception 'FAIL: an undefined service model was accepted';
--   exception when check_violation then
--     raise notice 'undefined service model rejected: correct';
--   end;
--
--   -- And an undefined market structure.
--   begin
--     insert into state_market_structure (state, structure) values ('ZZ', 'partial');
--     raise exception 'FAIL: an undefined market structure was accepted';
--   exception when check_violation then
--     raise notice 'undefined structure rejected    : correct';
--   end;
--
--   raise notice 'PASS: level 0 reachable dealless, levels 1-2 typed, unknown stays unknown';
--
--   delete from utilities where key like 'zz-%';
--   raise notice 'cleaned up';
-- end $$;
--
--
-- ── Then read the state ──
-- select s.state, s.structure, coalesce(u.name, '— no utility seeded —') as utility,
--        coalesce(u.type, '—') as type, coalesce(u.service_model, '— not characterised —') as service_model,
--        coalesce(u.standby_tariff, '— UNQUANTIFIED: the largest silent pricing risk —') as standby
-- from state_market_structure s
-- left join utilities u on u.state = s.state
-- where s.state in ('TX','CA','OK','VA','DE')
-- order by s.state, utility;
