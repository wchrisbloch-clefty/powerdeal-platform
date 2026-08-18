import type { MeddpiccState } from '@/lib/deals';

/**
 * ═══════════════════════════════════════════════════════════════
 * A GAP IS A RENDERED OBJECT, NOT AN ABSENCE.
 * ═══════════════════════════════════════════════════════════════
 *
 * This is the one place the platform spends real design effort, and it is
 * deliberate. Twenty-one deals carry almost nothing: no MEDDPICC, no critical
 * event, no champion. Most of what this product shows anyone, most of the time,
 * is the shape of what is not yet known — so the blank is the main view, and a
 * blank card is the main view being unbuilt.
 *
 * It is also the visual form of the principle the whole build runs on. A stated
 * gap beats an invented number. Rendering the gap as a thing you can see, name
 * and act on is that sentence made visible.
 *
 * ══ FIVE STATES, AND COLLAPSING ANY TWO IS THE DEFECT ══
 *
 * Every silent failure this build has found came from two different states
 * printing the same words:
 *
 *   · a failed read rendering as "no results"
 *   · 21 seed deals rendering as 21 real deals
 *   · an unscored MEDDPICC pillar rendering as a missing one
 *   · a vertical with no playbook getting the nearest neighbour's
 *
 * So the vocabulary keeps them apart by construction, and the renderer is
 * TOTAL over it — there is no default branch that could swallow a new kind.
 *
 * ══ RELATIONSHIP TO THE STATES THAT ALREADY EXIST ══
 *
 * `SeedState` (lib/seed-state.ts) describes a COLLECTION: unreadable, empty,
 * seeded, populated. `MeddpiccState` (lib/deals.ts) describes a FIELD: known,
 * gap, unknown.
 *
 * This is the field-level vocabulary, and it is a strict superset of
 * `MeddpiccState` rather than a parallel invention — `fromMeddpicc` is the
 * mapping, and a test holds it total. The two kinds MEDDPICC has no word for
 * are the ones that keep being got wrong: `unavailable` and `blocked`.
 *
 * PURE. No JSX, no fetch, no clock.
 */

export type GapKind =
  /** The value is present. Not a gap; here so the renderer is total. */
  | 'recorded'
  /**
   * Asked, and there is nothing. A real, actionable hole — the reader can go
   * and fill it, and the copy says how.
   */
  | 'missing'
  /**
   * NOT ASKED, or the source was not supplied. Absent evidence, not evidence
   * of absence.
   *
   * ⚠️ The distinction from `missing` is load-bearing and has already been got
   * wrong once: a deal with a fully worked competitive grid scored a MEDDPICC
   * gap on Competition because the competitor set was not passed to the
   * scorer. Reporting "nobody has done this" about work that was done is worse
   * than reporting nothing.
   */
  | 'unchecked'
  /**
   * Deliberately absent, and that is the correct state. Nothing to fill in.
   *
   * ⚠️ THIS IS THE ONE THAT MUST NEVER BE SUBSTITUTED. Defense has no vertical
   * playbook. The instruction was that it be NAMED ABSENT rather than served
   * the nearest neighbour's — a plausible playbook for the wrong vertical is
   * exactly the fabricated-number failure wearing a document.
   */
  | 'unavailable'
  /**
   * The read failed. The value may well exist; nothing is known either way.
   * Never rendered as emptiness.
   */
  | 'blocked';

export const GAP_KINDS: GapKind[] = [
  'recorded',
  'missing',
  'unchecked',
  'unavailable',
  'blocked',
];

/** The three MEDDPICC states, widened. Total, and asserted total. */
export function fromMeddpicc(state: MeddpiccState): GapKind {
  switch (state) {
    case 'known':
      return 'recorded';
    case 'gap':
      return 'missing';
    case 'unknown':
      return 'unchecked';
  }
}

/**
 * How each kind is drawn.
 *
 * ══ THE RULED SLOT ══
 *
 * A gap renders as a ruled line where the value would sit — a ledger with the
 * line drawn and the entry not yet made. Not a dashed box, not an illustration,
 * not grey mush: those all say "nothing here". A ruled slot says "this belongs
 * here and is not filled in", which is a different and truer sentence.
 *
 * ⚠️ THE RULE STYLE CARRIES THE MEANING, so it is not decoration and has to
 * clear 3:1 like any other non-text indicator. `--color-rule` is 1.2:1 on
 * paper — correct for separating content, useless for carrying it — which is
 * why `--color-gap-rule` exists.
 */
export interface GapPresentation {
  /** `border-style` for the slot's rule. */
  rule: 'solid' | 'dotted' | 'none';
  /** Token name for the rule's colour. */
  tone: 'gap' | 'danger' | 'quiet';
  /** What sits in the slot where a value would be. Never blank. */
  mark: string;
}

export const PRESENTATION: Record<GapKind, GapPresentation> = {
  // A recorded value draws no slot — the value itself is the content.
  recorded: { rule: 'none', tone: 'quiet', mark: '' },
  // Ruled and waiting. The line is drawn because an entry belongs on it.
  missing: { rule: 'solid', tone: 'gap', mark: 'not recorded' },
  // Nobody has drawn the line yet, because nobody has asked.
  unchecked: { rule: 'dotted', tone: 'quiet', mark: 'not checked' },
  // Deliberately nothing. An em dash, which is what a ledger writes when a
  // column does not apply — distinct from a blank, which reads as an omission.
  unavailable: { rule: 'solid', tone: 'quiet', mark: '—' },
  // A fault, and it looks like one.
  blocked: { rule: 'solid', tone: 'danger', mark: 'could not read' },
};

export interface GapCopy {
  /** What is missing, in the reader's words. */
  title: string;
  /**
   * One sentence. For `missing`, it names the ACTION that fills the gap;
   * for the others it says precisely what is and is not known.
   */
  body: string;
}

/**
 * The sentence a gap says about itself.
 *
 * `subject` is the thing that is absent — "a champion", "the critical event".
 * `action` is what would fill it, supplied by the caller because only the
 * caller knows; when it is missing the copy says so rather than inventing one.
 *
 * ⚠️ NO NUMBERS ANYWHERE IN HERE, and none may be added. A gap is precisely
 * the place where a plausible figure would be most damaging and least
 * checkable — "typically 3–5 contacts at this stage" is the fabricated-number
 * failure in its most natural habitat.
 */
export function describeGap(
  kind: GapKind,
  subject: string,
  action?: string,
  reason?: string,
): GapCopy {
  switch (kind) {
    case 'recorded':
      return { title: subject, body: '' };
    case 'missing':
      return {
        title: `No ${subject}`,
        body: action
          ? action
          : `Nothing is recorded here yet. What fills it has not been written down, so this gap is real but the next step is not stated.`,
      };
    case 'unchecked':
      return {
        title: `${subject} not checked`,
        // The distinction, said out loud, every time.
        body: `This has not been looked at — which is not the same as being empty. Nothing is known either way.`,
      };
    case 'unavailable':
      return {
        title: `No ${subject}, and that is correct`,
        body: `There is deliberately nothing here. Nothing stands in for it.`,
      };
    case 'blocked':
      return {
        title: `Could not read ${subject}`,
        body: reason
          ? `The read failed, so nothing is known either way — not that there is none. ${reason}`
          : `The read failed, so nothing is known either way — not that there is none.`,
      };
  }
}

/** True when the surface should draw a slot rather than a value. */
export function isGap(kind: GapKind): boolean {
  return kind !== 'recorded';
}

/**
 * Gaps worth putting in front of someone, worst first.
 *
 * ⚠️ ORDERED BY WHAT CAN BE DONE ABOUT IT, not by severity of the word.
 * `blocked` leads because it is a fault in the platform and everything under it
 * is unreliable; `missing` follows because it is the reader's actual work;
 * `unchecked` last, because "go and look" is a smaller ask than "go and find
 * out". `unavailable` is not a gap to act on at all and is excluded.
 */
const WORK_ORDER: GapKind[] = ['blocked', 'missing', 'unchecked'];

export function rankGaps<T extends { kind: GapKind }>(gaps: T[]): T[] {
  return gaps
    .filter((g) => WORK_ORDER.includes(g.kind))
    .sort((a, b) => WORK_ORDER.indexOf(a.kind) - WORK_ORDER.indexOf(b.kind));
}
