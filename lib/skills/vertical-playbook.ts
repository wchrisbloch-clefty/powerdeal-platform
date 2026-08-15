import { VERTICALS } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH VERTICAL PLAYBOOK, AND WHEN THE ANSWER IS "NONE".
 * ═══════════════════════════════════════════════════════════════
 *
 * v3.1.12 split `vertical-playbooks.md` into three. A skill that needs vertical
 * context DECLARES ALL THREE — the declaration stays static and auditable — and
 * selects the matching one here, deterministically, at load.
 *
 * NEVER A WILDCARD. No `vertical-*` glob, no filename pattern-match at runtime.
 * §6 names files literally and the registry pins them exactly; a wildcard would
 * put the one place this build has deliberately kept literal back into the
 * business of guessing, and would silently pick up the next file whose name
 * happened to start with the same prefix.
 *
 * ══ "NONE" IS A REAL ANSWER AND IS SAID OUT LOUD ══
 *
 * §2 names four verticals and three playbooks exist. **Defense has none.** So do
 * upstream and midstream O&G — the refining playbook is DOWNSTREAM, and its
 * cogen steam balance, crack-spread economics and HGB non-attainment framing
 * describe a refinery, not a wellhead or a compressor station.
 *
 * Handing a defense account the data-center playbook because it is the nearest
 * neighbour is worse than handing it nothing: hyperscaler clean-energy clauses
 * read as authoritative doctrine to a model that cannot tell they were written
 * for someone else. The doctrine is explicit — say so rather than substituting.
 *
 * ══ EXHAUSTIVE OVER VERTICALS, BY CONSTRUCTION ══
 *
 * `PLAYBOOK_FOR` has an entry for every member of `VERTICALS` and the suite
 * asserts it. A new vertical added to `lib/types.ts` fails the build here
 * rather than falling through a default into whichever playbook the code
 * happened to reach for. Same forcing function as the §6 resolution assertions.
 *
 * PURE. No fs, no registry lookup, no clock.
 */

export const REFINING = 'vertical-playbook-refining.md';
export const DATA_CENTERS = 'vertical-playbook-data-centers.md';
export const INDUSTRIAL = 'vertical-playbook-industrial.md';

/** The three, as §6 names them. Literal, in doctrine order. */
export const VERTICAL_PLAYBOOKS = [REFINING, DATA_CENTERS, INDUSTRIAL] as const;

export type VerticalPlaybook = (typeof VERTICAL_PLAYBOOKS)[number];

export function isVerticalPlaybook(filename: string): filename is VerticalPlaybook {
  return (VERTICAL_PLAYBOOKS as readonly string[]).includes(filename);
}

type Vertical = (typeof VERTICALS)[number];

/**
 * Every vertical, mapped explicitly. `null` means NO PLAYBOOK EXISTS, which is
 * a different statement from "not yet mapped" — each null below is a decision
 * with a reason in `ABSENCE_REASON`.
 */
const PLAYBOOK_FOR: Record<Vertical, VerticalPlaybook | null> = {
  Defense: null,
  'Defense/Special': null,
  'O&G-Down': REFINING,
  'O&G-Mid': null,
  'O&G-Up': null,
  'Industrial-Chemical': INDUSTRIAL,
  'Industrial-Semicon': INDUSTRIAL,
  'Industrial-Other': INDUSTRIAL,
  'Data Center': DATA_CENTERS,
  'Other-Winery': null,
  'Other-REIT': null,
  Other: null,
};

/**
 * Why a vertical has no playbook. Written for the model that will read it in
 * the prompt, not for a developer — it has to be legible as an instruction.
 */
const ABSENCE_REASON: Record<Vertical, string | null> = {
  Defense:
    'Defense is one of the four target verticals in §2 and has no playbook yet. No vertical context is loaded. Do not substitute another vertical — reason from the methodology in the system prompt and say once, in the output, that defense-specific doctrine was not available.',
  'Defense/Special':
    'Defense is one of the four target verticals in §2 and has no playbook yet. No vertical context is loaded. Do not substitute another vertical — reason from the methodology in the system prompt and say once, in the output, that defense-specific doctrine was not available.',
  'O&G-Down': null,
  'O&G-Mid':
    'The refining playbook is DOWNSTREAM — cogen steam balance, crack-spread economics, HGB non-attainment. Midstream is a different load, a different buyer and a different permitting picture, so no playbook is loaded rather than the nearest neighbour.',
  'O&G-Up':
    'The refining playbook is DOWNSTREAM. Upstream is a different load, a different buyer and a different permitting picture, so no playbook is loaded rather than the nearest neighbour.',
  'Industrial-Chemical': null,
  'Industrial-Semicon': null,
  'Industrial-Other': null,
  'Data Center': null,
  'Other-Winery':
    'No playbook covers this vertical. Reason from the methodology in the system prompt rather than borrowing another vertical’s doctrine.',
  'Other-REIT':
    'No playbook covers this vertical. Reason from the methodology in the system prompt rather than borrowing another vertical’s doctrine.',
  Other:
    'No playbook covers this vertical. Reason from the methodology in the system prompt rather than borrowing another vertical’s doctrine.',
};

export type PlaybookSelection =
  /** One playbook, chosen deterministically. */
  | { kind: 'selected'; file: VerticalPlaybook; vertical: Vertical }
  /** The vertical is known and genuinely has no playbook. */
  | { kind: 'none-exists'; vertical: Vertical; reason: string }
  /** No vertical was supplied, or it is not a vertical this platform knows. */
  | { kind: 'unknown-vertical'; vertical: string | null; reason: string };

function isKnownVertical(v: string): v is Vertical {
  return (VERTICALS as readonly string[]).includes(v);
}

/**
 * Select the playbook for a deal's vertical.
 *
 * An UNKNOWN vertical is reported as unknown, not defaulted. A deal whose
 * vertical field holds a typo or a value from an older schema must not silently
 * receive the industrial playbook because that is what the fallback happened to
 * be — that is precisely the substitution the doctrine forbids, arriving by
 * accident instead of by choice.
 */
export function selectPlaybook(vertical: string | null | undefined): PlaybookSelection {
  const value = vertical?.trim();

  if (!value) {
    return {
      kind: 'unknown-vertical',
      vertical: null,
      reason:
        'No vertical on this deal, so no vertical playbook is loaded. Set the vertical on the account to load its doctrine; do not assume one.',
    };
  }

  if (!isKnownVertical(value)) {
    return {
      kind: 'unknown-vertical',
      vertical: value,
      reason: `"${value}" is not a vertical this platform recognises, so no playbook is loaded. Nothing is substituted for it.`,
    };
  }

  const file = PLAYBOOK_FOR[value];
  if (!file) {
    return { kind: 'none-exists', vertical: value, reason: ABSENCE_REASON[value]! };
  }

  return { kind: 'selected', file, vertical: value };
}

/**
 * Narrow a declared knowledge list to the one playbook that applies.
 *
 * The skill declares all three; this drops the two that do not. Every
 * non-playbook file passes through untouched — this function knows about
 * verticals, not about the shelf.
 */
export function narrowToVertical(
  declared: string[],
  selection: PlaybookSelection,
): string[] {
  const keep = selection.kind === 'selected' ? selection.file : null;
  return declared.filter((f) => !isVerticalPlaybook(f) || f === keep);
}

/**
 * The line that goes in the prompt when no playbook was loaded.
 *
 * Returns null when one WAS loaded — there is nothing to explain, and a
 * reassuring sentence on the happy path is noise that trains the reader to skip
 * the sentence that matters.
 */
export function absenceNote(selection: PlaybookSelection): string | null {
  if (selection.kind === 'selected') return null;
  return `NO VERTICAL PLAYBOOK LOADED. ${selection.reason}`;
}

/**
 * Split a declaration into what loads and what could not be resolved.
 *
 * ⚠️ `unresolved` IS COMPUTED ON THE FULL DECLARATION, BEFORE NARROWING, and
 * that ordering is the whole reason this function exists as a separate pure
 * unit rather than three lines inside `knowledgeForSkill`.
 *
 * A skill whose frontmatter misspells `vertical-playbook-refning.md` must be
 * reported as broken on every deal. Compute `unresolved` after narrowing and
 * the typo vanishes for every deal whose vertical is not refining — the
 * declaration is broken for everyone and reports clean for almost everyone,
 * surfacing only on whichever deal happens to run first. That is the
 * silent-direction failure this build keeps finding, and the version inside
 * `knowledgeForSkill` was untestable because no real skill file carries a typo.
 *
 * `isLoadable` is injected for the same reason: the property is about ORDER,
 * and proving it needs a declaration this repo does not contain.
 */
export interface ResolvedDeclaration {
  files: string[];
  unresolved: string[];
}

export function resolveDeclaration(
  declared: string[],
  selection: PlaybookSelection,
  isLoadable: (filename: string) => boolean,
): ResolvedDeclaration {
  const unresolved = declared.filter((f) => !isLoadable(f));
  const files = narrowToVertical(declared, selection).filter(isLoadable);
  return { files, unresolved };
}
