# ERCOT Market Primer
*Always web-search for current data before citing. ERCOT conditions change weekly.*

## Structure

ERCOT is the grid operator for ~90% of Texas. It's an energy-only market — no capacity payments. This matters because:
- Generators only get paid when they produce (no capacity revenue)
- Scarcity pricing can spike to $5,000/MWh during tight supply
- Customers with interruptible contracts face curtailment risk

## Key Mechanisms for BTM Sales

**4CP (Four Coincident Peaks)**
- ERCOT calculates transmission charges based on customer demand during the 4 highest system-peak hours each June–September
- A customer's 4CP exposure = $/kW-month × peak kW × 12 months
- BTM generation that reduces load during 4CP hours captures this savings
- This is often $5–15/kW-month — a significant lever for industrial customers
- *Confirm current 4CP rate with web search before using in pro forma*

**ORDC (Operating Reserve Demand Curve)**
- When system reserves drop below threshold, ORDC adds a scarcity adder to real-time prices
- This is what drove $9,000/MWh prices during Uri (Feb 2021)
- BTM generation eliminates exposure to ORDC spikes for behind-the-meter load
- Probabilistic value = expected spike hours × expected spike magnitude × customer kW exposure

**Transmission Queue (LCRA/Oncor/CenterPoint/AEP Texas/TNMP)**
- ERCOT interconnection queue for large loads: *search current wait time before citing*
- General range: 4–7 years in most zones as of 2025–2026
- This is the single most powerful time-to-power argument
- Source: ERCOT public interconnection queue filings (updated monthly)

**BTM Non-Export Configuration**
- BTM generation serving onsite load typically does not require ERCOT registration
- Requires utility (TDU) interconnection agreement regardless
- Non-export = reverse power relay prevents power flowing back to grid
- Timeline for BTM non-export interconnection agreement: 3–12 months (vs. 4–7 years for grid service)

**Post-Uri Reforms**
- Weatherization requirements now mandatory for generation and transmission
- ERCOT has added ancillary service products (ECRS) to improve reliability
- Despite reforms, the fundamental supply/demand imbalance driving BTM demand remains
- *Search for latest PUCT/ERCOT reform status before citing specifics*

## ERCOT Deal Math Template

```
Customer peak demand: [X] kW
4CP rate: [$Y]/kW-month (search current)
4CP annual savings via BTM: X × Y × 12 = $___

Grid queue delay: [Z] years (search current for customer zone)
Revenue at risk: [$__/month] × Z years × 12 = $___

Uri scenario (1-week outage): [Customer's process cost] = $___

ERCOT real-time spike exposure (probabilistic):
  Expected spike hours/year × expected $/MWh × customer kW ÷ 1000 = $___/yr
```
