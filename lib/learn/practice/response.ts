import { inspectResponse, type Finding } from './guardrail';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT COMES BACK: A REPLY, AND TWO OBSERVATIONS.
 * ═══════════════════════════════════════════════════════════════
 *
 * The buyer's reply streams as prose — it is the bulk of the response and the
 * part that has to be readable as it arrives. The two observations come last,
 * in a fenced block, because they are structured, short, and are the two places
 * a grade is most likely to appear. Fencing them makes them separable and
 * therefore checkable.
 *
 * ⚠️ AN UNCLOSED FENCE IS NOT A MISSING BLOCK. Same distinction as the answer
 * parser: mid-stream there is nothing after the reply yet, which is `pending`,
 * not `absent`. Rendering "no observations" while they are still being written
 * would be a state the reader cannot tell from a model that declined to make
 * any.
 *
 * PURE.
 */

export const PRACTICE_FENCE = 'powerdeal-practice';

export interface PracticeResponse {
  /** In character. Everything before the fence. */
  reply: string;
  /** One sentence about what a listener heard. Null until the fence closes. */
  tookAway: string | null;
  /** What the conversation has not resolved. Not a list of misses. */
  stillOpen: string[];
  /** Still arriving — the fence has opened and not closed. */
  pending: boolean;
  /** Everything the guardrail found. Rendered, never applied. */
  findings: Finding[];
  /** Set when the fence closed over something unparseable. Rendered. */
  malformed: string | null;
}

const OPEN = new RegExp(`(^|\\n)\`\`\`${PRACTICE_FENCE}[ \\t]*\\r?\\n`);
const CLOSE = /(^|\n)```[ \t]*(\r?\n|$)/;

export function parsePractice(text: string): PracticeResponse {
  const open = OPEN.exec(text);

  if (!open) {
    const reply = text.trim();
    return {
      reply,
      tookAway: null,
      stillOpen: [],
      pending: false,
      // The reply alone is inspected: a grade in the buyer's mouth is the
      // finding this exists for, and it does not wait for the fence.
      findings: reply ? inspectResponse({ reply, tookAway: null, stillOpen: [] }) : [],
      malformed: null,
    };
  }

  const reply = text.slice(0, open.index + open[1].length).trim();
  const after = text.slice(open.index + open[0].length);
  const close = CLOSE.exec(after);

  if (!close) {
    return {
      reply,
      tookAway: null,
      stillOpen: [],
      pending: true,
      findings: inspectResponse({ reply, tookAway: null, stillOpen: [] }),
      malformed: null,
    };
  }

  const body = after.slice(0, close.index + close[1].length);
  const tail = readObservations(body);

  if (!tail) {
    return {
      reply,
      tookAway: null,
      stillOpen: [],
      pending: false,
      findings: inspectResponse({ reply, tookAway: null, stillOpen: [] }),
      malformed: 'The observations did not parse as JSON.',
    };
  }

  return {
    reply,
    tookAway: tail.tookAway,
    stillOpen: tail.stillOpen,
    pending: false,
    findings: inspectResponse({ reply, tookAway: tail.tookAway, stillOpen: tail.stillOpen }),
    malformed: null,
  };
}

export interface Observations {
  tookAway: string | null;
  stillOpen: string[];
  /** Inspected here, so no caller can render the tail without the guardrail. */
  findings: Finding[];
}

/**
 * Read the fenced tail on its own. Null when it does not parse.
 *
 * ⚠️ EXPORTED SO `lib/learn/blocks.ts` DOES NOT WRITE ITS OWN. A resumed
 * practice session replays through the answer parser, and a private copy of
 * this would be a second rendering path — one with no guardrail attached,
 * because the inspection happens in here. The drift would be silent and would
 * be in the one direction that matters.
 */
export function readObservations(body: string): Observations | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const rec = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const tookAway =
    typeof rec.tookAway === 'string' && rec.tookAway.trim() ? rec.tookAway.trim() : null;
  const stillOpen = Array.isArray(rec.stillOpen)
    ? rec.stillOpen
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0)
    : [];

  return {
    tookAway,
    stillOpen,
    findings: inspectResponse({ reply: '', tookAway, stillOpen }),
  };
}
