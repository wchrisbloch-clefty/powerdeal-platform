import { readFileSync } from 'fs';
import { join } from 'path';
import { SYSTEM_PROMPT } from '@/lib/prompts/system';
import {
  KNOWLEDGE, knowledgeIsLoadable, parseKnowledgeCaveat, parseSkillKnowledge,
  type KnowledgeEntry,
} from './registry';
import { loadSkill } from './load';
import type { SkillSlug } from './registry';
import {
  selectPlaybook,
  resolveDeclaration,
  isVerticalPlaybook,
  absenceNote,
  type PlaybookSelection,
} from './vertical-playbook';

/**
 * DOES THIS LOOK LIKE TEXT?
 *
 * `readFileSync(binary, 'utf-8')` does not throw. It returns mojibake — a wall
 * of U+FFFD replacement characters with a few legible strings in it — which is
 * enough like content that a prompt would carry it and a model would try to use
 * it.
 *
 * The check is on the BYTES ACTUALLY READ, not on the extension, because the
 * extension is what lied. `PowerBD.pdf` was not a PDF: it was a ZIP with a
 * `.pdf` name. A declared `format: 'pdf'` field would have trusted that name and
 * routed it to a PDF path, and a PDF parser fails on a ZIP with an error about
 * PDF structure — a misleading answer to the wrong question. Sniffing content
 * gives the same verdict for a ZIP, a PDF, a JPEG or a truncated download: this
 * is not text, do not put it in a prompt.
 */
export function looksBinary(text: string): boolean {
  // A NUL byte never appears in text. The ZIP that arrived as PowerBD.pdf is
  // caught here, before the ratio test is even reached.
  if (text.includes('\u0000')) return true;

  // A wall of replacement characters is a binary file read as UTF-8; one or two
  // is a real document with a mis-encoded glyph. BOTH conditions, because
  // either alone is wrong: a count alone flags a long document with scattered
  // bad bytes, and a ratio alone flags a short string with a single glyph —
  // 1 in 44 characters is 2%, which a ratio-only test calls binary.
  const replacements = (text.match(/\uFFFD/g) ?? []).length;
  return replacements > 16 && replacements / Math.max(text.length, 1) > 0.02;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * KNOWLEDGE FILES — the reference shelf, read verbatim.
 * ═══════════════════════════════════════════════════════════════
 *
 * §6 names seven reference files. They live in `knowledge/` at the repo root,
 * beside `prompts/` and `skills/`, under the same rule as both: read verbatim,
 * never restated in code.
 *
 * THIS EXISTS BEFORE THE FILES DO, DELIBERATELY. The gap being closed is not
 * "the files are missing" — it is "doctrine references material nothing can
 * reach". A file dropped into a directory no code reads is that same gap
 * wearing a different hat, and it is the gap the skills spent two versions in.
 * So the loader lands with the registry, and promoting a file to `present` is
 * the one-line change that switches it on.
 *
 * Server-only — `fs` is unavailable in the browser bundle.
 */

const KNOWLEDGE_DIR = join(process.cwd(), 'knowledge');

export interface LoadedKnowledge {
  filename: string;
  /** The file, verbatim. Empty when unavailable for any reason. */
  text: string;
  ready: boolean;
  error: string | null;
  /** The doctrine caveat that travels with this file, when it has one. */
  caveat: string | null;
}

/**
 * Why a retired file will never load.
 *
 * PURE AND EXPORTED BECAUSE NOTHING CARRIES THE STATUS ANY MORE. PowerBD.pdf
 * was the only one, and v3.1.11 removed it from §6 so its entry went too. The
 * branch is unreachable in normal operation, which is exactly when it starts to
 * rot — so it is tested directly rather than through `loadKnowledge`
 * (checklist rule 10, same treatment as `awaitedSkillReason`).
 *
 * RETIRED IS NOT MISSING. An `awaited` file is one somebody should go find. A
 * retired one would do harm if supplied, and the two must not read the same to
 * whoever hits this — so the reason travels with the refusal.
 */
export function retiredKnowledgeReason(filename: string, reason?: string): string {
  return (
    `Knowledge file "${filename}" is RETIRED and must never be loaded. ` +
    (reason ?? 'No reason recorded.')
  );
}

const cache = new Map<string, LoadedKnowledge>();

/**
 * Drop the memo so the next load re-reads from disk.
 *
 * Exists so the binary guard can be proven END TO END rather than only as a
 * pure function — the guard's whole job is to stop a real file on disk reaching
 * a prompt, and a check that only ever sees a constructed string has only ever
 * seen the constructed object (checklist rule 7). Also the honest answer for
 * any future hot-reload: a cache with no invalidation is a cache that serves a
 * file somebody has already replaced.
 */
export function clearKnowledgeCache(): void {
  cache.clear();
}

function entryFor(filename: string): KnowledgeEntry | undefined {
  return KNOWLEDGE.find((k) => k.filename === filename);
}

export function loadKnowledge(filename: string): LoadedKnowledge {
  const hit = cache.get(filename);
  if (hit) return hit;

  const result = read(filename);
  cache.set(filename, result);
  return result;
}

function read(filename: string): LoadedKnowledge {
  const entry = entryFor(filename);
  if (!entry) {
    return {
      filename,
      text: '',
      ready: false,
      caveat: null,
      error:
        `"${filename}" is not a registered knowledge file. Add it to ` +
        `KNOWLEDGE in lib/skills/registry.ts before loading it.`,
    };
  }

  /**
   * The caveat comes from §6, not from a field on the entry.
   *
   * It lived on the entry for one commit, which was one copy too many: a rule
   * written in doctrine and restated in TypeScript is two rules that agree
   * until the first edit. §6 is the authority and this reads it, the same way
   * the skill list is parsed rather than mirrored.
   */
  const base = {
    filename,
    text: '',
    caveat: parseKnowledgeCaveat(SYSTEM_PROMPT, filename),
  };

  /**
   * RETIRED IS NOT MISSING. Never load, never go looking, whatever is on disk.
   *
   * An `awaited` file is one somebody should go find. A retired one is a file
   * that would do harm if supplied, and the two must not read the same to
   * whoever hits this — so the reason travels with the refusal.
   */
  if (entry.status === 'retired') {
    return { ...base, ready: false, error: retiredKnowledgeReason(filename, entry.retiredReason) };
  }

  if (entry.status === 'awaited') {
    return {
      ...base,
      ready: false,
      error:
        `Knowledge file "${filename}" has not been synced to the repo yet. ` +
        `Drop it into knowledge/${filename} and set its status to "present" ` +
        `in lib/skills/registry.ts.`,
    };
  }

  const path = join(KNOWLEDGE_DIR, filename);

  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    return {
      ...base,
      ready: false,
      error: `Could not read knowledge/${filename}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (looksBinary(text)) {
    return {
      ...base,
      ready: false,
      error:
        `knowledge/${filename} is not text — it read as binary. Whatever the ` +
        `extension says, this file cannot go into a prompt. A UTF-8 read of a ` +
        `binary returns mojibake rather than throwing, so this is the only ` +
        `thing between it and a model.`,
    };
  }

  if (text.trim().length < 200) {
    return { ...base, text, ready: false, error: `knowledge/${filename} looks truncated (${text.trim().length} chars).` };
  }

  return { ...base, text, ready: true, error: null };
}

/**
 * The block a prompt embeds for one knowledge file, or the notice standing in
 * for it. Never returns empty — an absent reference is information the output
 * carries, not information it drops.
 *
 * THE CAVEAT LEADS. It goes above the content, not below it, on the same logic
 * as the inline-source rule: a warning printed after the material is read by
 * the reader who already doubted it, and the reader who needs it is the one who
 * did not. `competitive-matrix.md` is the live case — it predates v3.1 and the
 * tier it lacks has itself been renamed since, so a model handed it cold would
 * reason from two-generations-stale framing with nothing saying so.
 */
export function knowledgeBlock(filename: string): string {
  const loaded = loadKnowledge(filename);

  if (!loaded.ready) {
    return [
      `KNOWLEDGE FILE — ${filename}: NOT AVAILABLE.`,
      `Reason: ${loaded.error}`,
      '',
      'Proceed without it. Say once, in the output, that this reference was not',
      'available, so the reader knows what the answer did not consult. Do not',
      'reconstruct its contents from general knowledge.',
    ].join('\n');
  }

  const header = [`KNOWLEDGE FILE — ${filename} (verbatim from knowledge/${filename}):`];
  if (loaded.caveat) {
    header.push(
      '',
      `CAVEAT, BINDING, READ BEFORE THE CONTENT: ${loaded.caveat}`,
    );
  }

  return [...header, '', loaded.text].join('\n');
}


/**
 * ── DECLARED DEPENDENCIES ───────────────────────────────────────
 *
 * The knowledge a skill named, read from the skill file itself.
 *
 * A TASK LOADS ONLY WHAT ITS SKILL DECLARES. Callers pass a SLUG, never a
 * filename — there is no way to reach a knowledge file except through a skill
 * that names it, which is what makes selection auditable. Read the frontmatter
 * and you know exactly what a call will carry.
 *
 * Never throws. A skill whose file cannot be read, or whose declaration is
 * missing, degrades to a named gap rather than a refusal — the suite pins the
 * declaration on all seventeen, so the runtime path is a backstop, not a plan.
 */
export interface DeclaredKnowledge {
  slug: SkillSlug;
  /** Filenames the skill declared, in declaration order. */
  files: string[];
  /** Declared but not loadable — a typo, or a file that never landed. */
  unresolved: string[];
  /**
   * Everything the skill's frontmatter names, BEFORE the vertical narrows it.
   * Kept because `files` is deal-specific and this is not — a caller asking
   * "does this skill carry vertical doctrine at all" must not get an answer
   * that changes with whichever deal happened to be open.
   */
  declaredFiles: string[];
  /** Null when the skill file itself could not be read or has no key. */
  declared: boolean;
  /**
   * Which vertical playbook was chosen, or why none was. Present even for
   * skills that declare no playbook at all — the selection is about the deal,
   * not the skill, and a caller inspecting it should not have to know which
   * skills happen to carry vertical doctrine.
   */
  selection: PlaybookSelection;
  error: string | null;
}

/**
 * ⚠️ THE VERTICAL NARROWS THE SHELF; IT NEVER WIDENS IT.
 *
 * v3.1.12 split the vertical playbook into three. A skill DECLARES ALL THREE —
 * the declaration stays static and auditable, exactly as §6 requires — and the
 * two that do not match this deal's vertical are dropped here. Nothing is ever
 * added that the skill did not name.
 *
 * Omitting `vertical` loads NO playbook and says so, rather than loading all
 * three. Loading all three would reproduce the file this split exists to
 * retire; picking one would be a guess. Absent is reported, per doctrine.
 */
export function knowledgeForSkill(
  slug: SkillSlug,
  vertical?: string | null,
): DeclaredKnowledge {
  const skill = loadSkill(slug);
  if (!skill.ready) {
    return {
      slug,
      files: [],
      declaredFiles: [],
      unresolved: [],
      declared: false,
      selection: selectPlaybook(vertical),
      error: `Cannot read the declaration: ${skill.error}`,
    };
  }

  const declared = parseSkillKnowledge(skill.text);
  if (declared === null) {
    return {
      slug,
      files: [],
      declaredFiles: [],
      unresolved: [],
      declared: false,
      selection: selectPlaybook(vertical),
      error:
        `skills/SKILL-${slug}.md declares no \`knowledge:\` key. Absent is not ` +
        `the same as none — add \`knowledge: []\` if the skill genuinely reasons ` +
        `over no reference material.`,
    };
  }

  // Order matters here — unresolved on the FULL declaration, files on the
  // narrowed one. Lives in `resolveDeclaration` because proving that ordering
  // needs a misspelt declaration this repo does not contain.
  const selection = selectPlaybook(vertical);
  const { files, unresolved } = resolveDeclaration(declared, selection, knowledgeIsLoadable);

  return {
    slug,
    files,
    declaredFiles: declared,
    unresolved,
    declared: true,
    selection,
    error: unresolved.length
      ? `Declares ${unresolved.join(', ')}, which ${unresolved.length === 1 ? 'is' : 'are'} not a loadable knowledge file.`
      : null,
  };
}

/**
 * The reference shelf for one skill, ready to embed — or the reason it is thin.
 *
 * Returns '' when a skill declares nothing, which is a legitimate answer for
 * `stage-gate` and `business-case-engine` and must not be confused with a
 * failure. Anything that went wrong is stated instead of dropped.
 */
export function knowledgeBlocksForSkill(
  slug: SkillSlug,
  vertical?: string | null,
): string {
  const d = knowledgeForSkill(slug, vertical);

  if (!d.declared) {
    return [
      `REFERENCE SHELF — unavailable for ${slug}.`,
      `Reason: ${d.error}`,
      '',
      'Proceed on the methodology in the system prompt. Say once, in the output,',
      'that the reference material could not be resolved.',
    ].join('\n');
  }

  const blocks = d.files.map((f) => knowledgeBlock(f));
  if (d.unresolved.length) {
    blocks.push(
      [
        `KNOWLEDGE FILE — ${d.unresolved.join(', ')}: DECLARED BUT NOT AVAILABLE.`,
        `Reason: ${d.error}`,
        '',
        'Proceed without it and say so once in the output.',
      ].join('\n'),
    );
  }
  // WHY NO PLAYBOOK IS HERE, WHEN THERE IS NONE. Only when the skill actually
  // declares one — telling a skill that never carries vertical doctrine that it
  // is missing vertical doctrine is a warning about nothing, and a shelf that
  // cries wolf is a shelf whose warnings get skimmed.
  // Read off the FULL declaration, not the narrowed list — the narrowed list
  // has the playbooks removed, which is exactly the question being asked.
  const declaresPlaybook = d.declaredFiles.some((f) => isVerticalPlaybook(f));
  const note = declaresPlaybook ? absenceNote(d.selection) : null;
  if (note) blocks.push(note);

  return blocks.join('\n\n---\n\n');
}
