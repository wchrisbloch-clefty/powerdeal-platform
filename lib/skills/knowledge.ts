import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { KNOWLEDGE, type KnowledgeEntry } from './registry';

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
  /** Markdown text, verbatim. ALWAYS EMPTY for a PDF — see below. */
  text: string;
  ready: boolean;
  error: string | null;
  /** The doctrine caveat that travels with this file, when it has one. */
  caveat: string | null;
}

const cache = new Map<string, LoadedKnowledge>();

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

  const base = { filename, text: '', caveat: entry.caveat ?? null };

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

  /**
   * A PDF IS NEVER READ AS TEXT.
   *
   * `readFileSync(pdf, 'utf-8')` does not throw. It returns mojibake — a wall
   * of replacement characters with a few legible strings in it — which looks
   * enough like content that a prompt would carry it and a model would try to
   * use it. Presence and size are the only honest checks here, and a caller
   * that needs the contents needs a PDF extractor, not this function.
   */
  if (entry.format === 'pdf') {
    try {
      const bytes = statSync(path).size;
      if (bytes < 1024) {
        return { ...base, ready: false, error: `knowledge/${filename} is only ${bytes} bytes — truncated or a placeholder.` };
      }
      return { ...base, ready: true, error: null };
    } catch (err) {
      return {
        ...base,
        ready: false,
        error: `Could not stat knowledge/${filename}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

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

  if (!loaded.text) {
    // A registered PDF: present and verified, but not text this can embed.
    header.push('', '(Binary reference — present in the repo, not embedded here.)');
    return header.join('\n');
  }

  return [...header, '', loaded.text].join('\n');
}
