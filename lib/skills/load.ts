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

/**
 * Why an un-synced skill is unavailable, and what closes it.
 *
 * PURE, AND EXPORTED, BECAUSE THE AWAITED SET IS NOW EMPTY. All seventeen
 * skills are on disk, so no test can reach this path through `loadSkill` any
 * more — and a degradation path with no live case is a path that rots until the
 * day it is needed. Testing it directly keeps it proven; deleting it would
 * remove the only thing standing between a future un-synced skill and a brief
 * that reads complete.
 */
export function awaitedSkillReason(slug: string, filename: string): string {
  return (
    `Skill "${slug}" has not been synced to the repo yet. ` +
    `Paste it into skills/${filename} and set its status to "present" in ` +
    `lib/skills/registry.ts.`
  );
}

function read(
  slug: SkillSlug,
  filename: string,
  status: 'present' | 'awaited',
): LoadedSkill {
  if (status === 'awaited') {
    return { slug, text: '', ready: false, error: awaitedSkillReason(slug, filename) };
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
 * The stand-in when a skill cannot be loaded.
 *
 * PURE AND EXPORTED for the same reason as `awaitedSkillReason` — with every
 * skill on disk, nothing in normal operation produces this string, so the only
 * way it stays correct is a test that calls it directly.
 *
 * NO HARD GATE. This degrades the output; it does not refuse it. The system
 * prompt still carries the methodology at lower resolution, and a rep with a
 * worse brief ten minutes before a call is better off than a rep with a 503.
 * What it must never do is return something a reader cannot distinguish from a
 * complete brief.
 */
export function unavailableSkillBlock(slug: string, reason: string | null): string {
  return [
    `SKILL DOCTRINE — ${slug}: NOT AVAILABLE.`,
    `Reason: ${reason ?? 'unknown'}`,
    '',
    'Generate anyway, from the methodology in the system prompt. Open the output',
    'with one line stating that the detailed skill was unavailable and that the',
    'brief runs on the base methodology, so the reader knows which they are',
    'holding. Do not invent the missing structure and do not refuse.',
  ].join('\n');
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
  return unavailableSkillBlock(slug, loaded.error);
}
