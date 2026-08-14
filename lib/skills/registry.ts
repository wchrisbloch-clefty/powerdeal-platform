/**
 * ═══════════════════════════════════════════════════════════════
 * THE SKILL REGISTRY — where §6's prose names become real files.
 * ═══════════════════════════════════════════════════════════════
 *
 * THE GAP THIS CLOSES. §6 of the system prompt names fifteen skills and seven
 * knowledge files by name, and until now not one of them existed in the repo.
 * Every domain call has been telling the model it can reach capabilities that
 * are nowhere on disk — the same shape as the brain sitting at v3.1.8 while
 * doctrine was at 3.1.10, one layer further down.
 *
 * WHERE SKILLS LIVE. `skills/` at the repo root, beside `prompts/`, one file
 * per skill named `SKILL-<slug>.md`. Same rule as the brain (GLOBAL RULE 6):
 * the content is NEVER generated or inferred in code, it is read verbatim from
 * a committed markdown file synced by hand from the Claude.ai project. A skill
 * is doctrine, and doctrine paraphrased in TypeScript is doctrine that drifts.
 *
 * THIS FILE IS PURE. No `fs`, no `process.cwd()`. The registry is the map from
 * name to slug and the declared status of each slug; reading bytes is
 * `lib/skills/load.ts`, which is server-only. Splitting them is what lets the
 * test suite hold the registry against both §6 and the directory listing
 * without either one importing the other.
 *
 * WHY A STATUS FIELD RATHER THAN A DIRECTORY SCAN. A scan answers "what is
 * here", which is never the question. The question is "does everything doctrine
 * promises exist", and only a declared expectation can answer that. The status
 * is pinned in BOTH directions — a `present` skill whose file disappears fails,
 * and an `awaited` skill whose file appears ALSO fails, until someone promotes
 * it here deliberately. A check that can only fail one way is the defect class
 * this build keeps rediscovering (migration checklist rules 4, 7 and 8).
 */

/** Canonical slug — the filename stem and the frontmatter `name:`. */
export type SkillSlug =
  | 'four-lever-calculator'
  | 'discovery-call-prep'
  | 'war-room'
  | 'deal-qualification'
  | 'account-deep-dive'
  | 'prospect-originator'
  | 'pro-forma'
  | 'permitting-analyzer'
  | 'exec-briefing'
  | 'power-pulse'
  | 'stage-gate'
  | 'contract-negotiator'
  | 'electrical-assessor'
  | 'market-segmentation'
  | 'account-strategy'
  | 'business-case-engine'
  | 'meeting-prep';

export interface SkillEntry {
  slug: SkillSlug;
  /**
   * `present` — the file is committed and must be readable.
   * `awaited`  — the file has not landed yet and must NOT be readable.
   *
   * Both are assertions. Moving a skill between them is a deliberate act with
   * a diff, which is the point.
   */
  status: 'present' | 'awaited';
  /** One line, for the status surface and for a human reading this list. */
  purpose: string;
  /**
   * Set when the source project holds more than one version of this skill and
   * the choice has not been made. The diff gets flagged before anything is
   * committed — two versions silently merged is a doctrine change nobody
   * reviewed.
   *
   * Carried by nothing today: the two candidates, `stage-gate` and
   * `contract-negotiator`, turned out to be byte-identical uploads of the same
   * file. The field stays because the next duplicate is a question of when.
   */
  versionsPending?: number;
}

/**
 * All seventeen skills. Every one is on disk, and §6 names every one BY SLUG.
 *
 * There is no `section6Name` field any more. It existed to record six cases
 * where §6's prose name and the file's slug disagreed — v3.1.11 resolved that
 * by rewriting §6 to the slugs, so the alias map became seventeen entries each
 * mapping a name to itself. A field whose every value equals another field is
 * not a mapping, it is noise that can drift.
 *
 * The assertion it supported got STRONGER, not weaker: §6's skill list must now
 * equal this slug set exactly, in both directions.
 */
export const SKILLS: readonly SkillEntry[] = [
  {
    slug: 'four-lever-calculator',
    status: 'present',
    purpose: 'The four value levers, quantified against a specific account.',
  },
  {
    slug: 'permitting-analyzer',
    status: 'present',
    purpose: 'Permit path, NSR/BACT exposure, the no-combustion advantage.',
  },
  {
    slug: 'deal-qualification',
    status: 'present',
    purpose: 'MEDDPICC scorecard and the qualification verdict.',
  },
  {
    slug: 'discovery-call-prep',
    status: 'present',
    purpose: 'The G0 first-contact prep. Narrower sibling of meeting-prep.',
  },
  {
    slug: 'account-deep-dive',
    status: 'present',
    purpose: 'Full account research pass — run first when context is thin.',
  },
  {
    slug: 'pro-forma',
    status: 'present',
    purpose: 'Pro forma construction and sanity check.',
  },
  {
    slug: 'stage-gate',
    status: 'present',
    purpose: 'Gate advancement assessment, G0–G8.',
  },
  {
    slug: 'exec-briefing',
    status: 'present',
    purpose: 'Executive-level brief, thesis first.',
  },
  {
    slug: 'war-room',
    status: 'present',
    purpose: 'Adversarial pressure test of a deal at risk.',
  },
  {
    slug: 'power-pulse',
    status: 'present',
    purpose: 'Market pulse read across the book.',
  },
  {
    slug: 'prospect-originator',
    status: 'present',
    purpose: 'New-logo origination from a thesis or a territory.',
  },
  {
    slug: 'market-segmentation',
    status: 'present',
    purpose: 'Segment definition and prioritisation.',
  },
  {
    slug: 'electrical-assessor',
    status: 'present',
    purpose: 'One-line, interconnection and protection assessment.',
  },
  {
    slug: 'contract-negotiator',
    status: 'present',
    purpose: 'Term sheet, redline strategy, concession map.',
  },
  {
    slug: 'account-strategy',
    status: 'present',
    purpose: 'Account plan and land-and-expand strategy.',
  },
  {
    slug: 'business-case-engine',
    status: 'present',
    purpose: 'Champion-facing business case construction.',
  },
  {
    slug: 'meeting-prep',
    status: 'present',
    purpose:
      'Persona-specific, stage-aware meeting prep. 13 personas, 16 meeting types.',
  },
];

/**
 * ── THE KNOWLEDGE FILES ─────────────────────────────────────────
 *
 * WHERE THEY LIVE: `knowledge/` at the repo root, beside `prompts/` and
 * `skills/`. Same rule, third directory — reference material is read verbatim
 * from a committed file and never restated in code.
 *
 * They get their OWN directory rather than sharing `skills/` because they are a
 * different kind of thing and the difference is load-bearing: a skill is a
 * procedure the model executes, a knowledge file is material it consults. They
 * have no frontmatter, no slug, and no `SKILL-` prefix, so every check that
 * makes the skills directory safe would have to be special-cased to let them
 * through — and a directory with two sets of rules is a directory where the
 * weaker set wins by accident.
 *
 * REFERENCE MATERIAL IS TEXT. There is no `format` field. The loader sniffs the
 * bytes it actually read and refuses anything that is not text, which covers a
 * PDF, a ZIP, an image, and the case that actually happened — a ZIP wearing a
 * `.pdf` extension. A declared format would have trusted the extension, and the
 * extension was the lie.
 */
export interface KnowledgeEntry {
  filename: string;
  /**
   * `present` — committed, must load.
   * `awaited` — not synced yet, must NOT exist, will load once it does.
   * `retired` — §6 still names it, but it must NEVER be loaded and never will
   *             be. Not a missing file: a file that would do harm if supplied.
   *
   * All three are assertions, pinned in both directions.
   */
  status: 'present' | 'awaited' | 'retired';
  /**
   * Required when status is `retired`. Goes in front of anyone who tries to
   * load it, so "why is this not here" never has to be reconstructed.
   */
  retiredReason?: string;
}

/**
 * The six files §6 names. SIX IS THE FINAL SET.
 *
 * PowerBD.pdf is gone from both — v3.1.11 removed it from §6 and this entry
 * went with it, which is exactly what the forcing function existed to compel.
 * It was never a missing file: it was a ZIP wearing a `.pdf` extension holding
 * a screenshotted copy of this prompt at v1.0, twelve versions stale. Deleting
 * the name was the right fix; a `retired` entry pointing at a name doctrine no
 * longer uses would have been debt with a passing test.
 *
 * The `retired` status stays on the type. Nothing carries it today, and the
 * formatting for it is tested directly (see `retiredKnowledgeReason`) precisely
 * because it has no live case — a branch that only runs the day something goes
 * wrong is a branch that rots until that day.
 */
export const KNOWLEDGE: readonly KnowledgeEntry[] = [
  { filename: 'competitive-matrix.md', status: 'present' },
  { filename: 'ercot-market-primer.md', status: 'present' },
  { filename: 'permitting-playbook.md', status: 'present' },
  { filename: 'vertical-playbooks.md', status: 'present' },
  { filename: 'objection-battlecards.md', status: 'present' },
  { filename: 'reference-bundle.md', status: 'present' },
];

/**
 * Files that must never be loaded, whatever appears on disk.
 *
 * Empty today. The `describe.skipIf` blocks that exercise it are guarded, and
 * the shelf's state pin in tests/skills.test.ts holds the exact counts so an
 * empty set is an asserted fact rather than a silence (checklist rule 10).
 */
export const RETIRED_KNOWLEDGE: readonly KnowledgeEntry[] = KNOWLEDGE.filter(
  (k) => k.status === 'retired',
);

/** Filenames only, for the §6 cross-check. */
export const KNOWLEDGE_FILES: readonly string[] = KNOWLEDGE.map((k) => k.filename);

/**
 * ── PLATFORM CAPABILITIES ───────────────────────────────────────
 *
 * Names a skill file references as though they were sibling skills, which are
 * actually things the PLATFORM does.
 *
 * Found by reading the seventeen files: `meeting-prep`'s dependency table
 * chains to `document-forge` and `market-watch`, and neither was a skill, in §6
 * or anywhere else. They are real capabilities — /api/forge and the
 * market-watch task — so the reference was correct and the category was wrong.
 *
 * v3.1.11 GAVE THEM THEIR OWN §6 LINE, which is the fix that matters: the
 * distinction is now declared in doctrine rather than inferred here. This list
 * is checked against that line in both directions, so it is a cross-reference
 * to an authority rather than a private ignore list — and an ignore list is
 * what would have absorbed the next genuinely dangling reference silently.
 */
export const PLATFORM_CAPABILITIES: readonly { name: string; resolvesTo: string }[] = [
  { name: 'document-forge', resolvesTo: 'POST /api/forge — lib/forge/generate.ts, lib/forge/pdf.ts' },
  { name: 'market-watch', resolvesTo: "the 'market-watch' task — lib/prompts/modules/market-watch.ts" },
];

/**
 * Every sibling capability a skill file names, as backticked identifiers.
 *
 * THE SAME DEFECT CLASS AS §6, ONE LAYER DOWN. §6 named skills that did not
 * exist; the skills name each other, and two of those names resolved to
 * nothing. Nobody would have noticed until a chain ran.
 *
 * Matches only HYPHENATED lowercase identifiers. Single words are ordinary
 * prose in backticks and underscored ones are Spine field names, so requiring
 * a hyphen keeps this to things shaped like a slug. A future file that
 * backticks some other hyphenated term will fail this check, and registering it
 * is the deliberate act that keeps the check meaningful.
 */
export function parseSkillReferences(text: string): string[] {
  const found = text.match(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g) ?? [];
  return [...new Set(found.map((m) => m.slice(1, -1)))].sort();
}

/** Does this name resolve to a skill or to a declared platform capability? */
export function referenceResolves(name: string): boolean {
  return (
    SKILLS.some((s) => s.slug === name) ||
    PLATFORM_CAPABILITIES.some((c) => c.name === name)
  );
}

const BY_SLUG = new Map(SKILLS.map((s) => [s.slug, s]));

export function skill(slug: SkillSlug): SkillEntry {
  const found = BY_SLUG.get(slug);
  if (!found) throw new Error(`Unknown skill slug: ${slug}`);
  return found;
}

/** The filename a slug maps to, relative to `skills/`. */
export function skillFilename(slug: SkillSlug): string {
  return `SKILL-${slug}.md`;
}

/**
 * The `name:` a skill file declares in its YAML frontmatter, or null.
 *
 * The filename and the frontmatter are two independent claims about which skill
 * a file is, and a file copied from a sibling and renamed carries the wrong
 * one. Checking both is what turns a rename into a failed test rather than the
 * quiet delivery of the wrong doctrine.
 *
 * Pure text parsing, so it lives here rather than in the loader and can be
 * exercised in both directions without touching the disk.
 */
export function frontmatterName(text: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const line = match[1].split('\n').find((l) => /^name\s*:/i.test(l));
  if (!line) return null;
  return line.replace(/^name\s*:/i, '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * The knowledge files a skill DECLARES it reasons over.
 *
 * DECLARED, NEVER RETRIEVED. Which doctrine a model sees is chosen by a list a
 * human wrote and a test checks, not by similarity scoring at request time.
 * Nondeterministic selection of doctrine is the failure class this build spent
 * itself removing — an unpredictable shelf is worse than a large one, because a
 * large one is at least the same every time.
 *
 * DECLARED IN THE SKILL FILE, NOT THE REGISTRY. Skills are doctrine and their
 * dependencies are doctrine. A registry-side list would be a code claim about
 * doctrine — the self-authorized assertion that §6's capabilities line closed.
 *
 * THE RULE FOR AGGREGATORS: a skill declares what its OWN prose reasons over,
 * never the union of what its dependencies would need. Inheritance through a
 * chain is an optimization, not a contract — declaring `[]` and betting on being
 * chained fails silently and empty, which is the `business-case-engine` failure
 * again. Declaring and being chained anyway costs duplicate tokens, which is
 * cheap and visible.
 *
 * ABSENT IS NOT EMPTY. `null` means nobody decided; `[]` means somebody decided
 * none. If absent could mean none, a new skill would silently reach nothing —
 * so the key is required on all seventeen and the suite fails without it.
 */
export function parseSkillKnowledge(text: string): string[] | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const line = match[1].split('\n').find((l) => /^knowledge\s*:/i.test(l));
  if (!line) return null;

  const body = line.replace(/^knowledge\s*:/i, '').trim();
  const inner = /^\[(.*)\]$/.exec(body);
  if (!inner) return null;

  return inner[1]
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Is this a registered knowledge file that can actually be loaded? */
export function knowledgeIsLoadable(filename: string): boolean {
  return KNOWLEDGE.some((k) => k.filename === filename && k.status === 'present');
}

/**
 * ── PARSING §6 ──────────────────────────────────────────────────
 *
 * PARSED, NEVER COPIED. A hardcoded second copy of any of these lists agrees
 * with the prompt until the first edit to either, and then agrees with nothing
 * — the exact failure mode that let `integrator` survive in code after doctrine
 * had renamed it.
 *
 * v3.1.11 restructured §6 into three labelled lines and BACKTICKS EVERY NAME on
 * all three. So the parser extracts backticked tokens rather than splitting on
 * punctuation, which is both simpler and stricter: it cannot be confused by a
 * separator change, a sentence period, or the ` (Bucket 3)` annotations the
 * capabilities line carries after each slug.
 *
 * This RETIRES the trailing-dot handling, and it is worth being precise about
 * why, because the earlier reasoning was right for the earlier format. Under
 * v3.1.10 the skills line was bare prose split on commas, so a trailing period
 * had to be stripped from the last item — and stripping every dot instead
 * turned `PowerBD.pdf` into `PowerBDpdf`. Backtick extraction never sees the
 * period at all: it sits outside the closing backtick. The class of bug is
 * gone rather than guarded against, which is the better outcome.
 *
 * Every parser returns [] when its line is absent, and every caller must treat
 * that as a failure rather than as "nothing declared" — an empty list satisfies
 * "everything resolves" vacuously, and a vacuous pass is the silent-direction
 * defect this registry exists to prevent.
 */
function backtickedOn(promptText: string, label: RegExp): string[] {
  const line = promptText.split('\n').find((l) => label.test(l));
  if (!line) return [];
  return (line.match(/`([^`]+)`/g) ?? []).map((m) => m.slice(1, -1).trim()).filter(Boolean);
}

/** The seventeen slugs §6 tells the brain it can invoke. */
export function parseSection6Skills(promptText: string): string[] {
  return backtickedOn(promptText, /^\s*\*\*Skills\*\*\s*—\s*invoke by slug\s*:/i);
}

/** The reference files §6 tells the brain it can consult. */
export function parseSection6Knowledge(promptText: string): string[] {
  return backtickedOn(promptText, /^\s*\*\*Knowledge files\*\*\s*—\s*reference by name\s*:/i);
}

/**
 * Capabilities §6 names that are NOT skills.
 *
 * They appear on their own line precisely so nothing has to infer the
 * distinction from context. The skill files reference them in the same slug
 * form, so they must resolve — but they must never be treated as skills, or
 * the loader would start demanding `SKILL-document-forge.md`.
 */
export function parseSection6Capabilities(promptText: string): string[] {
  return backtickedOn(promptText, /^\s*\*\*Platform capabilities\*\*/i);
}

/**
 * A caveat §6 attaches to a reference file, parsed from the shipped prompt.
 *
 * §6 OWNS THIS, and v3.1.11 says so in the line itself: "This sentence is the
 * canonical wording of that caveat; anything that displays it reads it from
 * here rather than keeping a copy." The registry held a copy for exactly one
 * commit and that was one too many.
 *
 * The trailing italic parenthetical is STRIPPED. It is doctrine addressed to
 * whoever implements the display, not to the model reading the file — printing
 * "anything that displays it reads it from here" above a competitive matrix
 * would be an instruction to nobody in the room.
 */
export function parseKnowledgeCaveat(
  promptText: string,
  filename: string,
): string | null {
  const stem = filename.replace(/\.[^.]+$/, '');
  const line = promptText
    .split('\n')
    .find((l) => /^\s*\**Note:\**/i.test(l) && l.includes(stem));
  if (!line) return null;

  const body = line
    .replace(/^\s*\**Note:\**\s*/i, '')
    .replace(/\s*\*\([^)]*\)\*\s*$/, '')
    .trim();
  return body || null;
}

export interface SkillCoverage {
  total: number;
  present: number;
  awaited: number;
  /** Named in §6 but with no registry entry — doctrine pointing at nothing. */
  unresolved: string[];
  /** Registered but not named in §6 — a capability the brain cannot reach. */
  unnamedInSection6: SkillSlug[];
  /** More than one version in the source project, choice not yet made. */
  versionsPending: SkillSlug[];
}

/**
 * The coverage read, for the status surface.
 *
 * Takes the prompt TEXT rather than reading it, so this stays pure and the
 * caller decides where the bytes come from. It also means the health surface
 * can be handed a prompt it loaded itself rather than depending on the loader
 * it is reporting on (checklist rule 9).
 *
 * Both directions, and both are live: §6 naming a slug the registry lacks, and
 * the registry holding a slug §6 never names. v3.1.11 emptied the second set —
 * `business-case-engine` and `meeting-prep` were the two entries in it, both
 * built and unreachable by name until doctrine caught up.
 */
export function skillCoverage(promptText: string): SkillCoverage {
  const named = parseSection6Skills(promptText);
  const slugs = new Set<string>(SKILLS.map((s) => s.slug));
  return {
    total: SKILLS.length,
    present: SKILLS.filter((s) => s.status === 'present').length,
    awaited: SKILLS.filter((s) => s.status === 'awaited').length,
    unresolved: named.filter((n) => !slugs.has(n)),
    unnamedInSection6: SKILLS.filter((s) => !named.includes(s.slug)).map((s) => s.slug),
    versionsPending: SKILLS.filter((s) => s.versionsPending).map((s) => s.slug),
  };
}
