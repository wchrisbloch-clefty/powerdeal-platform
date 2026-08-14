# Migration checklist

Every migration in this directory must satisfy all thirteen. They are not style
preferences — each one is here because its absence caused a real, silent
failure in this project.

Rules 4 and 6 through 13 generalise past migrations to anything this build ships;
they are kept here because this is the file that gets read before something goes
out.

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

## 9. A health surface must not depend on the mechanism it reports on

If a status endpoint reads its answer through the same write path, the same
client, or the same table it exists to monitor, then the failure it is built to
catch is the failure that silences it.

`/api/agents/status` reported six idle jobs. The jobs were running. What had
broken was the `app_state` write that records a run — and the status surface
computed "idle" by reading `app_state`, so a total write failure and six jobs
that genuinely had not run produced byte-identical output. The surface was not
wrong about its inputs; it had no inputs left, and it said "idle" anyway.

The fix has two halves, and the second is the rule:

- **Fail the write loudly.** `supabase-js` RESOLVES with `{ error }` rather than
  throwing, so `await` alone swallows it. Check `error` and throw.
- **Report the mechanism separately from what it measures.** The write-failure
  flag lives under its OWN key (`agent_runs_write_failure`, not the runs key),
  so "we cannot record runs" and "no runs happened" are different readings on
  the page. A surface that cannot distinguish them is reporting on itself.

A monitoring fix is not in effect until it ships — the deployment-layer version
of this rule. The eight deployments that failed on `vercel.json` (rule 11)
included the `/api/agents/status` fix itself, so the surface that would have
reported the problem was sitting in the unreleased pile with everything else.
Nothing was watching, and the thing built to watch was the thing not running.

Applies to every health read, not just cron: a "brain ready" flag inferred from
the same loader that failed, a skill-coverage count computed from a directory
listing the loader could not read, a feed-health probe whose parser throws on
the exact malformed body it exists to detect — each is this rule.

The test that proves it is the negative one from rule 4: break the mechanism and
confirm the surface says the mechanism is broken, rather than reporting a plausible
number about the thing downstream of it.

## 10. A parameterized test over an empty set is a test that cannot fail

`it.each([])` registers zero tests. The suite reports green, the count goes
*down* by however many assertions just vanished, and nothing anywhere says a
check stopped running.

Found when the last outstanding skill file landed. Seventeen skills were
`awaited`; the suite ran two `it.each(awaited)` blocks proving the no-hard-gate
degradation path — that an unavailable skill still produces a block naming its
own absence. All seventeen arrived, `awaited` became `[]`, and both blocks
silently stopped asserting anything. The degradation path lost its coverage at
the exact moment it lost its live case, which is the moment it becomes most
likely to rot unnoticed.

Rule 4 wearing a different mask: a check that has only ever seen the passing
case is unproven, and a check that no longer runs at all has seen nothing.

Two things follow:

- **Guard every `it.each`.** A sibling assertion that the array is non-empty,
  with a message saying what the block would otherwise prove. One line, and it
  is the only thing standing between a shrinking data set and silent coverage
  loss.
- **When a branch loses its last live case, test it directly.** Extract the pure
  part and call it. `awaitedSkillReason()` and `unavailableSkillBlock()` are
  exported for this reason and no other — production never reaches them now,
  and they still have to be right the day something fails to sync.

Watch the test COUNT across a commit that changes fixture data. A drop with no
deletions in the diff is this rule firing.

## 11. Some gates do not exist locally — encode them as tests

Rule 8 says run the gate that fails the build. This is the sharper case: for
some failures **there is no local gate to run**, and the only defence is a test
that encodes what the platform accepts.

Eight consecutive deployments failed on one line. A `_comment` key was added
inside `crons[1]` of `vercel.json` to carry the reasoning for moving the recap
to Friday — JSON has no comments, so it went in as a property. Vercel's schema
sets `additionalProperties: false`:

```
Error: Invalid vercel.json - `crons[1]` should NOT have additional
property `_comment`. Please remove it.
```

`tsc`, `next lint`, `next build` and the full suite passed on every one of those
eight commits. None of them reads that file's schema. The rejection happens
**before the build starts**, so there were no build logs in the usual sense and
nothing locally could have gone red.

The cost was not a red build — it was eight commits of finished work, including
the `/api/agents/status` fix, sitting unreleased while every local signal said
green. Vercel keeps the last good deployment live on failure, so production
quietly served an older commit and the app looked fine.

What follows:

- **Config the platform parses is code, and gets a test.** `vercel.json` now has
  one asserting the top-level key set and that every cron object carries exactly
  `path` and `schedule`. Mutation-proven by reinserting the exact `_comment`.
- **Never put prose in a config file the platform validates.** JSON has no
  comments for a reason. Reasoning belongs in the test that asserts the value —
  a better home anyway, because a test fails when the reasoning stops being true.
- **Check the deployment state after pushing, not just the local gates.** Green
  local + stale production is a silent state, and it is the same shape as rule 9:
  the surface that reported success was not reading the thing that failed.

## 12. A forcing function must be satisfiable — verify the resolution, not just the trigger

A test that fails until somebody does X is only useful if doing X makes it pass.
Verify both ends before shipping one.

`PowerBD.pdf` is retired and its registry entry exists only while §6 still names
it. A test fails once §6 drops the name, telling whoever reads it to delete the
entry. The trigger worked on the first try. Then the *resolution* was simulated —
§6 edited, entry deleted — and **four other tests went red**, because they
assumed a retired entry existed. Following the instruction the suite gave would
have produced a redder suite than ignoring it.

That is a trap, not a forcing function. The fix was one explicit state pin
holding the exact counts, with the detail blocks guarded (`describe.skipIf`)
rather than requiring their sets to be non-empty — so the sets can empty out
legitimately while one assertion still holds the shape and cannot go vacuous.

So: simulate the end state, not just the trigger. Rule 4 asks whether the check
can fail; this asks whether it can be made to pass again.

## 13. Never `git checkout` a file with uncommitted work

`git checkout <file>` reverts to HEAD and there is no undo. It has now destroyed
uncommitted work in this project **twice** — once during mutation testing, once
restoring after a simulated end-state run, taking a full set of new test blocks
that then had to be rebuilt from scratch.

Both times the intent was "undo my temporary edit", and both times the file also
held work that was not temporary.

Use a copy instead. Before any mutation or simulation:

```sh
cp <file> "$SCRATCH/<file>.bak"   # …mutate, test…
cp "$SCRATCH/<file>.bak" <file>   # restore
diff -q "$SCRATCH/<file>.bak" <file>   # and prove it
```

The `diff -q` matters as much as the restore — rule 6 says confirm a mutation
applied, and this is the same claim in reverse: confirm it was undone.
