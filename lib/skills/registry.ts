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
   * The name §6 uses, verbatim and lowercased, or null when §6 does not name
   * this skill at all. Null is a DOCTRINE GAP, not a spare field: a skill the
   * brain has never heard of will not be invoked by the brain.
   */
  section6Name: string | null;
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
 * All seventeen skills, in the order they were inventoried. Every one is on
 * disk.
 *
 * Six are named differently in §6 than they are named as files. Recorded here
 * rather than corrected in either direction: the slug is artifact identity,
 * referenced by the filename, the frontmatter and the loader, while the §6 name
 * is prose in one document. The registry guarantees the two refer to the same
 * artifact and that neither can change alone; picking a winner is a doctrine
 * edit (see docs/BACKLOG.md item 8).
 */
export const SKILLS: readonly SkillEntry[] = [
  {
    slug: 'four-lever-calculator',
    section6Name: 'four-lever calculator',
    status: 'present',
    purpose: 'The four value levers, quantified against a specific account.',
  },
  {
    slug: 'permitting-analyzer',
    section6Name: 'permitting analyzer',
    status: 'present',
    purpose: 'Permit path, NSR/BACT exposure, the no-combustion advantage.',
  },
  {
    slug: 'deal-qualification',
    section6Name: 'qualification scorecard',
    status: 'present',
    purpose: 'MEDDPICC scorecard and the qualification verdict.',
  },
  {
    slug: 'discovery-call-prep',
    section6Name: 'discovery prep',
    status: 'present',
    purpose: 'The G0 first-contact prep. Narrower sibling of meeting-prep.',
  },
  {
    slug: 'account-deep-dive',
    section6Name: 'account deep-dive',
    status: 'present',
    purpose: 'Full account research pass — run first when context is thin.',
  },
  {
    slug: 'pro-forma',
    section6Name: 'pro forma check',
    status: 'present',
    purpose: 'Pro forma construction and sanity check.',
  },
  {
    slug: 'stage-gate',
    section6Name: 'stage-gate review',
    status: 'present',
    purpose: 'Gate advancement assessment, G0–G8.',
  },
  {
    slug: 'exec-briefing',
    section6Name: 'exec briefing',
    status: 'present',
    purpose: 'Executive-level brief, thesis first.',
  },
  {
    slug: 'war-room',
    section6Name: 'war room',
    status: 'present',
    purpose: 'Adversarial pressure test of a deal at risk.',
  },
  {
    slug: 'power-pulse',
    section6Name: 'power pulse',
    status: 'present',
    purpose: 'Market pulse read across the book.',
  },
  {
    slug: 'prospect-originator',
    section6Name: 'prospect originator',
    status: 'present',
    purpose: 'New-logo origination from a thesis or a territory.',
  },
  {
    slug: 'market-segmentation',
    section6Name: 'market segmentation',
    status: 'present',
    purpose: 'Segment definition and prioritisation.',
  },
  {
    slug: 'electrical-assessor',
    section6Name: 'electrical integration assessor',
    status: 'present',
    purpose: 'One-line, interconnection and protection assessment.',
  },
  {
    slug: 'contract-negotiator',
    section6Name: 'contract negotiator',
    status: 'present',
    purpose: 'Term sheet, redline strategy, concession map.',
  },
  {
    slug: 'account-strategy',
    section6Name: 'account strategy builder',
    status: 'present',
    purpose: 'Account plan and land-and-expand strategy.',
  },
  {
    slug: 'business-case-engine',
    // §6 does not name this one. The platform has a business-case task; the
    // brain has no instruction to reach for a business-case SKILL.
    section6Name: null,
    status: 'present',
    purpose: 'Champion-facing business case construction.',
  },
  {
    slug: 'meeting-prep',
    // §6 does not name this one either — and it is the first skill to land.
    section6Name: null,
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
 * PDF IS NOT MARKDOWN. `PowerBD.pdf` is binary. It is asserted for presence and
 * size and never read as text into a prompt — a UTF-8 read of a PDF produces
 * mojibake that looks like content, which is worse than a missing file.
 */
export interface KnowledgeEntry {
  filename: string;
  format: 'markdown' | 'pdf';
  /** Same contract as SkillEntry.status, and pinned in both directions. */
  status: 'present' | 'awaited';
}

/**
 * A caveat §6 attaches to a reference file, parsed from the shipped prompt.
 *
 * §6 OWNS THIS. There is no `caveat` field on the entry above, deliberately —
 * it held one for exactly one commit and that was one copy too many. A caveat
 * stored here and also written in §6 is two rules that agree until the first
 * edit, which is the argument this entire registry exists to make. Same
 * discipline as the tier-1b rename and the Both → Multiple rename: one concept,
 * one authority, and the code reads it rather than restating it.
 *
 * The repo's own PROCEDURE — commit reference material as-is, never edit it to
 * match current doctrine — is not doctrine and does not live here. It is in
 * knowledge/README.md, where instructions to a human belong.
 *
 * Matches a Note line that names the file. Returns null when §6 attaches no
 * caveat, which is the normal case for six of the seven.
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
  return line.replace(/^\s*\**Note:\**\s*/i, '').trim() || null;
}

/**
 * The seven files §6 names. Six are on disk; PowerBD.pdf has not arrived and
 * stays pinned as absent, so it fails the suite the moment it lands unregistered.
 */
export const KNOWLEDGE: readonly KnowledgeEntry[] = [
  { filename: 'competitive-matrix.md', format: 'markdown', status: 'present' },
  { filename: 'ercot-market-primer.md', format: 'markdown', status: 'present' },
  { filename: 'permitting-playbook.md', format: 'markdown', status: 'present' },
  { filename: 'vertical-playbooks.md', format: 'markdown', status: 'present' },
  { filename: 'objection-battlecards.md', format: 'markdown', status: 'present' },
  { filename: 'reference-bundle.md', format: 'markdown', status: 'present' },
  // Not uploaded. Six of seven arrived; this one is still outstanding and stays
  // pinned as absent, which is the partial state the status field exists for.
  { filename: 'PowerBD.pdf', format: 'pdf', status: 'awaited' },
];

/** Filenames only, for the §6 cross-check. */
export const KNOWLEDGE_FILES: readonly string[] = KNOWLEDGE.map((k) => k.filename);

/**
 * ── PLATFORM CAPABILITIES ───────────────────────────────────────
 *
 * Names a skill file references as though they were sibling skills, which are
 * actually things the PLATFORM does.
 *
 * Found by reading the seventeen files: `meeting-prep`'s dependency table
 * chains to `document-forge` and `market-watch`, and neither is a skill, in §6
 * or anywhere else. They are real capabilities — /api/forge and the
 * market-watch task — so the reference is correct and the category is wrong.
 *
 * Declared rather than ignored so the cross-reference check below can resolve
 * them. The alternative is an ignore list, and an ignore list absorbs the next
 * genuinely dangling reference silently.
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

/**
 * §6 name → registry entry. Lowercased and whitespace-collapsed on both sides,
 * because the difference between "four-lever calculator" and "Four-Lever
 * Calculator" is not a difference anyone intends.
 */
const BY_SECTION_6 = new Map(
  SKILLS.filter((s) => s.section6Name).map((s) => [normalise(s.section6Name!), s]),
);

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function skill(slug: SkillSlug): SkillEntry {
  const found = BY_SLUG.get(slug);
  if (!found) throw new Error(`Unknown skill slug: ${slug}`);
  return found;
}

/** Resolve a name as §6 writes it. Undefined means doctrine names a ghost. */
export function resolveSection6Name(name: string): SkillEntry | undefined {
  return BY_SECTION_6.get(normalise(name));
}

/** The filename a slug maps to, relative to `skills/`. */
export function skillFilename(slug: SkillSlug): string {
  return `SKILL-${slug}.md`;
}

/**
 * Pull the skill names out of §6 of the system prompt.
 *
 * PARSED, NEVER COPIED. A hardcoded second copy of the list agrees with the
 * prompt file until the first edit to either, and then agrees with nothing —
 * the exact failure mode that let `integrator` survive in code after doctrine
 * had renamed it. This reads the shipped line, so renaming a skill in the
 * markdown fails the suite instead of failing in front of a customer.
 *
 * Returns [] when the line is absent, which the caller must treat as a failure
 * rather than as "no skills declared" — an empty list would otherwise satisfy
 * "every name resolves" vacuously, and a vacuous pass is the silent-direction
 * defect this whole registry exists to prevent.
 */
export function parseSection6Skills(promptText: string): string[] {
  const line = promptText
    .split('\n')
    .find((l) => /^\s*Skills\s*\(natural language\)\s*:/i.test(l));
  if (!line) return [];

  return line
    .replace(/^\s*Skills\s*\(natural language\)\s*:/i, '')
    .split(',')
    .map(clean)
    .filter(Boolean);
}

/**
 * Strip §6's decoration without eating the content.
 *
 * The trailing period is the sentence ending; a period INSIDE the token is a
 * file extension. Removing every dot turned `PowerBD.pdf` into `PowerBDpdf` —
 * a name that would never match a file and, in a comparison against a list this
 * same function had produced, would have matched itself perfectly. Only the
 * cross-check against the hand-written registry caught it.
 */
function clean(raw: string): string {
  return raw.replace(/[`*]/g, '').trim().replace(/\.$/, '');
}

/** Pull the knowledge filenames out of the "Reference by name:" line of §6. */
export function parseSection6Knowledge(promptText: string): string[] {
  const line = promptText
    .split('\n')
    .find((l) => /^\s*Reference by name\s*:/i.test(l));
  if (!line) return [];

  return line
    .replace(/^\s*Reference by name\s*:/i, '')
    .split('·')
    .map(clean)
    .filter(Boolean);
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
 * it is reporting on.
 */
export function skillCoverage(promptText: string): SkillCoverage {
  const named = parseSection6Skills(promptText);
  return {
    total: SKILLS.length,
    present: SKILLS.filter((s) => s.status === 'present').length,
    awaited: SKILLS.filter((s) => s.status === 'awaited').length,
    unresolved: named.filter((n) => !resolveSection6Name(n)),
    unnamedInSection6: SKILLS.filter((s) => !s.section6Name).map((s) => s.slug),
    versionsPending: SKILLS.filter((s) => s.versionsPending).map((s) => s.slug),
  };
}
