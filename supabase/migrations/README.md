# Migration checklist

Every migration in this directory must satisfy all seventeen. They are not style
preferences — each one is here because its absence caused a real, silent
failure in this project.

Rules 4 and 6 through 17 generalise past migrations to anything this build ships;
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

## 13. Commit before mutating. Always. No exceptions.

`git checkout <file>` reverts to HEAD and there is no undo. It has now destroyed
uncommitted work in this project **four times** — mutation testing, restoring
after a simulated end-state run, and twice in a single design-token batch, the
second of those less than an hour after the first.

Every time the intent was "undo my temporary edit". Every time the file also
held work that was not temporary.

This rule used to say *use a scratch copy and `diff -q` to prove the restore*.
That advice is fine and it did not work, which is the more useful fact. It
failed because the moment it has to reach is **inside the mutation loop** —
a tight `mutate → test → restore` cycle, often a single shell line per
mutation, written while thinking about the mutation rather than about the
file. A rule that requires remembering an extra step at exactly the moment
attention is elsewhere is a rule that will be skipped, and it was: the loop
reached for `git checkout` both times because `git checkout` is what fits on
that line.

So the rule is now the thing that makes the loop safe **without** requiring
anything of it:

> **Commit all real work before the first mutation. Then `git checkout` is
> always correct, because there is never anything in the file but the
> mutation.**

This inverts the discipline. The old rule asked the risky operation to be
performed carefully; the new one removes the risk from the operation. Nothing
has to be remembered mid-loop, no scratch directory has to be managed, and the
restore stays the one-liner that will get written anyway.

```sh
git commit -am "…"          # everything real, FIRST
# now the loop is safe:
sed -i 's/…/…/' file.ts     # mutate
grep -c 'mutated form' file.ts   # rule 6: confirm it applied
npm test
git checkout -- file.ts     # restore — cannot lose anything
```

Corollary, and it is where both recent failures actually happened: **a commit
before the loop only protects work that existed before the loop.** Fixing
something mid-loop and then continuing to mutate re-opens the same hole. Any
real edit made after the first mutation gets its own commit before the next
one.

`git status --short` at the end of the loop, expecting a clean tree, is the
cheap check that the whole cycle behaved.

## 14. Never trust a declared type over the bytes

A `format`, `contentType`, `encoding` or file extension is a **claim about**
the data, made by whoever named it. The data itself is the data. When the two
disagree, the declaration is the one that is wrong — and a declaration is
believed silently, which is what makes it dangerous.

`PowerBD.pdf` was not a PDF. It was a ZIP with a `.pdf` extension holding page
images of a twelve-versions-stale copy of the system prompt. The registry had a
`format: 'pdf'` field, and it would have routed the file to a PDF path where a
PDF parser fails on a ZIP with a confident error **about PDF structure** — a
precise answer to the wrong question, which is worse than no answer, because it
sends the reader looking at the wrong layer.

The field is gone. `looksBinary()` sniffs what was actually read — a NUL byte,
or a wall of U+FFFD replacement characters — and returns one verdict for a ZIP,
a PDF, a JPEG or a truncated download: not text, keep it out of the prompt. It
runs on every load, so there is no dead branch and nothing to trust.

Generalises past files. Any time code branches on a *declared* property when the
*actual* property is available, prefer the actual one:

- Content type from a header vs. the body you received
- A `type` discriminator on a record vs. the fields present on it
- An `Accept` header vs. what the client can actually render
- A schema version field vs. the shape of the payload

Corollary, and the reason this is its own rule rather than a footnote: a guard
built on the declaration will pass its own tests. It is internally consistent —
it correctly does the wrong thing. Only a test that feeds it real mismatched
bytes finds it, which is rule 4 pointed at the input rather than the output.

## The runbook: triggering a Vercel cron by hand

Vercel's **Cron Jobs** settings page has a **Run** button per job. That is the
trigger path — no `curl`, no `CRON_SECRET`, no Deployment Protection bypass.
Use it before waiting a day to learn whether a fix worked.

Two Hobby-plan facts worth knowing when reading timestamps:

- **2 cron jobs maximum** on Hobby. This project registers three, so confirm
  all of them appear on that page rather than assuming registration succeeded.
- **~1 hour flexible window.** A job scheduled `0 10 * * *` may fire anywhere in
  that hour, so a run time that looks "wrong" by minutes is not evidence of a
  fault.

Crons are registered from the **last successful production deployment**. Eight
consecutive failed deployments meant production kept running an older
`vercel.json` — a fix can be merged, green, and still not scheduled.

## 15. A metric's name is an assertion about what produced it

`skipped_cached: 46` against a table that had never held a row.

```ts
const fresh = unseen.slice(0, maxItems);
result.skipped_cached = raw.length - fresh.length;   // ← two causes, one name
```

106 items fetched, 60 taken by the `maxItems` cap, 46 dropped by the slice — and
counted as "already seen". The number was correct. The name was a claim about
its cause, and the claim was false. It aimed two people at the dedupe path for a
day while the actual failure was a missing column three lines further down.

A metric is read as evidence. `skipped_cached` does not say "46 items did not
make it"; it says "46 items were skipped **because they were cached**". When one
counter is fed by two mechanisms, every reading of it is an unfalsifiable
guess about which one fired.

So: **one counter per cause.** If a number can be produced two ways, it is two
numbers. `skipped_cached` and `over_cap` are cheap; a day of misdirected
debugging is not.

The tell is a subtraction between two quantities that several steps have
touched. `raw.length - fresh.length` spans dedupe AND the cap, so it cannot mean
either one. Compute each difference where its cause is, not at the end.

Same family as rule 9: a surface that cannot distinguish two states reports
whichever one the reader already suspects.

## 16. Some checks only exist at runtime — build them into the app

Rule 11 said some gates do not exist locally, so encode them as tests. This is
the case where **no test can work at all**, because the fact being checked lives
somewhere the suite cannot reach.

`schema.sql` declared `feed_items.url_hash` for the entire life of the feed
feature. The live table never had it — the table was created from an earlier
version of the file, and `create table if not exists` is a no-op on an existing
table. The sweep wrote that column on every run: ten consecutive failures, zero
rows, no `agents:runs` key.

The suite was green throughout and **correctly so**. It compared code against
`schema.sql`, and those two agreed. The database disagreed, and no test in this
repo can see the database.

The app can — it holds service-role credentials. So the check belongs at
runtime: `/api/schema/drift` reads `information_schema` and `pg_constraint`
through a `schema_snapshot()` RPC and reports every divergence in both
directions, declared-but-absent and present-but-undeclared.

Three properties, none optional:

- **Non-gating.** It reports. It never blocks a deploy, a request, a deal or an
  artifact, and it returns 200 even when it finds blocking drift — the HTTP
  status describes whether the CHECK ran, not whether the schema is clean. A
  monitor that 500s on a finding looks broken exactly when it is working.
- **"Could not look" ≠ "nothing found."** A missing RPC returns
  `ok: false` with the reason, never a clean bill (rule 9).
- **Fetched independently of the surface it sits beside.** The drift panel does
  its own request rather than riding the status payload, so a failure in either
  leaves the other readable.

The general form: when declaration and reality live in different systems, put a
comparator where it can see both, and make it say which one it could not read.

## 17. A check that inspects properties has not seen the artifact

Rule 16 said some facts live where the suite cannot reach. This is the sharper
version for anything with a rendered output: **the suite can read every property
of the thing and still not know what it looks like.**

The Dashboard's lead tile spanned two grid columns and put a 48px number in
them. Half a row of empty card behind two characters. It read as a layout bug,
not as emphasis — and the full design-token suite was green, correctly. The
type scale was right. The token was applied. The contrast passed. Every
assertion inspected a property, and the defect was not in any property; it was
in the relationship between the number, the space around it, and the six tiles
beside it, which is exactly the class of fact that only exists once the thing
is drawn.

The same shape had already appeared twice in the same batch:

- `document.fonts.check('700 …')` returned `true` for weight 800, which was
  never loaded. It answers "would a face be used", not "is that face real" — a
  property inspected, a question dodged. The advance-width curve (6.99 / 7.75 /
  7.87 across 400→700) is the measurement that actually discriminates, and it
  required rendering.
- The feedback pill sits at `z-40`; the mobile tab bar at `z-30`. Two nav
  destinations were covered by an opaque button that also took their taps. The
  nav suite asserts all eight destinations are present, and all eight were
  present. **An element rendered underneath another is present and unusable.**

So: presence is not reachability, and properties are not appearance.

Rendering is part of the loop, not a spot check at the end. Every batch that
touches a surface runs `scripts/render-check.mjs` at all three breakpoints —
1440 desktop, 834 iPad, 390 mobile — and it fails the run, not just reports:

- **Occlusion.** For every interactive target, `elementFromPoint` at its centre
  must return that element or a descendant. This is the assertion that catches
  a covered nav item, and it is the reachability check that "does it render"
  can never be.
- **Touch-target size.** Below the desktop breakpoint, every interactive box
  clears 44px.
- **Horizontal overflow.** `scrollWidth > clientWidth` on the document is
  always a defect and is invisible to every source-level test.

What it deliberately does NOT do is diff screenshots. A pixel baseline goes red
on every legitimate change, gets regenerated without being read, and becomes a
rule-10 test that cannot fail. These three ask questions with real answers
instead.

The general form: when the artifact is rendered, assert against the render.
Everything upstream of the render is a claim about it.
