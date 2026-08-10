# Backlog

Items found during the build that are real, are not fixed, and should not be
discovered again from scratch.

---

## 1. Nothing in the application ever changes a deal's stage

**Status:** queued, after per-deal competitive state
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

### Suggested shape

A stage control on the deal header, writing through the existing `PATCH` route.
The trigger already handles the transition row and the `days_in_stage` reset, so
the server side is done — this is a UI and a decision about backwards movement.

---

## 2. `generatePptx` does not consume the docx theme

**Status:** queued, after Part 3
**Severity:** the highest-visibility output is the one off-palette

`lib/forge/theme.ts` is consumed by `generateDocx` only. The PPTX path carries
its own inline colours (`9A9DAA`, `3E3E3E`, a `0F1117` cover) and a different
library with no `styles.xml` to assert against, so the brand test suite cannot
reach it.

A branded MAP and an off-palette deck in the same meeting is worse than both
being plain.

---

## 3. PDF export

**Status:** parked
**Feasibility:** confirmed — `@sparticuz/chromium` + `puppeteer-core` trace to
70.1 MB against Vercel's 250 MB limit (measured 2026-07-31), and
`next.config.ts` already force-includes the binary the tracer would otherwise
miss.

Remaining: the HTML template against final tokens, two page sizes, Supabase
Storage. `/api/forge` returns a 501 naming exactly this rather than shipping a
broken download button.

---

## 4. MAP share link

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
