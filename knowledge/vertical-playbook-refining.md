# Vertical Playbook — Downstream Refining

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
