/**
 * ═══════════════════════════════════════════════════════════════
 * LEARN — five modes behind ONE box.
 * ═══════════════════════════════════════════════════════════════
 *
 * There is no mode picker. A rep with a question does not want to first
 * classify their own question; making them choose a tab before they can ask is
 * the friction that stops the tab being opened at all. The box reads the
 * question and picks.
 *
 * ══ WHAT THIS DELIBERATELY IS NOT ══
 *
 * No confidence scores. No knowledge graph. No mastery ratings. No proficiency
 * metrics. Not now and not later as a nice-to-have.
 *
 * That is a product decision, and it has a structural consequence this file
 * has to honour: **detection reports WHICH SIGNALS MATCHED, never how sure it
 * is.** A percentage is a scoring system with a different label, and the first
 * thing anyone does with one is rank sessions by it. `matched` is a list of
 * the actual words that triggered the read — a reason, which the reader can
 * check, rather than a number, which they can only trust.
 *
 * ══ AMBIGUITY IS SHOWN, NOT RESOLVED SILENTLY ══
 *
 * When two modes read equally well the detector still picks one — the box must
 * always answer — but it reports the alternatives alongside. The UI offers
 * them as a one-click switch. Nothing gates: an ambiguous question is answered
 * in the mode that led, immediately, and the reader can redirect after seeing
 * the answer rather than before writing the question.
 *
 * ══ STRUCTURALLY DEAL-FREE ══
 *
 * Nothing in `lib/learn/` imports a Deal, a pipeline type, or anything from
 * `lib/data`. Learning the doctrine is not an operation on an account, and a
 * learn surface that needed a deal selected first would be unusable in the
 * ninety seconds between meetings that is the only time anyone will open it.
 * tests/learn.test.ts asserts the absence of those imports directly, because
 * "we didn't mean to" is not a constraint.
 *
 * PURE. No fetch, no database, no clock.
 */

export type LearnMode = 'explain' | 'drill' | 'roleplay' | 'compare' | 'recall';

export interface ModeSpec {
  mode: LearnMode;
  label: string;
  /** What this mode is for, in the reader's terms. Shown in the UI. */
  blurb: string;
  /** An example that reads like something someone would actually type. */
  example: string;
}

export const MODES: ModeSpec[] = [
  {
    mode: 'explain',
    label: 'Explain',
    blurb: 'Teach me the thing, with the part that actually matters in a deal.',
    example: 'what is 4CP and why does it move a data centre deal',
  },
  {
    mode: 'drill',
    label: 'Drill',
    blurb: 'Ask me questions until I can say it without thinking.',
    example: 'quiz me on the four competitive tiers',
  },
  {
    mode: 'roleplay',
    label: 'Roleplay',
    blurb: 'Be the buyer. Push back the way they will.',
    example: 'be a sceptical refinery CFO and push back on capex',
  },
  {
    mode: 'compare',
    label: 'Compare',
    blurb: 'Two things side by side, with where each actually wins.',
    example: 'SOFC versus a recip engine for a 30MW industrial site',
  },
  {
    mode: 'recall',
    label: 'Recall',
    blurb: 'What did I work through before? Pick it back up.',
    example: 'what did I go through on ERCOT last week',
  },
];

/**
 * Signals per mode.
 *
 * Plain words, matched on word boundaries. Deliberately not a model call: mode
 * detection that costs a round trip is mode detection that adds a second of
 * latency to every question, and a nondeterministic classifier in front of the
 * box would make the same question open a different mode on different days —
 * the exact class of nondeterminism this build has spent itself removing.
 */
const SIGNALS: Record<LearnMode, string[]> = {
  drill: [
    'quiz', 'quiz me', 'test me', 'drill', 'flash', 'flashcards', 'practice',
    'ask me', 'until i', 'rehearse', 'memorise', 'memorize', 'run me through',
  ],
  roleplay: [
    'roleplay', 'role play', 'pretend', 'act as', 'be a', 'be the', 'play the',
    'objection', 'push back', 'pushback', 'rehearse the call', 'simulate',
    'sceptical', 'skeptical', 'hostile',
  ],
  compare: [
    'versus', ' vs ', 'vs.', 'compare', 'comparison', 'difference between',
    'better than', 'instead of', 'against a', 'side by side', 'trade-off',
    'tradeoff', 'or a',
  ],
  recall: [
    'recall', 'what did i', 'last time', 'last week', 'previously', 'earlier',
    'remind me what', 'pick up', 'resume', 'my last', 'went through',
    'we covered', 'i covered',
  ],
  explain: [
    'what is', 'what are', 'explain', 'how does', 'how do', 'why does',
    'why is', 'teach me', 'walk me through', 'tell me about', 'meaning of',
    'define',
  ],
};

/**
 * The tiebreak order when several modes match the same number of signals.
 *
 * NOT alphabetical and not arbitrary. The more specific an ask is, the more
 * likely its signal was deliberate: nobody types "quiz me" by accident, while
 * "what is" appears inside plenty of roleplay and comparison questions. So the
 * specific modes win ties and `explain` is last — it is also the safe default,
 * because being taught something you wanted compared is a smaller failure than
 * being quizzed on something you wanted explained.
 */
const TIEBREAK: LearnMode[] = ['drill', 'roleplay', 'recall', 'compare', 'explain'];

export interface Detection {
  mode: LearnMode;
  /**
   * The literal signals that matched. A REASON, not a score — the reader can
   * check a word against their own sentence; they can only trust a percentage.
   */
  matched: string[];
  /**
   * Other modes that also matched, best first. Offered as a one-click switch,
   * never used to block or to ask a question before answering.
   */
  alternatives: LearnMode[];
  /**
   * True when nothing matched at all and `explain` was chosen as the default.
   * Named so the UI can say "reading this as Explain" rather than implying the
   * box recognised something it did not.
   */
  defaulted: boolean;
}

function matchesIn(text: string, signals: string[]): string[] {
  return signals.filter((s) => {
    // ⚠️ EVERY LETTERS-AND-SPACES SIGNAL IS WORD-BOUNDED, MULTI-WORD INCLUDED.
    //
    // Substring matching multi-word signals was a real bug: `be a` fired
    // inside "descri[be a] refinery load profile", so an explain question read
    // as roleplay. A phrase boundary is not less necessary than a word
    // boundary — it is more, because the phrase is longer and hides inside
    // more words.
    //
    // Signals containing punctuation (` vs `, `vs.`) keep substring matching;
    // they are already delimited by the characters they carry.
    if (/[^a-z ]/.test(s)) return text.includes(s);
    return new RegExp(`\\b${s.replace(/ /g, '\\s+')}\\b`).test(text);
  });
}

export function detectMode(input: string): Detection {
  const text = ` ${input.toLowerCase().trim()} `;

  const hits = TIEBREAK.map((mode) => ({ mode, matched: matchesIn(text, SIGNALS[mode]) })).filter(
    (h) => h.matched.length > 0,
  );

  if (hits.length === 0) {
    return { mode: 'explain', matched: [], alternatives: [], defaulted: true };
  }

  // Sort by match count, then by the tiebreak order — which is the order
  // `hits` is already in, so a stable sort preserves it.
  const ranked = [...hits].sort((a, b) => b.matched.length - a.matched.length);
  const [best, ...rest] = ranked;

  return {
    mode: best.mode,
    matched: best.matched,
    alternatives: rest.map((h) => h.mode),
    defaulted: false,
  };
}

/** How the box explains its own read, in one line. Rendered under the input. */
export function explainDetection(d: Detection): string {
  const label = MODES.find((m) => m.mode === d.mode)!.label;
  if (d.defaulted) {
    return `Reading this as ${label} — nothing in it pointed to another mode.`;
  }
  return `Reading this as ${label} — matched "${d.matched.slice(0, 3).join('", "')}".`;
}

/**
 * The instruction for each mode.
 *
 * Written as the system-side framing that sits under the PowerDeal identity,
 * not as the whole prompt. Every one of them ends by naming what the model
 * must NOT do, because the failure mode of a learning surface is a confident
 * answer that invents the number the reader was trying to learn.
 */
const NEVER_FABRICATE =
  'Never state a rate, price, capacity, heat rate, permitting timeline or REC value that is not in the reference material. If a number would help and you do not have it, say which number is missing and where it would come from. An invented figure is worse than a gap, and this surface exists to make someone more accurate, not more fluent.';

export function instructionFor(mode: LearnMode): string {
  switch (mode) {
    case 'explain':
      return [
        'Teach this concept to a BD rep who will use it in a live conversation today.',
        'Lead with what it IS in one sentence, then why it moves a deal. Concrete over complete — the part they will actually say out loud.',
        'End with the one question they should ask a customer to find out where they stand on it.',
        NEVER_FABRICATE,
      ].join('\n\n');
    case 'drill':
      return [
        'Ask ONE question at a time and wait. Do not ask a second before the answer comes back, and do not answer your own question.',
        'After each answer: say what was right, then what was missing, then ask the next one. Harder each time.',
        'NO SCORING. No running tally, no percentage, no "3 of 5 correct", no level. Say what was missing and move on — a score turns practice into a test, and people stop practising the thing they are worst at.',
        NEVER_FABRICATE,
      ].join('\n\n');
    case 'roleplay':
      return [
        'You are the buyer. Stay in character until told to stop.',
        'Push back the way the real persona would — with their actual priorities, their budget cycle, their internal politics. Be difficult where they would be difficult and receptive where they would be receptive.',
        'When the rep asks you to break character, break it and say what landed and what did not.',
        'Do not go easy. A roleplay that concedes early teaches nothing.',
        NEVER_FABRICATE,
      ].join('\n\n');
    case 'compare':
      return [
        'Put the two side by side. Where each one genuinely wins, in the customer\'s terms.',
        'Name the case where the OTHER one is the right answer. A comparison with no such case is a pitch, and a rep who has only heard the pitch loses the first conversation with someone who has done the maths.',
        'End with the question that decides which applies here.',
        NEVER_FABRICATE,
      ].join('\n\n');
    case 'recall':
      return [
        'The reader is picking up something they worked through before. Their previous sessions are below.',
        'Summarise where they got to, then continue from there — do not restart the topic from the beginning.',
        'If nothing in the history matches what they asked, SAY SO plainly and offer to start it fresh. Never reconstruct a session that did not happen.',
        NEVER_FABRICATE,
      ].join('\n\n');
  }
}
