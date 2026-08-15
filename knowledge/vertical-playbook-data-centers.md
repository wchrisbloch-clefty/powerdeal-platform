# Vertical Playbook — Data Centers

> Split from `vertical-playbooks.md` at v3.1.12. That file carried all three
> playbooks — refining, data centers and industrial manufacturing — at ~2,700
> tokens, and six of the seventeen skills declared it while **not one of them
> needs more than one vertical at a time.** A defense call was carrying
> hyperscaler clean-energy clauses and refinery steam balance; an industrial
> call was carrying both of the others.
>
> **The content below is unchanged from the original section.** Splitting a
> reference file is a filing decision, not an editorial one — rewriting it to
> read better standalone would destroy the record of what it actually said.

---

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
