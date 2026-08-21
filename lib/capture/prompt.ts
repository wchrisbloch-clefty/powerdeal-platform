import { FACT_FIELDS } from './fields';

/**
 * ═══════════════════════════════════════════════════════════════
 * READ THE SENTENCE. PROPOSE NOTHING YOU CANNOT QUOTE.
 * ═══════════════════════════════════════════════════════════════
 *
 * Built from FACT_FIELDS so the instruction and the validator cannot name
 * different fields — the same rule as the visual prompt and the block fence.
 *
 * ⚠️ THE HARD PART IS NOT RECOGNITION, IT IS RESTRAINT. A model asked to
 * extract MEDDPICC from "spoke to Trevor Reitsma today, he cc'd the plant
 * manager" will happily return a champion, a multi-threaded true, and a
 * decision process. Each is plausible, none is stated, and every one of them
 * scores. So the instruction is mostly about what NOT to propose, and the
 * phrase requirement is the mechanism: a proposal must quote the words it came
 * from, and there are no words for an inference.
 */
export function extractionInstruction(): string {
  const rows = FACT_FIELDS.map(
    (f) => `  ${f.key.padEnd(20)} ${f.recognise}`,
  ).join('\n');

  return [
    'READ WHAT THE REP JUST DICTATED AND SAY WHICH DEAL FIELDS IT STATES.',
    '',
    'You are not filling in a form. You are reading one or two sentences said',
    'from a car after a call, and saying only what is actually in them.',
    '',
    'THE FIELDS:',
    '',
    rows,
    '',
    'FOR EACH ONE YOU FIND, RETURN:',
    '',
    '  field   the key exactly as written above',
    '  value   what would be stored. For a boolean, "true" or "false".',
    '          For a date, YYYY-MM-DD and nothing else.',
    '  phrase  THE WORDS FROM THEIR SENTENCE that say it. Verbatim, copied,',
    '          not paraphrased.',
    '',
    '⚠️ IF YOU CANNOT QUOTE IT, DO NOT PROPOSE IT.',
    '',
    'The phrase is the whole safeguard. A person is going to read your',
    'proposal next to the words it came from and decide whether you read them',
    'correctly. An inference has no words to quote, so an inference is not a',
    'proposal — leave it out.',
    '',
    'THINGS THAT ARE NOT WHAT THEY LOOK LIKE:',
    '',
    '  · a name mentioned is not a champion. A champion is described as',
    '    advocating, pushing, or sponsoring.',
    '  · a senior title is not an economic buyer. The economic buyer is the',
    '    person described as able to approve the money.',
    '  · two people in a sentence is not multi-threaded. Multi-threaded means a',
    '    real second relationship, described as one.',
    '  · a deadline mentioned in passing is not a critical event. A critical',
    '    event is a forcing function that makes doing nothing expensive.',
    '  · a number is not a size. Only propose size_mw if MW are stated. Never',
    '    infer load from headcount, square footage or plant type.',
    '',
    'PROPOSING NOTHING IS A CORRECT ANSWER and a common one. Most of what gets',
    'said after a call is context, not a field. Return an empty list rather',
    'than reaching for something.',
    '',
    'Return ONLY this JSON object, with no prose around it:',
    '',
    '  {"proposals": [{"field": "...", "value": "...", "phrase": "..."}]}',
  ].join('\n');
}
