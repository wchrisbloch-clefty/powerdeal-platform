import { readFileSync } from 'fs';
import { join } from 'path';
import { frontmatterName, skill, skillFilename, type SkillSlug } from './registry';

/**
 * ═══════════════════════════════════════════════════════════════
 * SKILL LOADING — verbatim from disk, never inferred.
 * ═══════════════════════════════════════════════════════════════
 *
 * Same contract as `lib/prompts/system.ts`, one layer down: the file is the
 * doctrine, the code is a reader. Nothing here summarises, reorders or
 * re-expresses a skill — a prompt module hands the model the markdown as
 * written, because a paraphrase is a second copy and second copies drift.
 *
 * NO HARD GATE. A missing skill degrades the output, it does not refuse it. The
 * system prompt still carries the methodology at lower resolution, so a meeting
 * brief generated without the skill file is worse but useful, and a rep with a
 * worse brief is better off than a rep with a 503 ten minutes before a call.
 * What is NOT allowed is silence: `loadSkill` returns the reason, and every
 * caller is expected to put that reason where the reader will see it.
 *
 * Server-only — `fs` is unavailable in the browser bundle.
 */

const SKILLS_DIR = join(process.cwd(), 'skills');

export interface LoadedSkill {
  slug: SkillSlug;
  /** The markdown, verbatim. Empty string when unavailable. */
  text: string;
  ready: boolean;
  /** Human-readable reason it is unavailable, or null when ready. */
  error: string | null;
}

const cache = new Map<SkillSlug, LoadedSkill>();

export function loadSkill(slug: SkillSlug): LoadedSkill {
  const hit = cache.get(slug);
  if (hit) return hit;

  const entry = skill(slug);
  const filename = skillFilename(slug);
  const result = read(slug, filename, entry.status);
  cache.set(slug, result);
  return result;
}

function read(
  slug: SkillSlug,
  filename: string,
  status: 'present' | 'awaited',
): LoadedSkill {
  if (status === 'awaited') {
    return {
      slug,
      text: '',
      ready: false,
      error:
        `Skill "${slug}" has not been synced to the repo yet. ` +
        `Paste it into skills/${filename} and set its status to "present" in ` +
        `lib/skills/registry.ts.`,
    };
  }

  let text: string;
  try {
    text = readFileSync(join(SKILLS_DIR, filename), 'utf-8');
  } catch (err) {
    return {
      slug,
      text: '',
      ready: false,
      error: `Could not read skills/${filename}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const declared = frontmatterName(text);
  if (declared !== slug) {
    return {
      slug,
      text,
      ready: false,
      error:
        `skills/${filename} declares name "${declared ?? '(none)'}" but the ` +
        `registry slug is "${slug}". One of the two was renamed without the ` +
        `other.`,
    };
  }

  if (text.trim().length < 200) {
    return {
      slug,
      text,
      ready: false,
      error: `skills/${filename} looks truncated (${text.trim().length} chars).`,
    };
  }

  return { slug, text, ready: true, error: null };
}

/**
 * The doctrine block a prompt module embeds, or the notice that stands in for
 * it. Never returns empty — the absence of a skill is information the output
 * carries, not information it drops.
 */
export function skillBlock(slug: SkillSlug): string {
  const loaded = loadSkill(slug);
  if (loaded.ready) {
    return [
      `SKILL DOCTRINE — ${slug} (verbatim from skills/${skillFilename(slug)}):`,
      '',
      loaded.text,
    ].join('\n');
  }
  return [
    `SKILL DOCTRINE — ${slug}: NOT AVAILABLE.`,
    `Reason: ${loaded.error}`,
    '',
    'Generate anyway, from the methodology in the system prompt. Open the output',
    'with one line stating that the detailed skill was unavailable and that the',
    'brief runs on the base methodology, so the reader knows which they are',
    'holding. Do not invent the missing structure and do not refuse.',
  ].join('\n');
}
