# Backlog

Items found during the build that are real, are not fixed, and should not be
discovered again from scratch.

---

## 1. Nothing in the application ever changes a deal's stage

**Status:** SHIPPED 2026-08-11 — `components/modules/stage-control.tsx` +
`lib/stage.ts`. Kept here because the finding, the four affected features and
the three open questions are the record of why the fix looks the way it does.

**Resolved:** the three questions below were answered as follows. Backward
movement is ALLOWED — a ladder that only went up would force the record to lie
about a deal that regressed, which is worse than the regression, and the
trigger writes a transition row either way so a reversal is as legible as an
advance. Post-Sale does NOT follow Closed-Won automatically: an automatic
advance writes a transition nobody decided. Reopening a closed deal is allowed
and FLAGGED, because `log_win_loss()` wrote a row on the way in and moving back
out leaves it describing a deal that is live again.

`days_in_stage` is unfrozen with it, as recorded below.

**Originally filed:** queued, after per-deal competitive state
**Found:** 2026-08-10, while scoping win-loss capture
**Severity:** four shipped features are computing on an immovable field

### The finding

`PATCH /api/deals/[id]` accepts a `stage` value and **no component calls it**.
Verified by grep across `app`, `components` and `lib`: the only two
`method: 'PATCH'` call sites are the settings panel and the sources panel.
`pipeline-view.tsx` uses stage exclusively as a *filter*. Deals are created
(`deal-quick-add`, `peer-chip`) and read. They are never advanced.

As of this writing the single exception is `log_win_loss()`, added for win-loss
capture, which sets a **terminal** stage at close. That closes deals; it does
not advance them.

### What runs on the frozen field

- **Stage momentum — 15% of deal health.** `computeHealthScore()` awards 1.5 of
  10 for `days_in_stage < 30` and 0.75 for `< 60`. With the stage frozen at
  creation, every deal eventually falls past both thresholds and the component
  decays to zero for the whole book, uniformly, regardless of what is actually
  happening.
- **`days_in_stage`** counts from creation forever. The
  `deals_log_transition` trigger resets it on a stage change — an event that
  cannot occur.
- **Stage-conversion tracking** reads `stage_transitions`, which can only be
  written by that same trigger. The table stays empty; any conversion or
  velocity analysis built on it reports nothing and looks like a quiet period.
- **The stall-alert cron** flags deals past a day threshold in a non-terminal
  stage. Because nothing can leave a stage, its result set only grows. It fired
  with 1 item on 2026-08-03 and becomes permanent noise on a daily schedule —
  the specific failure mode where an alert that fires every day stops being
  read, taking the real signal with it.

### Why it is not bundled into win-loss

Stage advancement carries its own design questions, and answering them inside a
verbatim-capture task would turn one feature into three:

- Does a stage change write a `stage_transitions` row, or is the trigger
  authoritative? (Currently the trigger.)
- Does moving a deal *backwards* require confirmation, and is it logged
  differently from forward movement?
- Is `Archived` reachable directly, or only through a close?
- Does `Post-Sale` follow `Closed-Won` automatically or manually?

### What is already handled

`log_win_loss()` sets a terminal stage through a plain `update deals set
stage`, which fires `deals_log_transition` — so **closes already write their
`stage_transitions` row** and reset `days_in_stage`. Measured: closing a deal
sitting 42 days in Discovery produced `T-001 | Discovery | Archived | 42`.

No backfill from `win_loss_log` is needed. Any stage control added later should
write through the same mechanism — a plain UPDATE on `deals.stage`, letting the
trigger own the transition row — rather than inserting transitions directly,
which would double-write.

### Suggested shape

A stage control on the deal header, writing through the existing `PATCH` route.
The trigger already handles the transition row and the `days_in_stage` reset, so
the server side is done — this is a UI and a decision about backwards movement.

### `days_in_stage` rode on this and is now unfrozen

**Added 2026-08-11.** `days_in_stage` counts from creation and is only ever
reset by `deals_log_transition`, which fires on a stage change. With nothing in
the application changing a stage, the field never resets — so every deal's
"days in stage" is really "days since it was created", and the two agree only
until the first advance that never comes.

Three shipped things read it as though it meant what it says:

- **`riskFlags`** — `Stalled 60d` and `30d in stage`. Both are currently
  "created 60 days ago", which is not the same claim.
- **`computeHealthScore`** — 15% of deal health, so every deal drifts downward
  on age alone.
- **`isAtRisk`** — `days_in_stage > 30`, which eventually catches everything.

Nothing was patched around it. A derived reset, or a backfill from
`stage_transitions`, would have made the number look right while the underlying
cause — no stage ever advancing — stayed in place, and the number looking right
is exactly what would have stopped anyone fixing it. It unfroze when stage
advancement landed, in the same pass, with no change to the field itself.

Existing deals still carry a `days_in_stage` that means "days since created"
until each one is moved for the first time. That is not backfilled, for the
same reason: a backfilled number would be a guess presented as a measurement.
The first real move on a deal makes its counter honest.

---

## 2. `Archived` collapses three different losses

**Status:** CLOSED 2026-08-15 — `archivedOutcome()` / `outcomesByDeal()` in
`lib/win-loss.ts`. The collapse stands, because it is correct: `DEAL_STAGES`
has no lost stage and `win_loss_log.outcome_type` already preserves the
distinction. What was missing was the read-back, and that is what shipped —
the join, indexed by deal so a table resolves each row without a rescan, plus
the doctrine cure for each of the three. A deal with NO log row returns null
rather than the most common outcome: an archived deal moved by hand has no
recorded outcome, and a guessed one would put a fabricated cure in front of a
rep. A reopened-and-reclosed deal reports its latest close, not its first.
**Severity:** low — nothing is lost, but the pipeline view cannot distinguish
them without a join

`terminalStageFor()` maps No-Decision, Competitive and Disqualified all to
`Archived`. `outcome_type` on `win_loss_log` preserves the distinction, and the
canonical `DEAL_STAGES` list has no lost stage to map them to, so the collapse
is correct given the schema.

Worth knowing because the doctrine is explicit that the three have different
cures: a no-decision needs a forcing function, a competitive loss needs a
different argument, a disqualification needs better qualification earlier. Any
pipeline view that wants to separate them must join `win_loss_log` on
`deal_id` — the stage alone will not tell them apart.

---

## 3. `generatePptx` does not consume the docx theme

**Status:** queued, after Part 3
**Severity:** the highest-visibility output is the one off-palette

`lib/forge/theme.ts` is consumed by `generateDocx` only. The PPTX path carries
its own inline colours (`9A9DAA`, `3E3E3E`, a `0F1117` cover) and a different
library with no `styles.xml` to assert against, so the brand test suite cannot
reach it.

A branded MAP and an off-palette deck in the same meeting is worse than both
being plain.

---

## 4. PDF export

**Status:** SHIPPED 2026-08-11 — `lib/forge/pdf.ts`, wired into
`/api/forge`. The 501 with its reason is gone.

Feasibility was already settled and is unchanged: @sparticuz/chromium +
puppeteer-core trace to 70.1 MB against Vercel's 250 MB limit, and
`next.config.ts` force-includes the brotli payload the tracer cannot see.

Two things were deliberately NOT folded in. Supabase Storage stays with the
share route, where an artifact has to outlive the request — a download that
depended on a bucket nobody has created would have been a worse button than no
button. And the markdown renderer is small on purpose rather than a library:
everything it renders was written by a model and is going to a customer, so it
escapes first and re-introduces only bold and emphasis. Raw HTML, image tags
and scripts are escaped, and that is asserted rather than assumed.

**Still open:** the UI has no PDF button. The route serves it and takes a page
size; nothing calls it yet, which is the same shape as the stage field before
this pass — a working server side with no caller.

---

## 5. MAP share link — REMOVED FROM SCOPE

**Status:** CUT 2026-08-11. Not deferred — removed. Do not build the route, add
the custom domain, or touch Deployment Protection.

### Why it was cut, in the buyer's terms

The champions are VPs at defense and midstream accounts. They forward
attachments to their boss. They do not open a vendor-hosted web app that needs
a security review to reach. **PDF and DOCX export are the delivery mechanism.**

### Why it could not be built safely anyway

The app has no auth of its own — no `middleware.ts`, no login route, no
session, and a service-role client scoped to one hardcoded user id. Vercel
Deployment Protection is the entire security boundary, and it runs at the
platform edge BEFORE Next.js middleware. So there were only two ways to expose
a share URL:

- **Protection Bypass for Automation** — a global bypass secret, not
  path-scoped. Opens every route, not just `/share`.
- **`all_except_custom_domains`** — protection applies to `*.vercel.app` but
  not the custom domain, which leaves `/app` unprotected on that domain.

Both are "an exemption that opens the app". Under either, a middleware file
written in one pass becomes the only thing keeping the pipeline private, with
no second layer behind it. Adding real auth to `/app` to serve a link the
buyers will not click is the wrong trade.

### What is kept, and what goes dormant

`shareToken` STAYS in `MapPlan`. It costs nothing, and the decision could
reverse if the delivery channel ever changes.

**`championSignal()` goes dormant.** It reads `shareToken`,
`championViewedAt` and `championEditedAt` and returns `'not-shared'` for every
plan, because nothing will ever set them. The MAP export prints that label,
which is accurate rather than broken.

That loss is ACCEPTED, and for a reason beyond the trade: in defense accounts,
engagement tracking on a named individual inside the customer's organisation is
a liability rather than a feature. View/edit telemetry on a champion is the
kind of thing that surfaces in a security review and costs the deal.

### If this ever reverses

Real auth on `/app` first — Supabase sign-in restoring the cookie-bound client.
RLS policies are already in place and untouched, so that is a client swap, not
a schema migration. The share route comes after, never instead.

---

## 6. `deals.competition` still scores one MEDDPICC point

**Status:** CLOSED 2026-08-15 — `meddpiccResult()` in `lib/deals.ts`.

The rule that shipped is the one this entry identified as the only one that
works: **a stored `deal_competitors` row exists.** It works because returning a
toggle to its DEFAULT deletes the row rather than storing the default as data
(`presenceWrite`), so a stored row can only mean a deliberate act — a
competitor turned on that is normally off, one turned off that is normally on,
or a posture recorded. Presence alone would have handed every deal a free point
on creation, since do-nothing and the grid are both on by default.

The part this entry did not anticipate: **a read that FAILED must not score as
zero.** `competitorsForDeal` returns `[]` on error, which is right for
rendering a grid (the defaults still apply) and wrong for scoring — it would
print "Competition: gap" on a deal with a fully worked competitive picture. So
there is a second read, `competitorCountForDeal`, returning `number | null`,
and `meddpiccResult` reports an unloaded record as `unscored` rather than as a
gap. That understates the score by at most one point and names why, which beats
a number nobody measured. `unknown` is now a real third state in
`meddpiccState`, distinct from `gap`.

The score does move on live deals, as this entry warned. It moves toward the
grid, which is the authority.

**Found:** 2026-08-11, deprecating the field as the competitive record
**Severity:** one point of eight, on a field nothing else reads

### The decision that was made

`deal_competitors` plus the toggle grid is the **sole authority** for who is in
a deal. `deals.competition` is free text: it cannot hold a set of postures,
cannot say which competitor an argument was aimed at, and cannot be switched
off. Nothing generated reads it any more, and the deal page now labels it
`Competition (legacy note)`.

The column is **kept, not dropped** — it is the only copy of whatever was
written before the table existed.

### What is still wired to it

`computeMeddpiccScore()` awards the 'C' point for `deal.competition` being
non-empty. That is the last behavioural dependency.

### Why it was not rewired in the same pass

Scoring off presence is not a drop-in. The toggle grid has do-nothing and the
grid **on by default**, so "has competitors" is true for every deal the moment
it exists and the point becomes free. The rule that actually means something is
"a stored `deal_competitors` row exists" — someone switched a competitor on, or
recorded a posture — which requires threading the competitor set through
`computeMeddpiccScore()` and `meddpiccBreakdown()`, both of which the pipeline
table calls once per row. It also moves a visible score on live deals.

### Suggested shape

Thread the competitor set in, score the point on a stored row rather than on
presence, and state the change where the score is displayed so a deal that
drops a point shows why.


## 7. Meeting Prep generator — SHIPPED

**Status:** shipped 2026-08-13, same day it was raised
**Found:** 2026-08-13
**Severity:** the highest-value artifact type identified so far, and the
intended default surface before a call

### Unblocked

`skills/SKILL-meeting-prep.md` landed. The generator is
`lib/meeting-prep.ts` (pure) plus `lib/prompts/modules/meeting-prep.ts`, wired
as the `meeting-prep` task on `/api/ai` and routed Claude-only as a domain task.

The four catalogs are handed to the model **verbatim from the file** — nothing
in `lib/` restates a persona, a landmine or the methodology matrix. What the
code contributes is the part that is arithmetic and would otherwise be guessed:
the clock, the walk-out split against live Spine fields, the opener
preconditions, and the dating of intel. See `skills/README.md` for where skills
live and how they load, and `tests/skills.test.ts` for the §6 resolution
assertion that makes a rename fail in the suite rather than at runtime.

### The original blocking analysis, kept

### Why it is blocked

`SKILL-meeting-prep.md` is **not in this repository.** No SKILL file is —
`find` returns zero matches. The system prompt says the Forge "reads the
relevant SKILL.md first", but those files live in the Claude.ai project, not in
git, so the repository has never had access to any of them.

The generator was specified as "build it against the skill", and the skill
supplies four catalogs that are pure doctrine:

- **15 meeting types** — each with its own time shape
- **13 personas** — the calibration target for every section
- **the methodology matrix** — which technique applies to which combination
- **the landmine library** — vertical-specific, situational

None of those can be inferred. Inventing 15 meeting types would be writing
doctrine in code, which is the same error as the integrator tier that shipped
with no framing for two versions — and it would be worse here, because a
plausible-looking meeting plan is used in a live meeting before anybody
notices it was invented.

### What IS specifiable without the file, and could be built first

The mechanism was described in enough detail to build independently of the
catalogs, and none of it is doctrine:

- **Duration budgeting** — minutes allocated across openers / core discovery /
  closers, from a duration input. A 30-minute intro and a 90-minute technical
  deep-dive are different documents.
- **Branch selection** — three openers with distinct leads (cost / risk / soft)
  and two closes (hard / soft), each labelled with the condition that selects
  it: "if the room reads cautious."
- **The filler section** — no-wrong-answer questions for a quiet room.
- **"Why it works"** on every script — one line, mechanism not restatement.
- **The walk-out checklist**, read from the actual deal record rather than
  templated: "one new name — health caps at 6 while single-threaded" is a
  sentence generated from `multi_threaded` and `computeHealthScore`, and every
  item like it already has a field behind it.
- **Market intel**, filtered from the Market Watch log by the deal's utility,
  state, ISO and vertical, each item dated, sourced, and rewritten as a spoken
  hook, closing with a Signal / Use As / Timing table.
- **The return path**, which shipped in this pass as a platform-wide rule.

### What landed in this pass regardless

The three theme tokens, the callout and section-bar builders, the
classification header, the five defect assertions, and both platform-wide
extractions are all done and independent of the skill file. See
`lib/forge/theme.ts` and `lib/provenance.ts`.

### How it was unblocked

`SKILL-meeting-prep.md` was dropped into `skills/`, beside `prompts/`, under the
same rule 6 that governs the brain: read verbatim from a committed file, never
generated or inferred in code.

Sixteen of the seventeen inventoried skills are still absent and are pinned as
`awaited` in `lib/skills/registry.ts` — a file arriving fails the suite until it
is registered deliberately.

---

## 8. §6 / repo reconciliation — CLOSED by v3.1.11

**Status:** closed 2026-08-14
**Found:** 2026-08-13, building the skill registry

All four gaps are shut, and every one was closed by a doctrine edit rather than
a code workaround — the right direction, since §6 is prose in one file and the
slugs are artifact identity referenced by filenames, frontmatter and the loader.

### 8a. Six name disagreements — RESOLVED

§6 now names all seventeen skills by slug. The `section6Name` field is deleted:
it recorded the six mismatches, and once doctrine adopted the slugs every value
duplicated the slug beside it. The assertion became **set equality in both
directions**, which is stricter than the alias map it replaced.

### 8b. Two skills §6 never named — RESOLVED

`business-case-engine` and `meeting-prep` are in §6. Both were built and
unreachable by name — the fifth instance in this build of a working thing
nothing could call.

### 8c. Knowledge files — SIX, and six is final

All six are in `knowledge/`, registered, and loading. `PowerBD.pdf` was removed
from §6 rather than supplied: it is a ZIP wearing a `.pdf` extension holding a
screenshotted copy of this prompt at v1.0, twelve versions stale.

The forcing function worked end to end — §6 dropped the name, the state pin went
red, the entry was deleted, green. Two edits, exactly as rule 12 requires.

§6 also declares itself the canonical home of the competitive-matrix caveat, so
`parseKnowledgeCaveat()` has doctrine backing rather than convention. The
implementer parenthetical is stripped before display.

### 8d. Duplicate skills — RESOLVED

Byte-identical uploads. `versionsPending` carries nothing; the field stays for
the next real duplicate.

### 8e. Skill-to-skill references — RESOLVED

`document-forge` and `market-watch` have their own §6 line, declared as Buckets
3 and 5 and explicitly not skills. The registry cross-checks against that line
rather than asserting the distinction on its own authority — a private list is
one step from an ignore list.

### What is still open

Nothing in item 8. **Open elsewhere:** no prompt module embeds a knowledge file
yet. The shelf is ~48k chars, ~12k tokens whole, so a module reaching for it
should pull what it needs rather than all six.

---

## 9. `vertical-playbooks.md` wants splitting by vertical

**Status:** DESIGN SETTLED, BLOCKED ON A DOCTRINE VERSION — 2026-08-15

CB chose the option this entry recommended: **declare all three, select at load
time from `deal.vertical`. Not wildcarded.** That closes the only open design
question here.

### Why it did not ship in the same pass

The split cannot land green without editing §6, and §6 is doctrine.

`lib/skills/registry.ts` pins the knowledge set exactly and the suite asserts
that every name in §6 resolves to a file and that every registered file is
named in §6 — in both directions, deliberately. Replacing one filename with
three therefore requires the **Knowledge files** line of §6 to change, which
means a new system prompt version, a changelog entry, `POWERDEAL_VERSION` in
`lib/brand.ts`, and the prompt filename that the suite holds to it.

Every prompt version so far has been authored by CB and delivered whole.
Minting v3.1.12 to carry a filing change is a bigger footprint than the change
warrants, and it is not a call to make unilaterally. The forcing function
working exactly as designed is what surfaced this.

### What is ready the moment the §6 line changes

The split itself is mechanical and was verified: three files at ~4.5k, ~4.6k
and ~3.7k chars, content **byte-identical to the original sections** — a
reference file is filed, not rewritten, and editing it to read better
standalone would destroy the record of what it said.

Replace the §6 knowledge line's `vertical-playbooks.md` with:

    `vertical-refining.md` · `vertical-data-center.md` · `vertical-industrial.md`

Then, in one commit: write the three files, swap the `KNOWLEDGE` entry for
three, update the six skills that declare it, and add the deal-vertical
selection. Six skills declare the combined file today and **not one needs more
than one vertical at a time** — the heaviest call (`four-lever-calculator`,
`prospect-originator`) drops from ~8,351 tokens to roughly 6,000.

**Found:** 2026-08-14, sizing the knowledge shelf for declared dependencies
**Severity:** wasted context on every vertical-specific call, and irrelevant
doctrine in front of the model

One file carries all three playbooks — refining, data centers, industrial
manufacturing — at 10,948 chars (~2,737 tokens), the second largest item on the
shelf. Six of the seventeen skills declare it, and **not one of them needs more
than one vertical at a time.** A defense call currently carries hyperscaler
clean-energy clauses and refinery steam balance; an industrial call carries both
of the others.

### Why it is not urgent

Declared dependencies (item 10 / the knowledge-declaration work) already cut the
worst case from the whole shelf to what a skill names. This is the next cut
after that, not a substitute for it.

### What splitting looks like

`vertical-refining.md` · `vertical-data-center.md` · `vertical-industrial.md`,
each registered separately, and the declaration becomes vertical-aware — which
is a real design question, because a skill's dependency list is static while the
deal's vertical is runtime. Two options:

- **Declare all three, select at load time** from `deal.vertical`. Keeps the
  declaration static and auditable; selection is one deterministic lookup.
- **Declare a family** (`vertical-*`) and resolve the member from the deal.
  Shorter to write, but introduces a wildcard into the one place the build has
  deliberately kept literal.

The first is more consistent with everything else here. Worth deciding when the
split happens rather than now.

### Also noted

`vertical-playbooks.md` covers three verticals; §2 names **four** (Defense is in
the target market with no playbook). Splitting is the moment to notice whether
Defense should have one, which is a content question, not a code one.

---

## 12. Recip and fuel-cell preset data

**Status:** BLOCKED — environmental, 2026-08-15
**Severity:** `recip-engine` is an empty preset the economics page offers and
cannot fill

`lib/economics/presets.ts` carries `recip-engine` as `emptyTech()` with the note
"Not covered by Lazard v18.0." The fix is real vendor numbers — capex/kW, O&M,
heat rate, lead time, asset life — from public spec sheets.

### Why it is blocked rather than open

**The build environment has no egress to any of the sources.** Verified
directly: `cat.com`, `wartsila.com`, `jenbacher.com`, `bloomenergy.com`,
`nrel.gov` and `eia.gov` all return `CONNECT tunnel failed, response 403` from
the agent proxy, which allows only package registries. `WebFetch` is blocked on
the same domains.

### Why nothing was written anyway

The preset system is provenance-tiered: every value carries a source and a date
and renders as VERIFIED, REPORTED or INFERRED. Filling these from recollection
would put a remembered figure behind a citation to a document nobody read,
inside the one surface whose entire purpose is that its numbers are traceable.
An unsourced number that looks sourced is worse than an empty preset, and the
empty preset already says why it is empty.

**Never fabricate a number to fill a gap** applies here more sharply than
anywhere else in the platform.

### What unblocks it

Any one of: a spec sheet PDF dropped into the repo, the numbers supplied
directly with their source and date, or an environment with egress to the
vendor domains. The shape to fill is `sourcedRange(low, high, unit, tier,
source, date)` — the same one every populated preset uses.
