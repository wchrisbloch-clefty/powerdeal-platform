/**
 * ═══════════════════════════════════════════════════════════════
 * THE GRADE THAT ARRIVES WITHOUT A NUMBER.
 * ═══════════════════════════════════════════════════════════════
 *
 * Practice is ungraded. The buyer responds as the buyer; nothing tells the
 * reader how they did. That is a property of a response, and a response is
 * generated at runtime, in words that never exist in this repo — so a source
 * scan cannot see it, for exactly the reason a grep over components/ could
 * never catch a model emitting `#4472C4`.
 *
 * A model told not to grade will still write "that's a solid framing", because
 * being encouraging is what being helpful looks like from the inside. The
 * instruction reduces the incidence. This is the check.
 *
 * ══ IT SURFACES. IT NEVER STRIPS ══
 *
 * ⚠️ A QUIETLY SCRUBBED GRADE IS INDISTINGUISHABLE FROM ONE THAT WAS NEVER
 * WRITTEN. Deleting the offending sentence would make the surface look
 * permanently compliant and would hide the one signal worth having: that the
 * prompt is drifting. Every finding is rendered beside the response, naming the
 * phrase and the rule it broke. That is the same argument as the readError
 * banner, the deploy-behind row, and `unrenderable` — the failure has to be
 * visible and specific or it is not a failure anyone can act on.
 *
 * ══ THE FOUR THINGS IT LOOKS FOR ══
 *
 *   assent      A buyer opening with "that's fair" or "good point". Assent is a
 *               grade in character costume: a buyer who agrees should agree by
 *               MOVING — conceding the point and going somewhere new — not by
 *               praising the person who made it.
 *
 *   verdict     Any statement about the quality of the answer. "Solid", "well
 *               put", "you covered that well". A score with the number removed.
 *
 *   comparison  Anything measuring this attempt against another. "Better than
 *               last time", "you're getting there". A mastery curve drawn one
 *               point at a time.
 *
 *   escalation  Anything implying the scenario ADJUSTED to the reader. "Now
 *               that you've got that", "let me go harder". Tuning difficulty to
 *               quality is a score expressed as escalation — the model signals
 *               how they did by choosing what comes next. Difficulty will
 *               correlate with quality when the simulation is honest, and that
 *               correlation is fine; engineering it is not.
 *
 *   miss        "You missed", "nothing you said touched" — a checklist. The
 *               same information stated as what is still OPEN is not: one is a
 *               report on the reader, the other is a report on the conversation.
 *
 * PURE. No fetch, no clock, no DOM.
 */

export type GuardrailRule = 'assent' | 'verdict' | 'comparison' | 'escalation' | 'miss';

export interface Finding {
  rule: GuardrailRule;
  /** The phrase that matched, verbatim, so the reader can check the call. */
  phrase: string;
  /** Which part of the response it was in. */
  where: string;
  /** Why it is a finding, in one line. Rendered. */
  why: string;
}

const WHY: Record<GuardrailRule, string> = {
  assent:
    'A buyer who agrees should agree by moving, not by praising. Assent is a grade in character costume.',
  verdict:
    'This judges the answer. Practice here is ungraded, and a verdict is a score with the number removed.',
  comparison:
    'This measures the attempt against another one. A mastery curve drawn a point at a time is still a mastery curve.',
  escalation:
    'This implies the scenario adjusted to the reader. Difficulty tuned to quality is a score expressed as escalation.',
  miss:
    'This reports on the reader rather than on the conversation. What is still open says the same thing without the checklist.',
};

/**
 * ⚠️ ANCHORED PATTERNS, NOT KEYWORD LISTS, AND THE ANCHORING IS THE WHOLE
 * DIFFICULTY.
 *
 * "Fair" is an ordinary English word — "a fair amount of capex" is a buyer
 * talking normally. What makes it a finding is a buyer OPENING with it as a
 * response to what was just said. So assent is matched only at the start of the
 * reply; a verdict about the answer is matched anywhere, because there is no
 * position in which it belongs.
 */
/**
 * ⚠️ TWO CLASSES, AND THE FIRST VERSION HAD THEM AS ONE.
 *
 * Multi-word assent ("that's fair", "well put") is unambiguous wherever it
 * opens a turn. Single-word assent is not: bare `nice` flagged "Nice of you to
 * come out, but the budget is the budget" — a buyer being curt, which is the
 * opposite of praise — and bare `exactly` would have flagged "Exactly the
 * problem I have with this."
 *
 * So a single word counts as assent only when it IS the sentence: "Nice.",
 * "Exactly." A guardrail that fires on a normal buyer turn is one that gets
 * switched off inside a week, and then the real findings go with it.
 */
const ASSENT_OPENERS = new RegExp(
  '^\\W*(?:' +
    // Unambiguous however the sentence continues.
    "that(?:'s| is) (?:fair|a fair point|a good point|true)\\b" +
    '|fair enough\\b|good point\\b|great (?:point|question)\\b|well put\\b' +
    "|spot on\\b|i like that\\b|you(?:'re| are) right\\b" +
    // Assent only when the word stands alone as the whole reaction.
    '|(?:nice|exactly|absolutely|agreed|understood)(?=\\s*[.!…]|$)' +
    ')',
  'i',
);

const VERDICT =
  /\b(?:good|strong|solid|weak|poor|excellent|great|nice|clear|convincing|compelling)\s+(?:answer|response|framing|pitch|argument|job)\b|\byou (?:did|handled|explained|covered|nailed) (?:that|this|it)\s+(?:well|badly|nicely|poorly)\b|\bwell done\b|\bnice work\b|\bthat was (?:good|strong|solid|weak|excellent|great)\b/i;

const COMPARISON =
  /\b(?:better|worse|stronger|weaker|tighter|sharper) than (?:last|before|your (?:last|previous)|the previous)\b|\blast time\b|\byou(?:'re| are) (?:getting|improving|coming along)\b|\bimprovement (?:on|over)\b|\bmore convincing than\b/i;

const ESCALATION =
  /\bnow that you(?:'ve| have)\b|\bsince you (?:handled|got|managed|nailed)\b|\blet(?:'s| us) (?:go|make it|try something) (?:harder|tougher|more difficult)\b|\bstep(?:ping)? (?:it|things) up\b|\bready for (?:a|something) (?:harder|tougher)\b|\bi'?ll (?:make|take) (?:this|it) (?:harder|tougher)\b|\blevel(?:ling| )up\b|\bnext level\b|\bturn up the\b/i;

const MISS =
  /\byou (?:missed|didn'?t|did not|failed to|never|should have|forgot)\b|\bnothing you said\b|\byou left out\b|\bmissing from your\b|\b\d+\s*(?:of|out of)\s*\d+\b/i;

const RULES: { rule: GuardrailRule; pattern: RegExp; openerOnly: boolean }[] = [
  { rule: 'assent', pattern: ASSENT_OPENERS, openerOnly: true },
  { rule: 'verdict', pattern: VERDICT, openerOnly: false },
  { rule: 'comparison', pattern: COMPARISON, openerOnly: false },
  { rule: 'escalation', pattern: ESCALATION, openerOnly: false },
  { rule: 'miss', pattern: MISS, openerOnly: false },
];

/**
 * Inspect one piece of a practice response.
 *
 * @param text  what to read.
 * @param where which part it is, for the finding.
 * @param opener true when `text` begins the buyer's turn — assent is only a
 *               finding in that position.
 */
export function inspect(text: string, where: string, opener = false): Finding[] {
  const found: Finding[] = [];
  for (const { rule, pattern, openerOnly } of RULES) {
    if (openerOnly && !opener) continue;
    const m = pattern.exec(text);
    if (!m) continue;
    found.push({ rule, phrase: m[0].trim(), where, why: WHY[rule] });
  }
  return found;
}

/**
 * The whole response.
 *
 * ⚠️ `stillOpen` IS INSPECTED TOO, and it is the likeliest place for a miss
 * report to survive. "What is still open" and "what you missed" carry the same
 * information and only one of them is a checklist — the difference is entirely
 * in the phrasing, which is what makes it worth checking rather than trusting.
 */
export function inspectResponse(r: {
  reply: string;
  tookAway: string | null;
  stillOpen: string[];
}): Finding[] {
  return [
    ...inspect(r.reply, 'the buyer’s reply', true),
    ...(r.tookAway ? inspect(r.tookAway, 'what they took away') : []),
    ...r.stillOpen.flatMap((s, i) => inspect(s, `still open [${i + 1}]`)),
  ];
}
