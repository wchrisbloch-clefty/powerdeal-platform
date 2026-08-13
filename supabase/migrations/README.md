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

## 6. Confirm every mutation actually changed the source

A mutation that silently fails to apply is **indistinguishable from a test that
cannot fail**. Both print the same thing: the suite still passes.

This is not hypothetical. Two mutations in this build appeared to pass and
neither result was real — a `perl` pattern whose indentation did not match, and
a second where the intended edit was a no-op. Rerun with the edit confirmed and
both failed immediately, which was the honest answer all along.

So the rule: before recording a mutation as "caught" or "not caught", check
that the file actually changed. `git diff --stat`, a `grep` for the new text, or
a printed before/after count. An unapplied mutation proves nothing, and
recording it as a pass is worse than not running it — it is a false negative
that reads as evidence.

The same reasoning as rule 4. A check that has only ever seen the passing case
is unproven, and a mutation that never ran is a check that has only ever seen
the passing case.

## 7. Assert against the packed output, never the constructed object

Building an object proves the object builds. Only the packed file says what a
reader gets.

Found by a mutation: a callout was asserted with `expect(callout(...))` to be
truthy and its fill checked against the declared palette, and a mutation that
put an undeclared grey on the text INSIDE it passed — because nothing ever
rendered the thing. The object was fine. The document would not have been.

So every artifact assertion packs first: the DOCX through `Packer`, the PPTX
through `pptx.write`, the PDF through Chromium, and then scans the bytes. If a
helper is not reachable from the normal render path, pack it on its own rather
than inspecting the value it returns.

Same class as rule 4. A check that only ever sees the constructed object is a
check that has only ever seen the passing case — the object is the input to the
step that can actually go wrong, not the output anyone reads.

## 8. Run the gate that fails the build, not the one that is quickest

`tsc --noEmit` passes on code that `next lint` rejects, and lint failure fails
the Vercel build. An unused type-only import is the specific case that bit this
build: tsc does not flag it, lint does, and it shipped red.

Before pushing: `tsc`, then `lint`, then `build`, then the suite. The first
three take under a minute together and the third is the only one that matches
what the platform actually runs.

Related, and the same shape as rules 4 and 7: a green check that is not the
check the deploy performs is a check that has only ever seen its own criteria.
