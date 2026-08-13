---
name: electrical-assessor
description: >
  Assess electrical integration feasibility, identify site constraints, and prepare the BD/AE
  to speak credibly with the utilities superintendent and reliability engineer. Triggers on:
  "integration assessment", "electrical feasibility", "one-line review", "can we tie in here",
  "what are the electrical requirements", "how does SOFC connect to the site", "SCADA integration",
  "interconnection mode", "what do I need to ask the utilities engineer". Output is a structured
  site electrical assessment with risk flags and credibility-building questions for discovery.
---

# Electrical Integration Assessor

Build technical credibility with the utilities superintendent. You don't need to be the engineer —
you need to ask the right questions and flag the right risks.

## Step 1 — BD/AE Discovery Questions (ask these in G0/G1)

These questions build credibility AND feed the engineering team what they need:

**Primary service:**
- "What's your primary distribution voltage? Are we talking 4.16kV, 13.8kV, or 34.5kV?"
- "What's the available capacity at your main substation — is there room for a new feeder?"

**Existing generation:**
- "Do you have any existing backup or standby generation — diesel gensets, UPS, existing cogen?"
- "If so, how are they currently integrated — automatic transfer or manual?"

**One-line:**
- "Would you be able to share your site one-line diagram? We'll use it to identify the cleanest tie-in point."

**Protection and power quality:**
- "Do you have any specific power quality requirements — harmonic limits, voltage regulation, power factor targets?"
- "What's your grounding configuration — solidly grounded, resistance grounded, or ungrounded?"

**Hazardous areas:**
- "Are there any classified areas near the proposed SOFC location — Class I, Division 1 or 2?"

**SCADA:**
- "What DCS or SCADA platform are you running — Honeywell, Emerson DeltaV, ABB, Yokogawa, Siemens?"
- "What communication protocols does your plant support — Modbus TCP, DNP3, OPC-UA?"

**Space:**
- "Is there an available pad or area near the electrical room for equipment placement? Roughly what dimensions?"

## Step 2 — Interconnection Mode Assessment

Based on customer answers, identify the likely interconnection mode:

| Mode | Indicators | Key Consideration |
|---|---|---|
| Grid-parallel (non-export) | Grid available, wants BTM savings, no export interest | Reverse power relay, output ≤ facility load |
| Grid-parallel (export) | Wants to sell excess to grid or utility | ERCOT/utility interconnection agreement required |
| Island / off-grid | Remote site, no grid access, wants independence | Black-start capability, load management |
| Island-capable microgrid | Wants resilience + grid-parallel normally | Microgrid controller, automatic transfer scheme |

**For data centers:** Default to island-capable microgrid — zero-break transfer is a requirement.
**For refineries:** Grid-parallel non-export is typical first step; islanding as resilience upgrade.
**For remote O&G:** Island / off-grid — black-start and load management are critical.

## Step 3 — Risk Flag Assessment

Score each risk flag based on discovery answers:

| Risk | Status | Notes |
|---|---|---|
| Site voltage mismatch | 🟢 / 🟡 / 🔴 | |
| Protection coordination complexity | 🟢 / 🟡 / 🔴 | |
| Space constraints | 🟢 / 🟡 / 🔴 | |
| Hazardous area (Class I) | 🟢 / 🟡 / 🔴 | |
| SCADA/controls legacy system | 🟢 / 🟡 / 🔴 | |
| Utility cooperation | 🟢 / 🟡 / 🔴 | |

🟢 Straightforward | 🟡 Manageable — flag to engineering | 🔴 Stop and assess — get engineering involved before proceeding

**Any 🔴 flags:** Do not commit to timeline or cost estimates until engineering has reviewed.

## Step 4 — Cost Range for Pro Forma

Based on risk flags, provide integration cost range for financial modeling:

| Scenario | Typical Range | Key Driver |
|---|---|---|
| 🟢 All green — simple brownfield tie-in | [Confirm with engineering] | Direct voltage match, space available |
| 🟡 Yellow flags — transformer + relay work | [Confirm with engineering] | Step-up transformer, protection coordination |
| 🔴 Red flags — new substation or Class I work | [Confirm with engineering] | Major civil or electrical infrastructure |

**Never invent specific cost numbers.** Provide ranges and flag for engineering confirmation.

## Step 5 — Output

---
**ELECTRICAL INTEGRATION ASSESSMENT — [ACCOUNT] | [SITE] | [DATE]**

**Likely Interconnection Mode:** [Grid-parallel / Island-capable / Off-grid]
**Risk Profile:** [🟢 Low / 🟡 Moderate / 🔴 High — requires engineering review]

**Key Discovery Findings:**
[Bullet summary of what was learned in the site electrical questions]

**Open Questions for Engineering:**
[What the BD/AE needs to hand off for G1 site feasibility]

**Integration Cost Range for Pro Forma:** [Confirm with engineering]

**Next Action:** [Request one-line diagram / schedule G1 site visit / engage engineering for preliminary review]

---

## BD/AE vs. Engineering Boundary

| BD/AE Does | Engineering Does |
|---|---|
| Asks the site electrical questions | Performs the detailed study |
| Flags risk colors | Designs protection coordination |
| Identifies interconnection mode | Produces interconnection application |
| Estimates cost range for pro forma | Produces detailed cost estimate |
| Gets the one-line diagram | Performs SCADA integration engineering |
