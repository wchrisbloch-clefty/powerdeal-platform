import type { LearnMode } from './modes';

/**
 * ═══════════════════════════════════════════════════════════════
 * PACING — STOP WHERE A PERSON WOULD STOP TALKING.
 * ═══════════════════════════════════════════════════════════════
 *
 * The failure this addresses is not a wrong answer. It is a correct one, two
 * thousand words long, delivered to somebody with ninety seconds between
 * meetings — which is the only time anyone opens this tab. An answer nobody
 * finishes reading taught nothing, and it is indistinguishable from a good
 * answer right up until the point it is abandoned.
 *
 * Two halves, and both are needed:
 *
 *   · the model is told to answer the question asked and not the next three;
 *   · the reader gets NAMED ways to continue, so stopping early costs them
 *     nothing.
 *
 * ⚠️ THE SECOND HALF IS WHAT MAKES THE FIRST HONEST. Shortening the answer
 * without a way forward is withholding, and this product does not withhold. A
 * follow-up is one click and continues the same session, so a short first
 * answer is a pause rather than a ceiling.
 *
 * ══ THE FOLLOW-UPS ARE DECLARED, NOT GENERATED ══
 *
 * They could have been asked of the model — "suggest three follow-ups" — and
 * they are not, for the reason every generated menu in this product is not
 * generated: a suggestion the model invents is a claim there is something
 * useful down that road, made by the thing that would then have to write it.
 * These are fixed per mode, they are the same every time, and each one is a
 * continuation the mode's own instruction already supports.
 *
 * ⚠️ AND NONE OF THEM IS A VERDICT ON THE READER. "ask me a harder one" is the
 * reader turning the dial. "you are at level 3" is the system rating them, and
 * the difference is the whole guardrail on this surface. Every string here is
 * an instruction the reader gives, never an assessment they receive.
 *
 * PURE. No fetch, no clock, no DOM.
 */

export const PACING_INSTRUCTION = [
  'ANSWER THE QUESTION ASKED. Not the next three, and not the whole subject.',
  '',
  'Stop where a person talking to a colleague would stop — at the point the',
  'question is answered and before the tangent that occurred to you. The reader',
  'has one click to ask for more and will use it. They cannot un-read four',
  'screens of correct material they did not have time for.',
  '',
  'Do NOT announce what you are leaving out, do not offer a menu, and do not',
  'end with "let me know if you would like…". The follow-ups are already on the',
  'screen. Just stop.',
].join('\n');

export interface FollowUp {
  /** Shown on the chip. Short — it sits in a row of them. */
  label: string;
  /** Sent as the next turn, verbatim. Written as the reader's own instruction. */
  ask: string;
}

const FOLLOW_UPS: Record<LearnMode, FollowUp[]> = {
  explain: [
    { label: 'Worked example', ask: 'give me a worked example with real numbers, and mark anything illustrative' },
    { label: 'Where it breaks', ask: 'where does this argument break down, and what does the customer say when it does' },
    { label: 'Say it out loud', ask: 'give me the one-sentence version I would actually say in the room' },
  ],
  drill: [
    // "harder" is the READER turning the dial. Nothing here reports back on how
    // they did — that is the line this surface does not cross.
    { label: 'Harder', ask: 'ask me a harder one on the same thing' },
    { label: 'Explain that one', ask: 'stop drilling and explain the one I just got wrong' },
    { label: 'Different angle', ask: 'same topic, but come at it from a direction I have not seen' },
  ],
  roleplay: [
    { label: 'Break character', ask: 'break character and tell me what landed and what did not' },
    { label: 'Push harder', ask: 'stay in character and push back harder than that' },
    { label: 'Their real objection', ask: 'stay in character, but raise the objection you actually care about most' },
  ],
  compare: [
    { label: 'When the other wins', ask: 'take the other side seriously — when is it genuinely the right answer' },
    { label: 'The deciding question', ask: 'what is the single question that decides which of these applies here' },
    { label: 'Say it out loud', ask: 'give me the one-sentence version I would actually say in the room' },
  ],
  recall: [
    { label: 'Keep going', ask: 'keep going from where I left off' },
    { label: 'Test me on it', ask: 'quiz me on what I worked through before, one question at a time' },
  ],
};

export function followUpsFor(mode: LearnMode): FollowUp[] {
  return FOLLOW_UPS[mode] ?? [];
}

/** Every follow-up, for assertions that must cover all of them. */
export function allFollowUps(): FollowUp[] {
  return Object.values(FOLLOW_UPS).flat();
}
