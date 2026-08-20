import type { LearnMode } from './modes';

/**
 * ═══════════════════════════════════════════════════════════════
 * PATHS — AN ORDER, NOT A LADDER.
 * ═══════════════════════════════════════════════════════════════
 *
 * A path is a short sequence of questions on one subject, arranged so each is
 * easier to answer having asked the one before. Clicking a step puts it in the
 * box. That is the whole interaction.
 *
 * ══ WHAT A PATH DELIBERATELY DOES NOT HAVE ══
 *
 * No completion state. No ticks, no "3 of 6", no percentage, no badge, no
 * "resume where you left off in this path", no dimming of steps already asked.
 *
 * ⚠️ EVERY ONE OF THOSE IS A MASTERY RATING WEARING A DIFFERENT HAT, and the
 * standing rule on this surface is that there are none — not now and not later
 * as a nice-to-have. A tick beside step two is a claim that step two is DONE,
 * which is a claim about the reader that nothing here is entitled to make: they
 * asked a question and read an answer. Whether they can now hold that argument
 * against a sceptical CFO is not something a click knows.
 *
 * The practical consequence is that this file holds no state and neither does
 * the component that renders it. Steps are numbered because they have an order,
 * and any step is available at any time, including the last one first.
 *
 * ══ THE STEPS ARE GROUNDED, NOT INVENTED ══
 *
 * Each path names the knowledge file its questions come out of, and every step
 * points at something actually in that file — a battlecard that exists, a
 * competitor in the matrix, a permitting zone the playbook covers.
 *
 * ⚠️ AND THE SOURCE IS RESOLVED AT RENDER TIME. A path whose knowledge file is
 * missing, retired, or unregistered renders as a stated gap naming the file,
 * NOT as six questions with nothing behind them. A curriculum for doctrine the
 * platform does not have is the fabricated-default problem in a new medium: it
 * looks identical to a grounded one, and the reader finds out when the answer
 * comes back thin.
 *
 * PURE. No fs, no fetch, no clock — `components/learn/paths.tsx` does the
 * resolving, because `lib/learn/` cannot read the disk.
 */

export interface PathStep {
  /** Phrased as the reader would type it. This goes into the box verbatim. */
  ask: string;
  /** Why it sits here rather than earlier or later. One line, shown. */
  because: string;
  /** How the box will read it. Shown so the sequence is legible, not enforced. */
  mode: LearnMode;
}

export interface LearnPath {
  id: string;
  title: string;
  /** What you can do at the end that you could not at the start. */
  outcome: string;
  /** The registered knowledge file these questions come out of. */
  source: string;
  steps: PathStep[];
}

/**
 * Four paths.
 *
 * ⚠️ FOUR, FOR THE SAME REASON THE VISUAL SCHEMA HAS FOUR SHAPES. A short list
 * where every entry is grounded beats a long one where three are plausible
 * headings with nothing under them, and what is missing is better learned from
 * a reader asking for it than guessed at here.
 */
export const LEARN_PATHS: LearnPath[] = [
  {
    id: 'objections',
    title: 'Hold the seven objections',
    outcome: 'Answer the pushback that actually arrives, without reaching for a claim you cannot support.',
    source: 'objection-battlecards.md',
    steps: [
      {
        ask: 'what is the strongest version of "SOFC is unproven at scale" — steelman it first',
        because: 'The battlecard answer only lands if you can state the objection better than they can.',
        mode: 'explain',
      },
      {
        ask: 'quiz me on the seven objection battlecards — one at a time, no answers first',
        because: 'Recognition is not recall. This is the gap between having read the cards and having them.',
        mode: 'drill',
      },
      {
        ask: 'be a refinery CFO with a frozen capital budget and push back hard on capex',
        because: 'The capex objection is the one that ends conversations, and it is rarely about the number.',
        mode: 'roleplay',
      },
      {
        ask: 'be a sustainability director who says gas-fired anything breaks our ESG story',
        because: 'A different room, a different objection, and the wrong answer is the same technical one.',
        mode: 'roleplay',
      },
      {
        ask: 'compare the stack degradation answer with the ITC political risk answer — what do they have in common',
        because: 'Both are risk-transfer arguments. Seeing that once makes the next unfamiliar objection easier.',
        mode: 'compare',
      },
    ],
  },
  {
    id: 'competitive',
    title: 'Know where each competitor actually wins',
    outcome: 'Position against the alternative in the room instead of against the one you prepared for.',
    source: 'competitive-matrix.md',
    steps: [
      {
        ask: 'what does Wärtsilä genuinely do better than us, in their own terms',
        because: 'Starting with where they win is what stops the rest sounding like a brochure.',
        mode: 'explain',
      },
      {
        ask: 'SOFC versus an aero turbine for a site with a real steam load',
        because: 'CHP is the case where the permitting argument alone does not close it.',
        mode: 'compare',
      },
      {
        ask: 'quiz me on which competitor each kill shot belongs to',
        because: 'The kill shots are only useful attached to the right technology.',
        mode: 'drill',
      },
      {
        ask: 'compare battery plus solar against baseload SOFC on capacity factor and $/MWh',
        because: 'The one competitor whose economics look better until you ask what fraction of the year it runs.',
        mode: 'compare',
      },
      {
        ask: 'be a reliability engineer with twenty years of Wärtsilä service history and no appetite to switch',
        because: 'The incumbent-relationship objection is not a technical argument and does not answer to one.',
        mode: 'roleplay',
      },
    ],
  },
  {
    id: 'permitting',
    title: 'Use permitting as the wedge',
    outcome: 'Turn a regulatory fact into the first question you plant in a discovery call.',
    source: 'permitting-playbook.md',
    steps: [
      {
        ask: 'explain NSR and BACT as if I have to describe them to a plant manager, not a lawyer',
        because: 'The whole wedge rests on two acronyms, and a vague version of them is not a wedge.',
        mode: 'explain',
      },
      {
        ask: 'why does HGB non-attainment change the buying decision for a 30MW industrial site',
        because: 'Non-attainment is where the argument goes from "cleaner" to "they cannot build it".',
        mode: 'explain',
      },
      {
        ask: 'compare the permitting position in HGB with Baton Rouge',
        because: 'Two non-attainment zones, different classifications — the script is not portable unchanged.',
        mode: 'compare',
      },
      {
        ask: 'quiz me on the permitting challenger script',
        because: 'It is a question to ask them, not a statement to make, and that only works said cleanly.',
        mode: 'drill',
      },
    ],
  },
  {
    id: 'structures',
    title: 'Get the commercial structure right',
    outcome: 'Match the structure to what the customer’s balance sheet can actually absorb.',
    source: 'reference-bundle.md',
    steps: [
      {
        ask: 'explain the structure selection guide — what decides between a PPA and an outright sale',
        because: 'Structure is chosen before price, and getting the order backwards loses the deal quietly.',
        mode: 'explain',
      },
      {
        ask: 'what are the key term positions in a PPA and which ones are we actually willing to move on',
        because: 'A term you concede without knowing it was a lever is a term you gave away.',
        mode: 'explain',
      },
      {
        ask: 'compare tax equity against a straight capital sale from the customer’s point of view',
        because: 'ITC value only matters if the counterparty can use it, which is a question about them.',
        mode: 'compare',
      },
      {
        ask: 'explain Gulf Coast basis risk and who ends up carrying it in each structure',
        because: 'The fuel-price objection is really a question about which side of the contract holds basis.',
        mode: 'explain',
      },
      {
        ask: 'be a CFO who wants a fixed all-in ¢/kWh and refuses to discuss fuel pass-through',
        because: 'The structure conversation and the objection conversation are the same conversation.',
        mode: 'roleplay',
      },
    ],
  },
];

/** Every knowledge file the paths depend on. Used to resolve them in one pass. */
export function pathSources(): string[] {
  return [...new Set(LEARN_PATHS.map((p) => p.source))];
}
