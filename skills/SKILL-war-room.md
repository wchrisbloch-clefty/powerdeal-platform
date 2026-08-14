---
name: war-room
knowledge: [competitive-matrix.md, objection-battlecards.md, permitting-playbook.md]
description: >
  Run a structured adversarial pressure test on a deal, account, or strategy decision using a
  five-advisor council. Triggers on: "war room this", "pressure test", "stress test this deal",
  "council this deal", "what could kill this deal", "poke holes in this", "devil's advocate",
  "is this deal real", "how do we win [account]". Also trigger when a deal appears stuck, when
  a stage-gate has stalled more than 30 days, or when the user expresses uncertainty about deal
  health. Output is a COUNCIL VERDICT with clear recommendation and single next action.
---

# Power Deal War Room

A five-advisor adversarial council applied to a specific deal or decision. Built on the LLM Council
methodology. Runs in full when triggered — no abbreviated versions.

## Step 1 — Frame the Deal

Before running advisors, establish:
- Deal: [Account, MW, vertical, commercial structure]
- Current stage: [G0–G8]
- Stated problem: [Why is this being war-roomed? Stuck deal? Go/no-go? Term negotiation?]
- Key context: [Champion, economic buyer, competitive situation, timeline]
- What a win looks like: [Stage advance, contract, pilot commitment]

## Step 2 — Five Advisor Responses

Each advisor analyzes the deal from their lens only. 150–220 words each.

```xml
<Advisor name="Deal Assassin">
Hunts for the fatal flaw. Assumes the deal is weaker than it looks. Probes: Is the champion real?
Does the economic buyer know this exists? Is the pain quantified or assumed? Is there a combustion
incumbent with political cover? Is the timeline driven by a real event or is it wishful?
Perspective bias: May over-weight risk and miss genuine momentum signals.
</Advisor>

<Advisor name="Customer Advocate">
Thinks only from the buyer's perspective. What are they actually optimizing for? What internal
politics are invisible to the seller? What does saying yes cost them politically? What would make
this an easy yes vs. a career risk?
Perspective bias: May under-weight seller's ability to reshape the buyer's decision criteria.
</Advisor>

<Advisor name="Commercial Strategist">
Focuses on deal structure, terms, and commercial positioning. Is the right structure being proposed?
PPA vs. capital sale vs. EaaS — which actually solves their problem? What's the BATNA on both sides?
Where is value being left on the table or conceded too early?
Perspective bias: May optimize for deal elegance over speed of close.
</Advisor>

<Advisor name="Execution Realist">
Only cares about what happens in the next 30 days. What specific action moves the needle? Who needs
to be in what room? What deliverable unlocks the next gate? What's the most likely reason this stalls
and how do we prevent it now?
Perspective bias: May sacrifice strategic positioning for tactical momentum.
</Advisor>

<Advisor name="Pattern Recognizer">
Compares this deal to the playbook. Does the pain map match the ICP? Does the stakeholder pattern
suggest a champion or a blocker in disguise? What does the four-lever diagnostic say about where
value is concentrated? What objections are likely next?
Perspective bias: Pattern matching can miss genuinely novel deal dynamics.
</Advisor>
```

## Step 3 — Peer Review

Each advisor reviews the others' anonymized responses (A–E):
1. Strongest response and why
2. Biggest blind spot
3. What all responses missed

## Step 4 — Council Verdict

**Devil's Advocate Check**: If 4+ advisors agree, steelman the minority view before issuing verdict.

Output structure:

---
## POWER DEAL WAR ROOM — [ACCOUNT] | [DATE]

**Where the Council Agrees**
[High-confidence convergence points]

**Where the Council Clashes**
[Genuine disagreements — present both sides]

**Blind Spots the Council Caught**
[Insights that only emerged through peer review]

**The Recommendation**
[Clear, direct. Can override majority if logic is stronger.]

**Council Confidence: [High / Medium / Low]**
[One sentence on why]

**The One Move to Make First**
[Single concrete next action — not a list]

---

## PowerDeal-Specific Lenses (apply to every war room)

Always check these regardless of stated problem:
- Is the champion able to actually mobilize budget, or are they an influencer mistaken for a buyer?
- Has the four-lever value case been quantified with the customer's own numbers, or is it still our math?
- Is there a combustion or grid incumbent with a relationship advantage we're not accounting for?
- What's the permitting situation — is non-attainment a tailwind we're not using?
- What's the real timeline driver — is there an event (turnaround, budget cycle, energization deadline) or are we making one up?
