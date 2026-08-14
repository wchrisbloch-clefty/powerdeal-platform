# Vertical Playbooks — Refining, Data Centers, Industrial Manufacturing

---

## PLAYBOOK 1: DOWNSTREAM REFINING

### Why This Vertical Now
Gulf Coast refineries face a convergence of pressures: aging cogen fleets (many installed 1980s–2000s), HGB non-attainment NOx constraints blocking replacement with combustion, post-Uri reliability mandates, and crack spread pressure demanding process continuity. SOFC is the only solution that addresses all four simultaneously.

### Load Profile
- Typical refinery power demand: 20–150+ MW (large complex refineries)
- Load is continuous, highly stable — baseload by definition
- Steam demand is significant — probe cogen steam balance early
- Critical loads: Crude unit, FCC, hydrocracker, distillation — all require uninterrupted power
- Restart cost after unplanned outage: $2–10M per event (industry benchmark — ask for their number)

### Cogen Interaction
Many refineries have aging cogen (gas turbine + HRSG). Key questions:
- Age of existing cogen? (>15 years = approaching end of economic life)
- What does steam balance look like if cogen goes offline?
- Is SOFC replacing cogen, supplementing it, or serving as backup?
- If replacing: steam generation must be addressed separately (HRSG, package boilers)

### Stakeholder Map
| Role | Primary Concern | Engagement Strategy |
|---|---|---|
| Plant Manager | Reliability, operational continuity, HSE | Lead with zero planned outage; quantify restart costs |
| Utilities Superintendent | Technical fit, integration, maintenance burden | Ask for one-line; speak SCADA and protection language |
| Reliability Engineer | Technology risk, unplanned outage exposure | Fleet data, reference sites, uptime guarantees |
| Energy Manager | Cost per MWh, 4CP exposure, demand charges | Run the four-lever cost analysis with their numbers |
| HSE Director | Safety profile, permitting risk | No combustion, no rotating equipment, no high-pressure steam |
| Procurement | Competitive bids, contract terms | Help define RFP criteria; SOFC naturally wins on permitting + emissions |
| Corporate Sustainability | Scope 1/2 targets, NOx/SOx, SEC disclosure | NOx/SOx elimination, no combustion, bridge to hydrogen |
| VP Operations | Business case, peer benchmarking, capex | Executive briefing with peer refinery reference |
| CFO | Payback, structure, competing capex | PPA/EaaS to move off balance sheet; ITC mechanics |

### Discovery Questions (Refining-Specific)
1. "What's your current cogen configuration and how old is the primary unit?"
2. "What did the last unplanned outage cost you — total — including lost production and restart?"
3. "Where are you in TCEQ's process for any replacement or additional generation capacity?"
4. "What's your steam balance — if the cogen goes down, what happens to your process steam?"
5. "How are you thinking about your reliability posture post-Uri?"

### Challenger Hook (Refining)
> "Your HGB facility's NOx budget has [X] headroom remaining. Any combustion replacement above [threshold] triggers NSR — that's 18–36 months and an uncertain outcome. Three refineries in the corridor tried in the last two years. Two were denied. Meanwhile, every month of reliability risk on your aging cogen is [$/month in restart exposure]. There's a path that bypasses the permitting entirely and eliminates the planned downtime your current maintenance window creates."

### Decision Process (Refining)
- AFE (Authorization for Expenditure) required — plant → BU → corporate capital committee → board if >$50M
- FEL stages: FEL-1 (concept) → FEL-2 (feasibility) → FEL-3 (detailed design) — each requires internal approval
- Engineering/technical validation is gate-keeper — reliability engineer and HSE must sign off
- Procurement enters after technical selection — sole-source possible if justified on permitting/emissions grounds
- Typical cycle: 12–24 months from G0 to AFE approval

---

## PLAYBOOK 2: DATA CENTERS

### Why This Vertical Now
Hyperscalers have committed to gigawatts of new data center capacity. The grid cannot deliver. ERCOT interconnection timelines of 4–7 years are the binding constraint on their expansion plans — not capital, not land, not permits. Power is the bottleneck. Simultaneously, hyperscalers have clean energy mandates that eliminate combustion from consideration. SOFC is the only solution that solves both.

### Load Profile
- Hyperscale campus: 100–500+ MW (often phased)
- Colocation / edge: 5–50 MW
- Load is continuous, 24/7, extremely stable — perfect baseload profile
- Power quality requirements are extreme: zero-break transfer, tight voltage/frequency regulation
- PUE (Power Usage Effectiveness) is a key metric — SOFC waste heat can improve PUE via absorption cooling

### Topology Considerations
- N+1 or 2N redundancy is required — SOFC must fit the redundancy architecture
- UPS integration: SOFC as primary behind UPS with generator backup, or as the generator replacement
- Island-capable microgrid is the target configuration — grid-parallel normal, seamless island on grid loss
- ATS (automatic transfer switch) or static transfer switch for zero-break capability

### Hyperscaler Clean Energy Requirements
- Corporate clean energy commitments (24/7 CFE, RE100, etc.) vary by company — search before citing
- Key question: Does SOFC qualify under their clean energy definition?
  - SOFC uses natural gas — not "renewable" but also not combustion
  - Zero NOx/SOx = no direct air quality impact
  - Lower carbon intensity than grid in most markets
  - Bridge to hydrogen: SOFC is H2-ready, which matters for long-term clean energy commitments
- Strategy: Position as "lowest-carbon firm power" for interim period + hydrogen-ready for long-term

### Stakeholder Map
| Role | Primary Concern | Engagement Strategy |
|---|---|---|
| Site Selection | Power availability and timeline | Lead with time-to-power: "18 months vs. 5+ years" |
| Critical Facilities Engineering | Redundancy, tier compliance, integration | Speak N+1/2N; propose island-capable microgrid architecture |
| Sustainability/ESG | Clean energy mandate, Scope 1/2 | 24/7 CFE positioning; hydrogen-readiness roadmap |
| Real Estate | Timeline, site constraints | SOFC as enabler of accelerated site go-live |
| Energy Procurement | PPA structure, $/MWh, escalator, term | PPA negotiation playbook; ITC pass-through |
| VP Operations | Availability, SLAs, service model | Zero planned downtime; 24/7 OEM remote monitoring; fleet data |

### Discovery Questions (Data Centers)
1. "What's your committed go-live date for this campus, and what's your current grid energization estimate?"
2. "What's your clean energy definition — do you need 24/7 CFE, or is annual matching acceptable?"
3. "What redundancy architecture are you targeting — N+1 at the facility level or 2N at the critical load level?"
4. "What's your PUE target, and are you considering waste heat utilization?"
5. "Have you modeled the cost of a 12-month delay in campus go-live?"

### Challenger Hook (Data Center)
> "Your campus go-live is committed for [date]. Your ERCOT energization estimate is [year]. That's a [X]-month gap during which your [campus name] sits dark. At your projected revenue run rate, that gap is worth [$X/month] in foregone revenue. We can close that gap. And because we're not combustion, your sustainability team can say yes without a carve-out."

### Decision Process (Data Centers)
- Energy procurement team drives but sustainability, site engineering, and finance all have veto
- Can move fast (weeks–months) when power is the binding constraint on a committed campus
- Legal review is extensive — large PPAs with indemnification and performance guarantees
- Key veto points: Corporate sustainability (clean energy criteria must be met), site engineering (tier and redundancy requirements)

---

## PLAYBOOK 3: INDUSTRIAL MANUFACTURING

### Why This Vertical Now
Reshoring of manufacturing — semiconductors, EVs, batteries, chemicals, food processing — is creating a wave of greenfield and brownfield industrial power demand. New builds need power fast, and grid queues cannot serve them on project timelines. Existing plants face margin pressure that makes energy cost and process continuity critical.

### Load Profile
- Range: 2–50 MW depending on process
- Continuous process manufacturers (chemical, food, glass, paper) are highest ICP fit
- Batch or discrete manufacturers have more variable loads — less ideal
- Process restart costs vary widely — ask directly: "What does a 4-hour unplanned outage cost you?"

### Stakeholder Map
| Role | Primary Concern | Engagement Strategy |
|---|---|---|
| Plant Manager | Production continuity, operational simplicity | Reliability and zero planned downtime |
| Facilities/Utilities Manager | Technical integration, maintenance | Ask for one-line; speak SCADA language |
| EHS | Safety, permitting, emissions | No combustion = no NSR, no safety exposure from rotating equipment |
| Procurement | Competitive bids, LCOE | Shape RFP criteria; LCOE comparison methodology |
| Corporate Energy | Portfolio strategy, rate optimization | 4CP avoidance; long-term cost certainty via PPA |
| CFO | Payback, competing capex, structure | PPA/EaaS to eliminate capex competition; simple payback framing |
| VP Operations | Expansion timeline, margin | Time-to-power as expansion enabler |

### Discovery Questions (Industrial)
1. "What's your current all-in energy cost — including demand, transmission, and ancillary?"
2. "How sensitive is your production margin to energy cost — is power in your top 3 variable costs?"
3. "What did your last unplanned outage cost in lost production — and how often does that happen?"
4. "Are you planning any capacity expansion in the next 24 months, and is power a constraint on that timeline?"
5. "What's your current utility contract structure — are you locked in, and when does it expire?"

### Challenger Hook (Industrial)
> "Your [plant] is running [X] cents/kWh all-in including demand. At your production volume, that's [$X/year]. A 3%/year grid escalation over 10 years turns that into [$X+30%]. Meanwhile, your competitors who locked in BTM baseload last year have cost certainty we can calculate to the dollar. Here's what your energy cost trajectory looks like against theirs — and here's what it costs you to wait."

### Decision Process (Industrial)
- Plant manager or facilities drives; escalates to division or corporate based on deal size
- Typically tied to production expansion or equipment replacement cycle — find the event
- More price-sensitive than refining or data centers — LCOE comparison is central
- CFO is often the key veto point — competing capex is the most common blocker
- PPA/EaaS structure moves the conversation from capex competition to opex savings
- Typical cycle: 6–18 months from G0 to commitment
