---
name: four-lever-calculator
description: >
  Run a quantified four-lever diagnostic for any prospect or active deal. Triggers on: "run the calculator",
  "four-lever analysis", "quantify the value", "what's the value case", "build the value case", "what's our
  economic story", "four levers". Also trigger proactively whenever a user provides account details (power
  consumption, utility rates, location, process type) and no value case exists yet. Output is a structured,
  dollar-quantified diagnostic across Cost/Margin, Time-to-Power, Reliability/Resilience, and ESG/Permitting.
  This is the primary deal-advancing tool — use it early and often.
---

# Four-Lever Value Calculator

Quantify the customer's exposure across all four levers using their own numbers. Never pitch before this is done.

## Step 1 — Gather Inputs

Collect as many of these as available. Proceed with estimates where data is missing (flag clearly).

**Cost / Margin (Lever 1)**
- Current all-in $/MWh (energy + demand + transmission + ancillary)
- Monthly demand charge ($/kW-month)
- 4CP exposure (ERCOT) — ask for peak demand kW during June–Sept afternoons
- Annual MWh consumption
- Vertical-specific: crack spread (refiner), PUE (data center), throughput margin (industrial)

**Time-to-Power (Lever 2)**
- Current grid queue position or substation status
- Revenue-generating capacity blocked or delayed (MW)
- $/day or $/month value of delayed production or capacity
- Alternative timeline (grid, recip engine, turbine)

**Reliability / Resilience (Lever 3)**
- Outage hours/year (planned + unplanned) — historical if available
- Process restart cost per event (refiner default: $2–10M; ask for their number)
- Insurance premium for grid-dependent operations
- Uri-class event exposure: what did Feb 2021 cost them?

**ESG / Permitting (Lever 4)**
- Non-attainment zone? (HGB, Baton Rouge, other)
- Existing NOx/SOx budget and headroom
- Stated Scope 1/2 targets and timeline
- SEC disclosure exposure or hyperscaler PPA mandate

## Step 2 — Calculate Each Lever

### Lever 1: Cost / Margin
```
Energy cost avoidance = (Current $/MWh − SOFC $/MWh) × annual MWh
Demand charge avoidance = monthly $/kW × peak kW reduction × 12
4CP avoidance = 4CP $/kW-month × peak kW reduction × 12
Annual Lever 1 value = sum above
```
Flag if SOFC $/MWh is unknown — use placeholder and note sensitivity.

### Lever 2: Time-to-Power
```
Revenue at risk = $/day delayed × (grid timeline − SOFC timeline in days)
Queue cost = lost margin or foregone revenue during wait
Annual Lever 2 value = one-time or annualized as appropriate
```

### Lever 3: Reliability
```
Reliability value = VoLL ($/hr) × avoided outage hours/year
Uri scenario = cost of 1-week outage (get their number or estimate by process)
Insurance delta = estimated premium reduction (request quote or use 10–15% of property value as proxy)
Annual Lever 3 value = reliability value + annualized Uri risk + insurance delta
```

### Lever 4: ESG / Permitting
```
Permitting value = cost of combustion permit delay or denial (use competitor timeline delta × revenue at risk)
Carbon value = avoided tons CO2e × internal carbon price (or $50/ton if no stated price)
ESG optionality = narrative value of hyperscaler PPA eligibility, SEC disclosure improvement
Annual Lever 4 value = quantify what's quantifiable; flag remainder as strategic
```

## Step 3 — Synthesize and Present

Output format:

---
**FOUR-LEVER VALUE CASE — [ACCOUNT NAME]**
*Inputs sourced: [list confirmed data points] | Estimated: [list assumptions]*

| Lever | Annual Value | Key Driver | Confidence |
|---|---|---|---|
| 1. Cost / Margin | $___M | [primary driver] | High/Med/Low |
| 2. Time-to-Power | $___M | [primary driver] | High/Med/Low |
| 3. Reliability | $___M | [primary driver] | High/Med/Low |
| 4. ESG / Permitting | $___M | [primary driver] | High/Med/Low |
| **Total Annual** | **$___M** | | |
| **20-Year NPV** | **$___M** | @ [X]% discount rate | |

**The No-Tradeoff Statement:**
Combustion/grid alternatives force [account] to sacrifice [specific lever(s)]. SOFC delivers all four simultaneously.

**Biggest Lever for This Account:** [Name the one lever that dominates — this drives the pitch emphasis]

**Data Gaps to Close Before G2:** [List the 2–3 numbers that would most change the value case]

---

## Step 4 — Questions Back

Always end with the 1–2 questions that would most sharpen the value case:
- "What's your current all-in $/MWh including demand and transmission?"
- "What did the last unplanned outage cost you in lost production?"
- "Where are you in the ERCOT interconnection queue, and what's your current estimated energization date?"

## Tone Rules
- Show the math. Every dollar claim must have a formula.
- Flag assumptions explicitly — never hide an estimate inside a "fact."
- Lead with the lever that's biggest for this account's vertical.
- Refiner → lead with reliability + permitting. Data center → lead with time-to-power + ESG. Industrial → lead with cost + reliability.
