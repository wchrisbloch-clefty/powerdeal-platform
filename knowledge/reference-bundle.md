# Commercial Structures — Detail Reference

## Structure Selection Guide

| Customer Situation | Best Structure | Why |
|---|---|---|
| Investment-grade, wants to own asset, has tax appetite | Capital Purchase | Captures ITC + MACRS; lowest long-term cost |
| Wants opex model, no capex appetite, creditworthy | PPA | Off-balance-sheet if structured correctly; fixed $/MWh |
| Wants full outsource including fuel and O&M | EaaS | All-in $/MWh; OEM carries all risk; simplest for customer |
| Wants to manage own gas procurement | Tolling | Capacity charge + variable O&M; customer takes fuel risk |
| Risk-averse, brownfield replacement | Shared Savings | Baseline comparison; savings split; no upfront commitment |

## PPA Structure — Key Term Positions

**$/MWh Rate**: Cost-plus with margin. Never anchor below our floor. Their push is always toward current utility rate — redirect to total cost of ownership (energy + demand + transmission + reliability value + avoided costs).

**Escalator**: 2–3%/yr or CPI-linked. Their push: fixed price or CPI cap. Trade: shorter initial term with extension options at pre-set rates.

**Term**: 15–20 years preferred. Their push: 10 years or less. Trade: shorter term at higher rate; longer term at lower rate. Build in extension options at favorable pre-set escalator.

**Performance Guarantee**: Our position: 95% availability. Their push: 98%+. Never negotiate performance in a vacuum — trade guarantee level for rate, term, or curtailment flexibility. Tiered structure: 95% base, bonus pool above 97%, LD below 92%.

**Curtailment**: Our position: limited, with compensation. Their push: unlimited. Minimum take-or-pay: 80% capacity factor floor.

**Fuel Pass-Through**: Preferred: index-linked with heat rate guarantee. If they want fixed all-in: add risk premium of 10–15% to cover hedge cost.

**Termination**: Our position: buyout at fair market value. Their push: termination for convenience. Counter: termination for convenience with declining breakage fee schedule (recover unrecovered capital).

## ITC / Tax Equity Reference

**Section 48E**: Fuel cells eligible for base 30% ITC.
- Energy community bonus: +10% (check current energy community map — search before citing)
- Domestic content bonus: +10% (confirm equipment origin with manufacturing team)
- Maximum potential: 50% ITC with all adders

**Tax Equity Structures**:
- Sale-leaseback: OEM sells asset to tax equity investor, leases back, operates under service agreement
- Partnership flip: OEM + tax equity in partnership; tax equity flips to minority after ITC recapture period
- Inverted lease: OEM leases to tax equity investor who claims ITC; complex but used for large deals

**Key risk**: Customer must have sufficient tax appetite to monetize ITC directly, or third-party tax equity is required. Always ask about tax position early.

**Always model**: Deal with ITC (base case), deal without ITC (downside), deal with full bonus ITC (upside). ITC should never be the thesis — it's upside.

---

# Fuel Supply & Hedging Reference

## Gas Supply Assessment (G1 Deliverable)

Before committing to economics, confirm:
1. **Pipeline access**: Is there a natural gas pipeline at or near the site? What's the pressure and capacity?
2. **Interconnection point**: Where does the gas tie into the facility? Meter location?
3. **Gas quality**: SOFC requires pipeline-quality gas — confirm H2S content, heating value, contaminants
4. **Distribution cost**: Confirm local distribution company (LDC) rates and tariff structure
5. **Basis risk**: Hub price (Henry Hub) vs. local delivery price differential — varies significantly by region

## Pricing Structure Options

| Structure | Description | Customer Risk | OEM Risk |
|---|---|---|---|
| Index float | Customer pays Henry Hub + basis + transport | High (price exposure) | Low |
| Fixed price | Supplier locks in price for term | Low | Supplier carries basis risk |
| Collar | Floor and ceiling around index | Medium | Medium |
| Basis swap | Customer locks basis, floats hub | Medium | Low |
| PPA/EaaS | OEM buys gas, passes risk into $/MWh | None (risk transfers to OEM) | High |

**In PPA/EaaS structures**: OEM carries fuel cost risk. This is manageable with hedging but must be priced into the $/MWh rate. Never offer a fixed $/MWh PPA without a clear hedging strategy.

## Gulf Coast Basis Risk

Gulf Coast gas markets have locational basis differentials vs. Henry Hub that can be significant:
- SONAT, Texas Eastern, ANR are key Gulf Coast pipelines
- Basis can be positive or negative depending on supply/demand balance
- Always get a current basis quote from a gas marketing desk before locking in economics

---

# Financial Modeling Reference

## Pro Forma Template — Quick Reference

See pro-forma skill for full calculation methodology. This file covers default assumptions.

**Default Assumptions (confirm with engineering and commercial before using):**
- SOFC heat rate: [Confirm with engineering — do not use a placeholder]
- Capital cost $/kW: [Confirm with commercial — do not use a placeholder]  
- O&M fixed: [Confirm with service team]
- O&M variable: [Confirm with service team]
- Stack replacement reserve: [Annualized — confirm interval with engineering]
- Capacity factor: 95% base case, 88% downside, 97% upside
- Useful life: 20 years
- Degradation: [Confirm curve with engineering]

**Customer Discount Rates by Vertical (ask — don't assume):**
- Industrial: 8–12% typical
- Refining (major IOC): 10–15% (higher hurdle rates for capital projects)
- Data centers: 8–10% typical
- PE-backed industrial: 15–20% (equity return requirement)

**Grid Escalation Assumptions:**
- Base: 3%/year
- Downside: 2%/year  
- Upside: 5%/year
- *Always search current utility rate trends for the specific geography before finalizing*

**Gas Price Assumptions:**
- Base: EIA Henry Hub forecast (search current — updates monthly)
- Downside: $5.00/MMBtu sustained
- Upside: $2.50/MMBtu sustained
- Always state the source date when presenting gas price assumptions

## LCOE Calculation

```
LCOE ($/MWh) = (Total Annualized Cost) / (Annual MWh Generated)

Total Annualized Cost =
  (Capital Cost × Capital Recovery Factor)
  + Annual O&M (fixed + variable)
  + Annual Fuel Cost
  + Annual Stack Reserve
  + Annual Gas Infrastructure (amortized)
  + Annual Electrical Integration (amortized)
  
Capital Recovery Factor = r(1+r)^n / ((1+r)^n - 1)
  where r = discount rate, n = project life in years
  
Annual MWh = System kW × 8,760 hours × Capacity Factor
```

---

# Contract Negotiation Playbook

## Pre-Negotiation Checklist

Before any term sheet or negotiation:
- ☐ Know our BATNA (what happens if this deal doesn't close)
- ☐ Know their BATNA (grid delay? combustion permit risk? status quo cost?)
- ☐ Map the 3–5 terms that matter most to us
- ☐ Map the 3–5 terms that matter most to them (ask, don't assume)
- ☐ Build the concession map: what we'll trade, what we won't, what we'll trade for what
- ☐ Know the decision-maker's personal win: what does this person need to look good?
- ☐ Identify the authority level in the room: can they say yes, or are they reporting back?

## Concession Map Template

| Term | Our Anchor | Their Push | Our Fallback | What We'll Accept in Trade |
|---|---|---|---|---|
| $/MWh | Cost-plus + margin | Utility rate match | Lower start + steeper escalator | Longer term OR higher escalator |
| Term | 20 years | 10 years | 15 years | Higher rate for shorter term |
| Performance | 95% availability | 98% | Tiered structure | Higher guarantee for higher rate |
| Escalator | 2–3% or CPI | Fixed | CPI cap | Shorter term with extension options |
| Termination | FMV buyout | Term for convenience | Breakage fee schedule | Declining fee over term |

## Hard Limits (never move without principal approval)
- Minimum availability guarantee floor: [Confirm with engineering]
- Minimum take-or-pay volume: 80% capacity factor
- Maximum term for convenience exposure without breakage fee
- Minimum fuel cost pass-through protection in fixed-price structures

## Redline Patterns (what to expect and how to respond)

**Performance guarantee redline**: Don't negotiate in vacuum. Trade guarantee level for rate, term, or curtailment.

**LD cap removal**: Never accept uncapped LDs. Standard: LD cap at [X]% of contract value — confirm with legal.

**Unlimited curtailment**: Minimum take-or-pay. "The economics require a baseline utilization — here's why."

**Change of control**: Standard: consent not unreasonably withheld. Watch for silent change of control provisions that could be triggered by internal restructuring.

**Assignment**: Our right to assign to tax equity or financing partner must be preserved — non-negotiable.

---

# Prospect Origination Playbook

## ICP Scoring Guide — Detailed

**Power Need (1–5)**
- 5: 5+ MW, continuous 24/7 process (refinery, data center, chemical, paper)
- 4: 3–5 MW, mostly continuous with some cycling
- 3: 1–3 MW, mostly baseload
- 2: <1 MW or significant load variation (peaking demand)
- 1: <500 kW or highly variable / peaking only

**Grid Pain (1–5)**
- 5: ERCOT queue 3+ years confirmed, or no grid access, or substation at capacity
- 4: Grid available but 18–36 month queue or significant constraint
- 3: Grid available, constrained but workable (12–18 months)
- 2: Grid available, some cost or reliability concern
- 1: Cheap, reliable grid, spare capacity available

**Permitting Pressure (1–5)**
- 5: HGB or Baton Rouge non-attainment, NOx budget effectively exhausted
- 4: Non-attainment zone, combustion permittable but costly and slow
- 3: Attainment area but complex permitting (Title V facility, community opposition)
- 2: Standard permitting, no significant constraint
- 1: Simple permitting, combustion straightforward

**ESG/Regulatory Driver (1–5)**
- 5: Public Scope 1/2 targets with specific year, SEC disclosure, hyperscaler clean energy mandate
- 4: Public sustainability commitments, internal carbon price, ESG reporting
- 3: Internal sustainability goals, voluntary reporting, industry pressure
- 2: Minimal ESG pressure, no public commitments
- 1: No ESG pressure, no reporting requirements

**Financial Capacity (1–5)**
- 5: Investment-grade (BBB+ or better), active capex cycle, or strong PPA credit
- 4: Investment-grade, moderate capex budget, competitive but winnable
- 3: Sub-investment-grade but stable, PPA-capable with support
- 2: Stretched balance sheet, limited capex, PPA difficult to structure
- 1: Distressed, no budget, no credit for PPA

## Outreach Templates

**ERCOT Queue / Time-to-Power Hook:**
> Subject: [Company] power timeline — something worth knowing
> 
> [Name] — [Company]'s ERCOT large-load request puts your energization date around [estimated year]. At your projected [facility/expansion] timeline, that's a [X]-month gap that costs you roughly [$X/month] in foregone [production/revenue].
> 
> We've solved that problem for [comparable company in similar situation]. Worth 20 minutes?
> 
> [Name]

**Non-Attainment / Permitting Hook:**
> Subject: [Company]'s HGB permit situation
> 
> [Name] — any combustion-based generation at [facility] in HGB is looking at 18–36 months of TCEQ NSR review — and the NOx budget has gotten tight enough that three comparable projects were denied in the last two years.
> 
> There's a path that bypasses NSR entirely. 20 minutes?

**Reliability / Aging Cogen Hook:**
> Subject: [Refinery name] cogen — the math on aging assets
> 
> [Name] — [facility]'s cogen unit is [X] years old. At that age, the maintenance cost curve and reliability risk typically look like [description]. The question most reliability engineers are asking right now is not whether to replace it, but what to replace it with given the HGB permitting environment.
> 
> We work with several Gulf Coast refineries on exactly this. Worth a conversation?

---

# Methodology Reference

## When to Use Each Framework

This file exists for when the user explicitly asks about methodology. Never name-drop frameworks in customer-facing outputs.

**Challenger**: Use when opening a deal. Lead with a commercial insight the customer hasn't quantified. Teach before pitching. "Here's something about your business that you may not have put a dollar sign on..."

**Gap Selling**: Use in discovery. Diagnose the quantified gap between current state (cost, risk, timeline) and achievable future state before proposing anything. "What does your current situation cost you — not in discomfort, but in dollars?"

**Voss Negotiation**: Use in negotiation and objection handling. Label the emotion first. Mirror their specific language. Ask calibrated "how/what" questions. Never ask "why" — it's accusatory. Seek "That's right" breakthroughs (different from "you're right").

**SPIN**: Use to structure discovery call sequences. Situation questions confirm the baseline. Problem questions surface pain. Implication questions quantify the cost of the problem. Need-payoff questions let the customer articulate the value of solving it.

**SNAP**: Use when the customer is overwhelmed or overloaded. Keep every interaction Simple. Position as iNvaluable. Stay Aligned to their stated priorities. Be the clear Priority in their crowded agenda.

**JOLT**: Use when a deal is stalling from indecision rather than a specific objection. The customer sees the value but can't pull the trigger. Shatter the status-quo paralysis with a specific, personalized consequence of inaction.

**Extreme Ownership**: Apply internally. Own every outcome. If a deal is stuck, the reason is usually within our control to affect — stakeholder access, value case clarity, structure creativity, executive sponsorship. No hedging, no excuses.

**Five Moves Ahead**: Apply to every active deal. Name the next move, the one after, and the failure mode you're preempting. Never leave a deal with only one next step defined.

**The Council**: Apply to high-stakes decisions — go/no-go on a deal, major concession, strategic account move. Five advisors, adversarial peer review, chairman synthesis. See war-room skill.

---

# Electrical Integration Reference

## One-Line Diagram Guide for BD/AE

What to look for when you receive a site one-line:

1. **Service entrance**: Where does utility power enter? What voltage? What size?
2. **Main switchgear**: What's the fault duty rating? Is there spare breaker space?
3. **Existing generation**: Is there existing cogen, diesel, or solar shown? How is it tied in?
4. **Tie point candidates**: Where could SOFC connect? Is there an existing bus section that works?
5. **Critical loads**: What loads are shown as "critical" or on emergency power?
6. **Grounding**: What grounding configuration is shown?

Red flags on the one-line:
- No spare breaker capacity in main switchgear → new switchgear required (cost impact)
- Existing generation tied in without clear protection scheme → protection coordination study needed
- Classified area markings near proposed SOFC location → hazardous area design required
- No space shown for new equipment → civil work required

Hand the one-line to engineering with your observations — don't interpret beyond what's visible.

## SCADA Protocol Quick Reference

| Protocol | Common In | Notes |
|---|---|---|
| Modbus TCP/IP | Older industrial systems, distributed devices | Widely supported; SOFC should support natively |
| DNP3 | Utility SCADA, substations | More common in utility-interactive applications |
| OPC-UA | Modern industrial DCS | Preferred for new installations; vendor-agnostic |
| BACnet | Building automation, some industrial | Less common for heavy industrial SOFC apps |

Key question for customer: "What protocol does your DCS support, and is your SCADA team comfortable with a new integration, or do you prefer plug-and-play?"
