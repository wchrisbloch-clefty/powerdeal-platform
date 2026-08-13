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
   */
  versionsPending?: number;
}

/**
 * The seventeen skills, in the order they were inventoried.
 *
 * Six of them are named differently in §6 than they are named as files. That is
 * recorded here rather than corrected in either direction, because correcting
 * it means either editing doctrine or renaming files the Claude project owns,
 * and both are the user's call. What the registry guarantees is that the two
 * names refer to the same artifact and that neither can change alone.
 */
export const SKILLS: readonly SkillEntry[] = [
  {
    slug: 'four-lever-calculator',
    section6Name: 'four-lever calculator',
    status: 'awaited',
    purpose: 'The four value levers, quantified against a specific account.',
  },
  {
    slug: 'permitting-analyzer',
    section6Name: 'permitting analyzer',
    status: 'awaited',
    purpose: 'Permit path, NSR/BACT exposure, the no-combustion advantage.',
  },
  {
    slug: 'deal-qualification',
    section6Name: 'qualification scorecard',
    status: 'awaited',
    purpose: 'MEDDPICC scorecard and the qualification verdict.',
  },
  {
    slug: 'discovery-call-prep',
    section6Name: 'discovery prep',
    status: 'awaited',
    purpose: 'The G0 first-contact prep. Narrower sibling of meeting-prep.',
  },
  {
    slug: 'account-deep-dive',
    section6Name: 'account deep-dive',
    status: 'awaited',
    purpose: 'Full account research pass — run first when context is thin.',
  },
  {
    slug: 'pro-forma',
    section6Name: 'pro forma check',
    status: 'awaited',
    purpose: 'Pro forma construction and sanity check.',
  },
  {
    slug: 'stage-gate',
    section6Name: 'stage-gate review',
    status: 'awaited',
    purpose: 'Gate advancement assessment, G0–G8.',
    versionsPending: 2,
  },
  {
    slug: 'exec-briefing',
    section6Name: 'exec briefing',
    status: 'awaited',
    purpose: 'Executive-level brief, thesis first.',
  },
  {
    slug: 'war-room',
    section6Name: 'war room',
    status: 'awaited',
    purpose: 'Adversarial pressure test of a deal at risk.',
  },
  {
    slug: 'power-pulse',
    section6Name: 'power pulse',
    status: 'awaited',
    purpose: 'Market pulse read across the book.',
  },
  {
    slug: 'prospect-originator',
    section6Name: 'prospect originator',
    status: 'awaited',
    purpose: 'New-logo origination from a thesis or a territory.',
  },
  {
    slug: 'market-segmentation',
    section6Name: 'market segmentation',
    status: 'awaited',
    purpose: 'Segment definition and prioritisation.',
  },
  {
    slug: 'electrical-assessor',
    section6Name: 'electrical integration assessor',
    status: 'awaited',
    purpose: 'One-line, interconnection and protection assessment.',
  },
  {
    slug: 'contract-negotiator',
    section6Name: 'contract negotiator',
    status: 'awaited',
    purpose: 'Term sheet, redline strategy, concession map.',
    versionsPending: 2,
  },
  {
    slug: 'account-strategy',
    section6Name: 'account strategy builder',
    status: 'awaited',
    purpose: 'Account plan and land-and-expand strategy.',
  },
  {
    slug: 'business-case-engine',
    // §6 does not name this one. The platform has a business-case task; the
    // brain has no instruction to reach for a business-case SKILL.
    section6Name: null,
    status: 'awaited',
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

/** The knowledge files §6 names. None have landed; all are pinned as awaited. */
export const KNOWLEDGE_FILES: readonly string[] = [
  'competitive-matrix.md',
  'ercot-market-primer.md',
  'permitting-playbook.md',
  'vertical-playbooks.md',
  'objection-battlecards.md',
  'reference-bundle.md',
  'PowerBD.pdf',
];

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
