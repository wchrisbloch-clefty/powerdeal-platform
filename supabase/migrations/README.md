# Migration checklist

Every migration in this directory must satisfy all five. They are not style
preferences — each one is here because its absence caused a real, silent
failure in this project.

## 1. Idempotent

`add column if not exists`, `create or replace function`, `drop … if exists`
before `create`. Re-running must be safe.

**Why:** `schema.sql` declared `pg_cron` and `pg_net` for months and neither was
installed. This project has a demonstrated record of migrations registering
without running, so "run it again to be sure" has to be a safe instruction
rather than a risky one.

## 2. Re-score existing rows when a derived function changes

If a migration changes a scoring function, a trigger, or anything that computes
a stored value, it **must** force a recompute on existing rows:

```sql
update <table> set updated_at = updated_at;
```

**Why:** triggers fire on insert or update. Rows written before the migration
keep the value the OLD function produced, so the stored column and the current
code disagree — and nothing raises a hand. The UI computes one number, the
database holds another, and whichever the reader happens to see is the one they
believe.

Observed on `critical_event`: a deal scoring 10.0 under the old function sat at
10.0 after the new cap was installed, until the no-op update forced it to 6.0.

## 3. Ship a verification query, not a success message

The migration must be accompanied by a query the operator runs afterwards that
returns **rows** — one per check, each with pass/fail and the value actually
observed.

Cover both:

- **structural** — the column exists, with the expected type and nullability
- **behavioural** — the change actually bites on real data

Structural checks alone are insufficient. A migration that adds a column and
leaves the function untouched passes every structural check ever written.

## 4. Negative-test the verification query

**A check that has only ever seen the passing case is unproven.**

Before shipping, break the thing deliberately and confirm the query reports
FAIL. Half-apply it — add the columns but revert the function — and confirm the
structural checks still PASS while the behavioural ones FAIL. That partial state
is what a "migration succeeded" message hides, and it is the state this project
was actually in with `pg_cron`.

This rule generalises beyond migrations. Three defects in this build were checks
that could only fail in one direction:

- `forAudience()` verified only against scenarios with zero external
  annotations — it was proven to block internal and never proven to pass
  external, so a filter returning `[]` would have passed everything
- a palette test using a luminance threshold classified Bloom green as a dark
  neutral (126 against a threshold of 128), which would have hidden a genuine
  palette addition behind a false pass
- the `critical_event` verification query, which reported four PASSes until it
  was run against a deliberately half-applied database

## 5. Run it against a real PostgreSQL before shipping

`psql` and a PostgreSQL server are available in the dev container. Build the
table, reproduce the pre-migration state, apply, apply again, and run the
verification. A migration that has never been executed is a draft.
