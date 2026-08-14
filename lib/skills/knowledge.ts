import { readFileSync } from 'fs';
import { join } from 'path';
import { SYSTEM_PROMPT } from '@/lib/prompts/system';
import { KNOWLEDGE, parseKnowledgeCaveat, type KnowledgeEntry } from './registry';

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
    return {
      ...base,
      ready: false,
      error:
        `Knowledge file "${filename}" is RETIRED and must never be loaded. ` +
        (entry.retiredReason ?? 'No reason recorded.'),
    };
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
