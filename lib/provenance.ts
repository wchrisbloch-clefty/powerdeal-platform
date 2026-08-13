/**
 * EVERY FIGURE CARRIES ITS SOURCE, IN THE BODY.
 *
 * The rule that already existed was source TIERING — [VERIFIED] / [REPORTED] /
 * [INFERRED] on every number. This extends it: a tier says how much to trust a
 * figure, and a SOURCE says how to check it, and only the second one survives
 * the meeting where somebody asks.
 *
 * IN THE BODY, NOT A FOOTNOTE. A footnote is read by the person who already
 * doubted the number; the reader who needs to see it is the one who did not.
 * "(CPUC Decision A.25-05-012, Dec 2025)" sits inline, where the claim is.
 *
 * The reference document that prompted this printed "~116 MW" bare — a figure
 * nobody can check, in a document whose whole credibility rests on being
 * checkable.
 */

/** The three tiers, already enforced by the card prompts. */
const TIER = /\[(VERIFIED|REPORTED|INFERRED)\]/;

/**
 * An inline citation: anything parenthesised that carries a year.
 *
 * Deliberately loose on FORM and strict on the YEAR. A citation without a date
 * is the failure this is aimed at — "(CPUC decision)" tells a reader nothing
 * about whether the number is current, and a tariff figure from 2019 quoted in
 * 2026 is wrong in the direction that loses deals.
 */
const CITATION = /\([^)]*\b(19|20)\d{2}\b[^)]*\)/;

/** Anything that reads as a quantity a reader could check. */
const FIGURE =
  /(?:\$\s?[\d,]+(?:\.\d+)?\s*(?:[KMB]|million|billion)?|[\d,]+(?:\.\d+)?\s*(?:MW|MWh|kW|kWh|%|\$\/MWh|\$\/kW))/i;

/** Does this line state a figure at all? */
export function hasFigure(line: string): boolean {
  return FIGURE.test(line);
}

/**
 * A figure with neither a tier nor an inline citation.
 *
 * Returns FALSE for a line with no figure in it — "not a violation" and "not
 * applicable" are the same answer to a caller deciding whether to flag, and
 * conflating them would flag every sentence in the document.
 */
export function untagged(line: string): boolean {
  if (!hasFigure(line)) return false;
  return !TIER.test(line) && !CITATION.test(line);
}

/** Every offending line, for a pre-export warning that names them. */
export function untaggedFigures(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => untagged(l));
}

/**
 * The instruction block, shared by every prompt that emits a number.
 *
 * One string so the rule cannot drift between the no-decision card, the
 * pricing defense and whatever comes next — three copies of a rule is three
 * rules, and they diverge on the first edit.
 */
export const INLINE_SOURCE_RULE = `INLINE SOURCE AND DATE — MANDATORY, IN THE BODY

Every figure carries its source and its date in the sentence that states it,
inside parentheses, not in a footnote:

    "SDG&E's approved increase runs 8% (CPUC Decision A.25-05-012, Dec 2025)"
    "roughly 116 MW across the three sites [REPORTED — CB site walk, Mar 2026]"

A footnote is read by the person who already doubted the number. The reader who
needs to see it is the one who did not.

A figure with no source is not a figure — write the gap instead, naming what
would close it: "Peak demand: not yet obtained — needs 12 months of interval
data." That is a discovery checklist and it is the intended output.

This is SEPARATE from and ADDITIONAL to the tier tag. The tier says how much to
trust the number; the source says how to check it. Only the second one survives
the meeting where somebody asks.`;

/**
 * THE RETURN PATH — every champion-facing artifact closes its own loop.
 *
 * A document that produces new information and does not say where it goes
 * leaves the record to memory, and the record is the thing this build exists
 * to keep honest. The artifact names the fields the conversation should
 * update, so the loop closes without anybody remembering to close it.
 *
 * Fields are named as they appear in the Spine, not paraphrased — a reader
 * looking for "the champion field" should be able to find it.
 */
export const RETURN_PATH_RULE = `THE RETURN PATH — CLOSE WITH IT, ALWAYS

End the document with a short section titled "What this should update", naming
the Spine fields this conversation is likely to change. Name them as the Spine
names them, not paraphrased:

    - champion — if a name emerged, the deal stops being single-threaded and
      health uncaps from 6
    - economic_buyer — if the signer or the approval threshold was named
    - critical_event / critical_event_date — if a deadline surfaced
    - decision_process — if the steps or the committee were described
    - deal_competitors — if a new opponent was named, or an existing one moved

Only list the fields this particular document could plausibly move. A generic
list of every field is a list nobody reads.`;
