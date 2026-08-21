/**
 * ═══════════════════════════════════════════════════════════════
 * FOUR ROOMS. EACH ONE A PERSON WHO HAS JUST SAID SOMETHING.
 * ═══════════════════════════════════════════════════════════════
 *
 * Practice is rehearsal, not quizzing. You say the thing the way you would say
 * it in the room, and what comes back is what the buyer says next.
 *
 * ⚠️ THE SCENARIO IS NOT A DIFFICULTY SETTING. There is no easy one and no hard
 * one, and they are not ordered. Each is a different person with different
 * priorities, and which is hardest depends entirely on which argument the
 * reader is worst at — which is the thing this surface exists to let them work
 * on without being told.
 *
 * ══ GROUNDED, LIKE THE PATHS ══
 *
 * Every scenario names the knowledge file its buyer reasons from, and the file
 * must resolve before the scenario is offered. A buyer improvised out of
 * general knowledge argues plausibly and teaches the wrong reflexes, and the
 * reader cannot tell the difference from inside the conversation.
 *
 * PURE. No fs, no fetch, no clock.
 */

export interface Scenario {
  id: string;
  /** Who is across the table. One line, shown above the box. */
  who: string;
  /** What is true about them before anyone speaks. Shown. */
  setting: string;
  /** What they have just said. This is what the reader answers. */
  opener: string;
  /** The registered knowledge file the buyer reasons from. Must resolve. */
  source: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'frozen-capex',
    who: 'A refinery CFO',
    setting:
      'Capital budget was frozen in Q2 and has not reopened. They have sat through two energy pitches this quarter and approved neither.',
    opener:
      'I understand the technology. What I do not have is capital, and I am not going to have any before next year. So what are we actually doing here?',
    source: 'objection-battlecards.md',
  },
  {
    id: 'unproven',
    who: 'A reliability engineer',
    setting:
      'Twenty years of service history with Wärtsilä recips on this site. They are the person the plant manager will ask, and they know it.',
    opener:
      'We have run these engines through three turnarounds. I know exactly who to call at two in the morning. Tell me why I would put a fuel cell fleet in their place.',
    source: 'competitive-matrix.md',
  },
  {
    id: 'esg-gas',
    who: 'A sustainability director',
    setting:
      'They have a public Scope 1 reduction commitment with a date on it, and they are measured against it personally.',
    opener:
      'It burns natural gas. I have a number I have to hit and a board that reads the sustainability report. Help me understand how this is not just a cleaner way to keep burning gas.',
    source: 'objection-battlecards.md',
  },
  {
    id: 'existing-cogen',
    who: 'An operations director',
    setting:
      'Aging cogen unit, still running, carrying a real process steam load. Replacing it is on the ten-year plan, not this one.',
    opener:
      'We already make our own power. The cogen is old but it works, and it gives us steam I would otherwise have to buy. What problem are you solving?',
    source: 'permitting-playbook.md',
  },
];

/** Every knowledge file the scenarios depend on. Resolved in one pass. */
export function scenarioSources(): string[] {
  return [...new Set(SCENARIOS.map((s) => s.source))];
}

export function scenarioById(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
