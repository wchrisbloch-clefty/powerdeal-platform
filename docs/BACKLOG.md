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

**Status:** accepted, noted
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

## 5. MAP share link

**Status:** parked, deliberately paired with the custom-domain decision

Vercel Deployment Protection is enabled with
`deploymentType: all_except_custom_domains`, and the app runs on a
`*.vercel.app` domain — so any share URL gets a 401 from Vercel's edge before
the route runs. The app has no auth of its own (no `middleware.ts`, one
hardcoded user id), so that protection is the only thing keeping the pipeline
private and cannot simply be disabled.

`shareToken`, `championViewedAt` and `championEditedAt` exist and
`championSignal()` reads them correctly. The plumbing is ready; the route is
not, and it should be designed together with the domain rather than retrofitted
to it.


## 6. `deals.competition` still scores one MEDDPICC point

**Status:** open
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
