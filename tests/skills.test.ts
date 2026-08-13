import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { POWERDEAL_VERSION } from '@/lib/brand';
import {
  KNOWLEDGE_FILES, SKILLS, frontmatterName, parseSection6Knowledge,
  parseSection6Skills, resolveSection6Name, skillCoverage, skillFilename,
} from '@/lib/skills/registry';
import { loadSkill, skillBlock } from '@/lib/skills/load';

/**
 * §6 NAMES A CAPABILITY; A FILE HAS TO ANSWER TO IT.
 *
 * Nineteen skill files existed in the Claude project and none existed here, so
 * every domain call has been telling the model it can reach things that are
 * nowhere on disk. This suite is the mechanism that makes that visible: a
 * rename in the prompt, a rename of a file, a file that lands without being
 * registered, or a registered skill whose file disappears — each one fails
 * HERE rather than in front of a customer.
 *
 * Every assertion runs in BOTH directions, on the standing rule that a check
 * which has only ever seen the passing case is unproven. `awaited` is pinned as
 * hard as `present`: an unregistered file arriving is as much a failure as a
 * registered file going missing.
 */

const REPO = process.cwd();
const PROMPT_PATH = join(REPO, 'prompts', `powerdeal-v${POWERDEAL_VERSION}-system-prompt.md`);
const SKILLS_DIR = join(REPO, 'skills');

const promptText = await readFile(PROMPT_PATH, 'utf-8');

/**
 * Every markdown file in `skills/` that claims to BE a skill.
 *
 * The `SKILL-` prefix is the filter, not `.md` — the directory's own README is
 * documentation about the convention, not doctrine under it. Filtering on the
 * prefix rather than maintaining an ignore list means a stray `war-room.md`
 * dropped in without the prefix still gets caught, by the frontmatter and §6
 * assertions, as a skill that doctrine names and the registry cannot find.
 */
async function skillFilenames(): Promise<string[]> {
  const entries = await readdir(SKILLS_DIR).catch(() => [] as string[]);
  return entries.filter((f) => f.startsWith('SKILL-') && f.endsWith('.md')).sort();
}

describe('§6 parsing', () => {
  /**
   * The guard against a VACUOUS PASS. If the parser silently returned nothing,
   * "every §6 name resolves" would be true of the empty set and this whole file
   * would go green while doctrine named fifteen ghosts.
   */
  it('finds the skills line and returns names, not an empty list', () => {
    const names = parseSection6Skills(promptText);
    expect(names.length).toBeGreaterThan(10);
    expect(names).toContain('four-lever calculator');
  });

  it('returns an empty list when the line is absent — so callers can tell', () => {
    expect(parseSection6Skills('## 6. KNOWLEDGE FILES\nnothing here\n')).toEqual([]);
    expect(parseSection6Knowledge('nothing here')).toEqual([]);
  });

  it('strips the formatting §6 actually uses', () => {
    const names = parseSection6Skills('Skills (natural language): war room, `power pulse`, exec briefing.');
    expect(names).toEqual(['war room', 'power pulse', 'exec briefing']);
  });
});

describe('every name in §6 resolves to a registered skill', () => {
  const named = parseSection6Skills(promptText);

  it.each(named)('§6 names "%s"', (name) => {
    const entry = resolveSection6Name(name);
    expect(
      entry,
      `§6 names "${name}" and no registry entry claims it. Either the prompt ` +
        `renamed a skill or lib/skills/registry.ts is behind it.`,
    ).toBeDefined();
  });

  /**
   * The other direction. Without this, deleting a name from §6 breaks nothing
   * — the remaining names all still resolve — and the registry keeps claiming
   * an alias doctrine no longer uses.
   */
  it.each(SKILLS.filter((s) => s.section6Name))(
    'registry claims §6 name for $slug and §6 still has it',
    (entry) => {
      expect(
        named.map((n) => n.toLowerCase()),
        `registry says §6 names "${entry.section6Name}" for ${entry.slug}, but §6 does not.`,
      ).toContain(entry.section6Name!.toLowerCase());
    },
  );

  it('reports unresolved names rather than throwing on them', () => {
    const coverage = skillCoverage(promptText);
    expect(coverage.unresolved).toEqual([]);
    expect(coverage.total).toBe(SKILLS.length);
    expect(coverage.present + coverage.awaited).toBe(SKILLS.length);
  });

  it('flags a §6 rename as unresolved instead of passing quietly', () => {
    const renamed = promptText.replace('four-lever calculator', 'four lever calc');
    expect(renamed).not.toBe(promptText); // the mutation actually applied
    expect(skillCoverage(renamed).unresolved).toContain('four lever calc');
  });
});

describe('present skills resolve to a real file', () => {
  const present = SKILLS.filter((s) => s.status === 'present');

  it('there is at least one, or this block proves nothing', () => {
    expect(present.length).toBeGreaterThan(0);
  });

  it.each(present)('$slug loads', async (entry) => {
    const loaded = loadSkill(entry.slug);
    expect(loaded.error).toBeNull();
    expect(loaded.ready).toBe(true);
    expect(loaded.text.length).toBeGreaterThan(1000);
  });

  it.each(present)('$slug declares its own slug in frontmatter', async (entry) => {
    const text = await readFile(join(SKILLS_DIR, skillFilename(entry.slug)), 'utf-8');
    expect(frontmatterName(text)).toBe(entry.slug);
  });

  it('skillBlock hands over the file verbatim', () => {
    const block = skillBlock('meeting-prep');
    expect(block).toContain(loadSkill('meeting-prep').text);
  });
});

describe('awaited skills are pinned as hard as present ones', () => {
  const awaited = SKILLS.filter((s) => s.status === 'awaited');
  const shouldNotExist = awaited.map((s) => skillFilename(s.slug));

  /**
   * The set is pinned EXACTLY. When one of the fifteen outstanding skills lands
   * in `skills/`, this fails until someone flips its status in the registry —
   * which is the moment the frontmatter check, the loader and the §6 alias all
   * start applying to it. A directory scan would have absorbed the new file
   * silently and none of that would have run.
   */
  it('no awaited skill has a file on disk yet', async () => {
    const onDisk = await skillFilenames();
    const surprises = shouldNotExist.filter((f) => onDisk.includes(f));
    expect(
      surprises,
      `These landed in skills/ but are still marked "awaited". Flip their ` +
        `status to "present" in lib/skills/registry.ts so the loader and the ` +
        `frontmatter check start covering them.`,
    ).toEqual([]);
  });

  it('every markdown file in skills/ is a registered, present skill', async () => {
    const expected = SKILLS.filter((s) => s.status === 'present')
      .map((s) => skillFilename(s.slug))
      .sort();
    expect(await skillFilenames()).toEqual(expected);
  });

  it.each(awaited)('$slug reports why it is unavailable, and never throws', (entry) => {
    const loaded = loadSkill(entry.slug);
    expect(loaded.ready).toBe(false);
    expect(loaded.error).toContain(skillFilename(entry.slug));
  });

  /**
   * NO HARD GATE. An unavailable skill degrades the output and says so; it does
   * not refuse. Asserting the block is non-empty is the whole point — a loader
   * that returned '' for a missing skill would produce a brief with no visible
   * difference from a complete one.
   */
  it.each(awaited)('$slug still produces a block that names the gap', (entry) => {
    const block = skillBlock(entry.slug);
    expect(block).toContain('NOT AVAILABLE');
    expect(block).toContain(entry.slug);
    expect(block.toLowerCase()).toContain('do not refuse');
  });
});

describe('frontmatter is checked in both directions', () => {
  it('reads the declared name', () => {
    expect(frontmatterName('---\nname: meeting-prep\ndescription: x\n---\n# T')).toBe('meeting-prep');
    expect(frontmatterName("---\nname: 'war-room'\n---\n")).toBe('war-room');
  });

  it('returns null when there is no frontmatter or no name', () => {
    expect(frontmatterName('# Just a heading\n')).toBeNull();
    expect(frontmatterName('---\ndescription: x\n---\n')).toBeNull();
  });

  it('a file whose frontmatter names a different skill is not ready', () => {
    // The failure this guards: a skill copied from a sibling, renamed on the
    // filesystem, and shipped — which delivers the WRONG doctrine under the
    // right filename, and nothing about the output says so.
    const copied = '---\nname: war-room\n---\n# Meeting Prep\n';
    expect(frontmatterName(copied)).not.toBe('meeting-prep');
  });
});

describe('knowledge files §6 names', () => {
  const named = parseSection6Knowledge(promptText);

  it('parses the reference line', () => {
    expect(named.length).toBe(KNOWLEDGE_FILES.length);
  });

  it('matches the registry list exactly', () => {
    expect([...named].sort()).toEqual([...KNOWLEDGE_FILES].sort());
  });

  /**
   * None of the seven have landed. Pinned the same way the awaited skills are:
   * when one arrives, this fails until it is moved out of the awaited list and
   * given a loader, rather than sitting in a directory nothing reads.
   */
  it('none are in the repo yet, and the registry says so', async () => {
    const dirs = ['knowledge', 'skills', 'prompts'];
    const present: string[] = [];
    for (const dir of dirs) {
      const entries = await readdir(join(REPO, dir)).catch(() => [] as string[]);
      for (const f of entries) if (KNOWLEDGE_FILES.includes(f)) present.push(`${dir}/${f}`);
    }
    expect(
      present,
      'A knowledge file §6 references has landed. Register it and give it a ' +
        'loader — an unreferenced file in a directory is the gap this suite exists to catch.',
    ).toEqual([]);
  });
});
