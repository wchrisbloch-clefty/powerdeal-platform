---
name: prospect-originator
knowledge: [reference-bundle.md, vertical-playbooks.md, ercot-market-primer.md, permitting-playbook.md]
description: >
  Generate a targeted prospect list and origination strategy for a given vertical, geography,
  or trigger condition. Triggers on: "find prospects", "originate", "pipeline generation",
  "who should we target", "build a target list", "where should I be calling", "who's in the
  ERCOT queue", "who got denied a permit", "find data centers in [geography]". Web search
  required. Output is a scored, actionable prospect list with outreach approach for each.
  Trigger whenever the user needs new pipeline and doesn't have a named account in mind.
---

# Prospect Originator

Build real, researched pipeline. No invented company names. Web search required for every output.

## Step 1 — Define the Hunt

Clarify (or infer from context):
- **Vertical focus**: Refining / Data Center / Industrial / O&G / All
- **Geography**: Gulf Coast TX, LA corridor, ERCOT territory, national, specific state
- **Trigger**: ERCOT queue mining / non-attainment permit denials / hyperscaler announcements / turnaround schedules / other
- **Size filter**: MW range (default: 5+ MW baseload)

## Step 2 — Channel-Specific Research

Run web searches based on the trigger type:

**ERCOT Queue Mining:**
- Search: "ERCOT large load interconnection request 2025 2026"
- Search: "ERCOT generation interconnection queue industrial"
- Look for: Companies with pending large-load requests stuck 3+ years

**Non-Attainment Permit Denials:**
- Search: "TCEQ permit denied HGB 2024 2025" or "[company] TCEQ NOx permit"
- Search: "Houston Galveston Brazoria non-attainment permit delay industrial"
- Look for: Combustion projects denied or delayed — these are pre-qualified leads

**Hyperscaler Site Announcements:**
- Search: "data center campus [state] 2025 2026 power"
- Search: "[hyperscaler name] data center Texas Virginia Ohio Arizona"
- Look for: Greenfield campuses with power as binding constraint

**Refinery Turnarounds:**
- Search: "Gulf Coast refinery turnaround schedule 2025 2026"
- Search: "[refinery name] cogen aging reliability"
- Look for: Aging cogen assets, announced turnarounds, reliability incidents

**Industrial Reshoring:**
- Search: "manufacturing facility Texas Louisiana [sector] 2025 2026"
- Search: "[company] new plant [state] power requirements"

## Step 3 — Score Each Prospect

For each identified prospect, apply the ICP scoring rubric (from the `deal-qualification` skill):

| Company | Vertical | MW Est. | Grid Pain | Permit Pressure | ESG Driver | Fin. Capacity | ICP Score |
|---|---|---|---|---|---|---|---|
| | | | /5 | /5 | /5 | /5 | /25 |

Pursue threshold: 15/25. Flag score and rationale for each.

## Step 4 — Outreach Strategy Per Prospect

For each prospect scoring 15+, provide:

**Challenger Hook** (the insight that opens the conversation):
> "[Company] is facing [specific constraint — NOx headroom, queue position, reliability gap]. Here's what that means for [their specific outcome]."

**Outreach Channel**: Cold email / LinkedIn / referral / conference / utility partner

**First Ask**: What do you want from the first interaction? (Intro call / site visit / feasibility discussion)

**Stakeholder Target**: Who specifically to reach first (title, not name — unless name is findable)

## Step 5 — Output Format

---
**PROSPECT LIST — [VERTICAL / GEOGRAPHY] | [DATE]**
*Sourced via: [channels used] | Search date: [today's date]*

**Tier 1 Prospects (Score 20+):**
[3–5 companies with full ICP score, hook, and outreach plan]

**Tier 2 Prospects (Score 15–19):**
[5–10 companies with score and hook]

**Watch List (Score 10–14 — monitor for trigger event):**
[Companies to revisit when a qualifying event occurs]

**Origination Actions This Week:**
1. [Specific action — e.g., "Submit TCEQ public records request for HGB permit denials Q1 2026"]
2. [Specific action — e.g., "Check ERCOT large load queue update — published monthly"]
3. [Specific action — e.g., "Set Google alert for '[hyperscaler] data center Texas power'"]

---

## Hard Rules
- Never fabricate company names or data — only include real, searchable companies
- Flag every data point with source and date
- ICP score must be evidence-based, not assumed
