---
name: business-case-engine
knowledge: []
description: >
  Cross-cutting operating layer that governs HOW every written deliverable is built and HOW
  champions/committees are developed — not a standalone trigger, but a set of rules that
  discovery-call-prep, meeting-prep, exec-briefing, and Document Forge all inherit. Invoke
  directly on: "tighten this business case", "is this deal review clean", "build the champion
  plan for [account]", "who else should be in the room" (minimally-viable committee check),
  "is this a math problem or a drama problem". Otherwise applies silently inside every Forge
  output and every Spine update.
---

# Business Case Engine

> **The rule this skill enforces:** the written artifact — Brief, Exec Briefing, MAP — is not
> a summary of the sales process. It IS the sales process. Deals get decided in rooms CB isn't
> in, by people reading what CB wrote. If the writing is sloppy, the deal is sloppy, no matter
> how good the call was.

Ten operating rules. Apply invisibly — never cite them by number to CB or in customer-facing docs.

---

## RULE 1 — THE 60-SECOND COMPRESSION TEST

Before any Brief, Exec Briefing, or Spine entry ships, run this test silently: **could a stranger
read this in under 60 seconds and know exactly where the deal stands and what happens next?**

If not, cut. Specifically:
- Verdict/thesis must be the first line, not the last.
- No paragraph should require the reader to hold more than one idea at a time.
- If a section needs a sub-clause to explain itself, it's two thoughts — split it.

Apply this test to Account Brief (already 1-pg standard) and to Spine "Next Move" fields — a
Next Move that takes more than one sentence to state isn't a next move, it's a plan that needs
its own MAP entry.

---

## RULE 2 — THE BUSINESS CASE IS THE PROCESS, NOT AN OUTPUT OF IT

Do not treat the Exec Briefing / Account Plan as something built *after* the deal is understood.
Build it **from the first qualified call forward**, updating it live. Every subsequent call,
signal, or objection either sharpens the existing case or exposes a hole in it.

**Practical effect:** when CB asks for "exec briefing for [account]" at G0 with thin intel, don't
wait for more information — build the skeleton now (Situation / Opportunity / Economics / Ask,
even with placeholders and confidence flags) and treat every future interaction as filling gaps
in that same document, not writing a new one. This is what makes the two-output standard
(Brief + Plan Summary) *living* documents, not one-time snapshots.

---

## RULE 3 — WRITE FOR THE ROOM YOU'RE NOT IN

Every Forge document must stand on its own for a reader who never met CB and can't ask a
follow-up question. This is the real reason the Bloom-branded, thesis-first, dense-not-fluffy
standard exists — it's not a style preference, it's functional: **the champion is going to
forward this, verbatim, to people who will decide without CB in the room.**

Test: does this document assume any context the reader doesn't have? If the champion has to
add a cover email explaining what the document means, the document failed.

---

## RULE 4 — EFFICIENCY IS LESS ACTIVITY, MORE INFLUENCE

More touches ≠ progress. In Outreach (Bucket 0) and Land-and-Expand, the win condition is
**influence density per touch**, not touch count. A single sharp, insight-led message that
earns a forwarded intro beats five generic follow-ups.

**Practical effect on Outreach ranking:** when sequencing touches, don't default to "more
cadence = more likely." If an account isn't responding to a sharp, well-targeted insight after
2–3 touches, that's a fail-fast signal (see Hard Rules), not a cue to add volume.

---

## RULE 5 — WRITING IS DISCOVERY, NOT DOCUMENTATION

When drafting any Brief or Exec Briefing with incomplete information, **the act of writing it
is how the gaps get found** — not a separate "what do I still need to know" step tacked on after.

**Practical effect:** in `discovery-call-prep` and `account-deep-dive`, draft the target document
structure FIRST (even skeletal), then generate discovery questions from wherever the draft goes
thin or forces an assumption. A section you can't write cleanly is a section you haven't
discovered yet — that's the next call's agenda, not a footnote.

---

## RULE 6 — NUMBERS VALIDATE A STORY; THEY DON'T REPLACE ONE

The Four-Lever math ($/MWh, VoLL, queue delay cost) never leads. It **confirms** a decision the
buying team has already started making based on the narrative (two-enemy diagnosis, single-source
reframe, domestic-supply story). This is already the Response Structure rule (thesis first, math
second) — this skill makes it explicit that skipping the narrative and leading with a pro forma
is a common failure mode to actively guard against, especially with CFO/finance personas who
will otherwise pick apart the numbers instead of engaging with the logic.

---

## RULE 7 — MATH PROBLEMS VS. DRAMA PROBLEMS (new objection-triage layer)

Every stalled deal or resisted ask is one of two things:
- **A math problem** — a real, quantifiable gap (economics don't pencil, timeline too long,
  reliability case unproven).
- **A drama problem** — an organizational, political, or personal obstacle blocking a math
  problem that's already solved (a stakeholder protecting turf, a committee that fears change,
  an unstated blocker from the decision-process map).

**Practical effect:** before reaching for a new discount, spec change, or proof point (a math
answer), ask whether the actual blocker is drama. If it is, the fix is Voss-style (name the
emotion, mirror, calibrated question) or Extreme Ownership (find who owns the real blocker) —
not more math. Add this triage question to `war-room` and to any "why is this deal stuck" ask:
**"Is what's actually stalling this a number, or a person?"**

---

## RULE 8 — SELL THE PRIORITY, NOT JUST THE PAIN

A real, costly, well-diagnosed pain still loses if it isn't framed inside a priority the exec
already owns. Cost-per-MWh savings loses to a CFO's actual Q-priority (capex discipline, credit
rating, a board commitment) if it's pitched as a standalone problem-solve.

**Practical effect on Challenger hooks (discovery-call-prep, meeting-prep Block 3 Openers):**
before writing the opener, name the persona's stated or likely top-3 exec priority for the year
(from earnings calls, investor letters, ESG reports, org signals) and frame the pain as a
sub-problem of THAT priority — not as a freestanding cost or reliability issue. "This is costing
you $X" is weaker than "this is the thing standing between you and [the priority they already
told the board they'd hit]."

---

## RULE 9 — CHAMPIONS ARE BUILT, NOT FOUND (MEDDPICC upgrade)

Stop treating "Champion" as a checkbox you either have or don't. It's a build process, like
flat-pack furniture — CB supplies the pieces, the champion assembles their own version of the
solution over time, which is what creates real ownership.

**Practical effect on Spine / MEDDPICC:** the Champion field should track a **build stage**, not
just presence/absence:
1. Candidate identified (has motive + some internal standing)
2. Co-creating (actively shaping the solution/business case with CB — not just receiving it)
3. Carrying it (presenting/defending the case internally without CB in the room)
4. Institutionalized (champion has pulled in their own allies/committee unprompted)

A "Champion: ✅" flag with no co-creation evidence is optimistic, not true. Ask at every touch:
"What did I hand them to make their own this time?" — not just "did they say nice things?"

---

## RULE 10 — MULTITHREAD FOR QUALITY, NOT HEADCOUNT (Spine flag upgrade)

More contacts is not more coverage — past a certain point it's more internal dysfunction to
navigate. The goal is a **minimally-viable committee**: the smallest set of stakeholders that
gives the champion a "social safety net" (someone who backs them up if they leave, get
reassigned, or get challenged internally) — not maximum contact count.

**Practical effect on Spine's Multi-threaded ⚠️/✅ flag:** don't flip to ✅ just because a second
name exists. Flip to ✅ only when the committee covers, at minimum: the champion, one person who
can survive the champion's departure/reassignment (continuity), and one person with real veto
power in the decision-process map (security/legal/finance gate). Three well-chosen names beat
seven loosely-connected ones. If Meeting Prep's "multi-thread ask" surfaces a fourth or fifth
name, evaluate whether it adds coverage or just adds noise before logging it as progress.

---

## HOW THIS SKILL CHAINS

| Consuming Skill | What It Inherits From This Skill |
|---|---|
| `discovery-call-prep` | Rule 5 (write-to-discover), Rule 8 (priority-first hooks) |
| `meeting-prep` | Rule 8 (Openers), Rule 7 (Landmines/stalled-deal triage), Rule 10 (multi-thread ask quality bar) |
| `exec-briefing` | Rule 1 (compression test), Rule 2 (living document), Rule 3 (stands alone), Rule 6 (narrative-then-math) |
| `account-deep-dive` / Account Plan | Rule 2, Rule 9 (champion build-stage tracking) |
| Pipeline Spine (Champion field, Multi-threaded flag) | Rule 9, Rule 10 |
| `war-room` | Rule 7 (math-vs-drama triage question) |
| Outreach (Bucket 0) | Rule 4 (influence density over touch volume) |

---

*Business Case Engine v1.0 — PowerDeal Strategist | added [today's date]*
*Source: 10-point sales-writing framework (Fluint), adapted to onsite-power BD context.*
*This skill has no standalone trigger phrase by design — it's inherited, not invoked cold.*
