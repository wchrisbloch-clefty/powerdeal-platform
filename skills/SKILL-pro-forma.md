---
name: pro-forma
description: >
  Build or validate the financial pro forma for a deal. Triggers on: "check the economics",
  "sanity check", "pro forma", "does the math work", "build the financial model", "what's the
  payback", "IRR", "NPV", "LCOE", "what's our value case economics", "run the numbers".
  Output is a structured financial analysis with savings stack, cost stack, key metrics, and
  sensitivity scenarios. Always run all three scenarios (base/downside/upside). Flag every
  assumption explicitly.
---

# Pro Forma Sanity Check

Build or validate deal economics. Show the math. Flag every assumption.

## Step 1 — Collect Inputs

**Required (ask if missing):**
- System size (kW or MW)
- Customer's current all-in $/MWh
- Annual MWh consumption (or load factor × capacity)
- Gas price assumption (default: EIA 2026 forecast ~$3.67/MMBtu — confirm current via web search)
- Commercial structure: Capital sale / PPA / EaaS
- Geography (for ITC eligibility, energy community bonus, gas basis)
- Customer discount rate (ask — typical range 8–12% for industrials)

**Estimate if unavailable (flag clearly):**
- SOFC heat rate: [confirm with engineering — do not invent]
- Capital cost $/kW: [confirm with commercial team — do not invent]
- O&M cost: [confirm with service team — do not invent]
- Stack replacement reserve: annualized over 20-year life

## Step 2 — Savings Stack

```
1. Energy cost avoidance
   = (Customer $/MWh − SOFC all-in $/MWh) × annual MWh
   = $___

2. Demand charge avoidance
   = Monthly $/kW-month × peak kW reduction × 12
   = $___

3. 4CP transmission avoidance (ERCOT only)
   = 4CP $/kW-month × peak kW reduction × 12
   = $___

4. Reliability value
   = VoLL ($/hr) × avoided outage hours/year
   = $___

5. Carbon/ESG value
   = Avoided tons CO2e × internal carbon price (or $50/ton default)
   = $___

6. ITC value (capital sale or tax equity structure)
   = [ITC %] × eligible capital cost
   = $___  (one-time)

7. MACRS depreciation benefit
   = After-tax NPV of 5-year MACRS on eligible basis
   = $___  (NPV)

TOTAL ANNUAL SAVINGS (excl. one-time): $___M
TOTAL ONE-TIME VALUE: $___M
```

## Step 3 — Cost Stack

```
1. Capital cost (or PPA/EaaS rate)
   = $___/kW installed × kW = $___  OR  $___/MWh × annual MWh = $___/yr

2. Fuel cost
   = Gas price ($/MMBtu) × heat rate (BTU/kWh) ÷ 1,000,000 × annual kWh
   = $___/yr

3. O&M (fixed + variable)
   = $___/kW-yr (fixed) + $___/MWh (variable)
   = $___/yr

4. Stack replacement reserve
   = Total replacement cost ÷ replacement interval years
   = $___/yr

5. Gas infrastructure (one-time)
   = Pipeline, metering, conditioning
   = $___

6. Electrical integration (one-time)
   = Switchgear, transformer, protection, SCADA
   = $___

7. Permitting & development (one-time)
   = $___

TOTAL ANNUAL COST: $___M
TOTAL ONE-TIME COST: $___M
```

## Step 4 — Key Metrics

```
Net Annual Benefit = Total Annual Savings − Total Annual Cost = $___M

Simple Payback = Total Installed Cost ÷ Net Annual Benefit = ___ years

IRR (20-year, pre-tax) = ___%
IRR (20-year, after-tax, with MACRS + ITC) = ___%

NPV @ [X]% discount rate, 20 years = $___M

LCOE (all-in $/MWh) = $___
Customer's current $/MWh = $___
LCOE advantage = $___ or ___%

20-Year Total Cost of Ownership vs. Grid = $___M savings
```

## Step 5 — Sensitivity Scenarios

Always run all three. Use system prompt sensitivity table as defaults, update with current data.

| Scenario | Gas Price | Capacity Factor | ITC | Grid Escalation | NPV | Payback |
|---|---|---|---|---|---|---|
| **Base** | $3.67/MMBtu | 95% | 30% | 3%/yr | $__ | __ yrs |
| **Downside** | $5.00/MMBtu | 88% | 0% | 2%/yr | $__ | __ yrs |
| **Upside** | $2.50/MMBtu | 97% | 50% | 5%/yr | $__ | __ yrs |

Note: Confirm current gas price via web search before using. EIA Henry Hub forecast updates monthly.

## Step 6 — Sanity Check Questions

Flag any of these as red if triggered:
- ☐ Does the LCOE beat the customer's current rate in the base case?
- ☐ Is simple payback <10 years in the base case?
- ☐ Is the deal NPV-positive even in the downside scenario?
- ☐ Are all capital cost inputs confirmed by commercial/engineering (not estimated)?
- ☐ Has the gas supply cost been confirmed (pipeline capacity, basis differential)?
- ☐ Is the ITC eligibility confirmed (energy community, domestic content)?

## Step 7 — Output Summary

---
**PRO FORMA SUMMARY — [ACCOUNT] | [DATE]**
*[X] MW SOFC | [Commercial Structure] | [Discount Rate]%*

| Metric | Value | Assumption Quality |
|---|---|---|
| Annual net benefit | $___M | Confirmed / Estimated |
| Simple payback | ___ years | Confirmed / Estimated |
| After-tax IRR | ___% | Confirmed / Estimated |
| 20-yr NPV | $___M | Confirmed / Estimated |
| LCOE advantage | $___/MWh | Confirmed / Estimated |

**Biggest Assumption Risk:** [The one number that most changes the outcome]
**Data Gaps to Close:** [What engineering/commercial must confirm before customer presentation]

---
