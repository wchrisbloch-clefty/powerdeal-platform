import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { POWERDEAL_VERSION } from '@/lib/brand';
import {
  KNOWLEDGE, KNOWLEDGE_FILES, PLATFORM_CAPABILITIES, SKILLS, frontmatterName,
  parseSection6Knowledge, parseSection6Skills, parseSkillReferences,
  referenceResolves, resolveSection6Name, skillCoverage, skillFilename,
} from '@/lib/skills/registry';
import {
  awaitedSkillReason, loadSkill, skillBlock, unavailableSkillBlock,
} from '@/lib/skills/load';
import { knowledgeBlock, loadKnowledge } from '@/lib/skills/knowledge';

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

describe('the directory and the registry cannot disagree', () => {
  const awaited = SKILLS.filter((s) => s.status === 'awaited');

  /**
   * The set is pinned EXACTLY, in both directions, and it is now EMPTY —
   * all seventeen skills are on disk. That is exactly when this check earns
   * its keep: the eighteenth skill to arrive fails here until someone
   * registers it, which is the moment the frontmatter check, the loader and
   * the §6 alias start applying to it. A directory scan would have absorbed
   * it silently and none of that would have run.
   */
  it('no awaited skill has a file on disk', async () => {
    const onDisk = await skillFilenames();
    const surprises = awaited.map((s) => skillFilename(s.slug)).filter((f) => onDisk.includes(f));
    expect(
      surprises,
      `These landed in skills/ but are still marked "awaited". Flip their ` +
        `status to "present" in lib/skills/registry.ts so the loader and the ` +
        `frontmatter check start covering them.`,
    ).toEqual([]);
  });

  it('every SKILL- file on disk is a registered, present skill', async () => {
    const expected = SKILLS.filter((s) => s.status === 'present')
      .map((s) => skillFilename(s.slug))
      .sort();
    expect(await skillFilenames()).toEqual(expected);
  });

  it('all seventeen are accounted for', async () => {
    expect(SKILLS).toHaveLength(17);
    expect(await skillFilenames()).toHaveLength(17);
    expect(awaited).toEqual([]);
  });
});

/**
 * THE DEGRADATION PATH, WITH NO LIVE CASE LEFT TO EXERCISE IT.
 *
 * Every skill is on disk, so nothing in normal operation reaches the
 * unavailable branch any more. That is precisely why it is tested directly
 * rather than through `loadSkill`: a degradation path with no live case is a
 * path that rots until the day it is needed, and the day it is needed is the
 * day a skill fails to sync and a rep carries a brief that reads complete.
 *
 * The functions are pure and exported for this reason and no other.
 */
describe('no hard gate — an unavailable skill degrades and says so', () => {
  it('names the file and the one-line fix', () => {
    const reason = awaitedSkillReason('war-room', 'SKILL-war-room.md');
    expect(reason).toContain('SKILL-war-room.md');
    expect(reason).toContain('registry.ts');
  });

  it('produces a block that a reader cannot mistake for a complete brief', () => {
    const block = unavailableSkillBlock('war-room', 'not synced');
    expect(block).toContain('NOT AVAILABLE');
    expect(block).toContain('war-room');
    expect(block).toContain('not synced');
    // Generate anyway. A 503 ten minutes before a call is the worse outcome.
    expect(block.toLowerCase()).toContain('do not refuse');
    expect(block.toLowerCase()).toContain('generate anyway');
  });

  it('says something even when the reason is missing', () => {
    // A null reason must not render as "Reason: null" or vanish the notice.
    expect(unavailableSkillBlock('war-room', null)).toContain('unknown');
  });

  it('a loaded skill never renders the unavailable notice', () => {
    // The other direction, and the one that catches a branch inverted.
    expect(skillBlock('war-room')).not.toContain('NOT AVAILABLE');
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
   * None of the seven have landed. Pinned the same way the skills were: when
   * one arrives, this fails until its status flips — which is the moment the
   * loader, the size check and the caveat start applying to it. A file sitting
   * in a directory nothing reads is the same gap the skills spent two versions
   * in, wearing a different hat.
   *
   * Scanned across three directories, not just `knowledge/`, because "dropped
   * it next to the prompt" is the likeliest way one of these actually lands.
   */
  it('none are in the repo yet, and the registry says so', async () => {
    const dirs = ['knowledge', 'skills', 'prompts'];
    const found: string[] = [];
    for (const dir of dirs) {
      const entries = await readdir(join(REPO, dir)).catch(() => [] as string[]);
      for (const f of entries) if (KNOWLEDGE_FILES.includes(f)) found.push(`${dir}/${f}`);
    }
    expect(
      found,
      'A knowledge file §6 references has landed. Flip its status to "present" ' +
        'in lib/skills/registry.ts — an unread file in a directory is the gap ' +
        'this suite exists to catch.',
    ).toEqual([]);
  });

  it('every entry declares a format, and only the PDF is binary', () => {
    // The format field decides whether the loader reads bytes or text. A PDF
    // read as UTF-8 returns mojibake rather than throwing, which a prompt
    // would carry and a model would try to use.
    expect(KNOWLEDGE.filter((k) => k.format === 'pdf').map((k) => k.filename)).toEqual([
      'PowerBD.pdf',
    ]);
    for (const k of KNOWLEDGE) expect(['markdown', 'pdf']).toContain(k.format);
  });

  it('refuses a filename that is not registered', () => {
    const loaded = loadKnowledge('made-up-primer.md');
    expect(loaded.ready).toBe(false);
    expect(loaded.error).toContain('not a registered knowledge file');
  });

  it.each(KNOWLEDGE)('$filename reports why it is unavailable, and never throws', (entry) => {
    const loaded = loadKnowledge(entry.filename);
    expect(loaded.ready).toBe(false);
    expect(loaded.error).toContain(entry.filename);
  });

  it.each(KNOWLEDGE)('$filename still produces a block naming the gap', (entry) => {
    const block = knowledgeBlock(entry.filename);
    expect(block).toContain('NOT AVAILABLE');
    expect(block).toContain(entry.filename);
    // Proceed without it — but never reconstruct it from general knowledge.
    expect(block).toContain('Do not');
  });

  /**
   * The caveat is doctrine and it travels with the file, so it is asserted
   * here rather than trusted to a paragraph of the prompt. `knowledgeBlock`
   * prints it ABOVE the content when the file is present — a warning below the
   * material is read by whoever already doubted it.
   */
  it('competitive-matrix carries its staleness caveat in the registry', () => {
    const entry = KNOWLEDGE.find((k) => k.filename === 'competitive-matrix.md')!;
    expect(entry.caveat).toBeTruthy();
    expect(entry.caveat).toContain('four-tier');
    expect(entry.caveat).toContain('as-is');
    expect(loadKnowledge('competitive-matrix.md').caveat).toBe(entry.caveat);
  });

  it('no other entry invents a caveat it was not given', () => {
    const withCaveat = KNOWLEDGE.filter((k) => k.caveat).map((k) => k.filename);
    expect(withCaveat).toEqual(['competitive-matrix.md']);
  });

  /**
   * THE CAVEAT NOW EXISTS TWICE, AND THAT IS A RISK THIS CREATED.
   *
   * §6 already carries a note saying competitive-matrix predates v3.1 and is
   * overridden by the four-tier set. The registry restates it operationally so
   * the loader can print it above the content without reading the prompt.
   *
   * Two copies of a rule is two rules, and they diverge on the first edit —
   * the entire argument of the last two commits. Since the second copy was
   * judged worth having, it gets the same treatment §6's skill list gets: the
   * prompt is PARSED, and the registry fails if doctrine moves out from under
   * it. Resolving the duplication properly is a v3.1.11 question (BACKLOG 8c).
   */
  it('the registry caveat does not contradict §6', () => {
    const note = promptText
      .split('\n')
      .find((l) => l.includes('competitive-matrix') && /predates/i.test(l));
    expect(
      note,
      '§6 no longer carries the competitive-matrix staleness note. The registry ' +
        'caveat is now a second, unbacked copy — reconcile them.',
    ).toBeTruthy();
    // Both must still say the four-tier set wins over whatever the file says.
    expect(note!.toLowerCase()).toContain('four-tier');
    expect(KNOWLEDGE.find((k) => k.filename === 'competitive-matrix.md')!.caveat!.toLowerCase())
      .toContain('four-tier');
  });
});

/**
 * SKILLS REFERENCE EACH OTHER, AND TWO OF THOSE NAMES RESOLVED TO NOTHING.
 *
 * The same defect class as §6, one layer down. §6 named skills that did not
 * exist; the skill files name sibling capabilities in their dependency tables,
 * and `document-forge` and `market-watch` are not skills — they are things the
 * platform does. The references are correct and the category is wrong, which is
 * the kind of thing nobody notices until a chain actually runs.
 */
describe('skill-to-skill references resolve', () => {
  it('finds references, or this block proves nothing', async () => {
    const text = await readFile(join(SKILLS_DIR, 'SKILL-meeting-prep.md'), 'utf-8');
    const refs = parseSkillReferences(text);
    expect(refs.length).toBeGreaterThan(3);
    expect(refs).toContain('account-deep-dive');
  });

  it('matches slug-shaped names only', () => {
    // Underscored Spine fields and single backticked words are prose, not
    // capability references — matching them would bury the real signal.
    expect(parseSkillReferences('use `war-room` and `next_move` and `stage`')).toEqual(['war-room']);
    expect(parseSkillReferences('nothing here')).toEqual([]);
  });

  it('every reference in every skill file resolves', async () => {
    const files = await skillFilenames();
    const dangling: string[] = [];
    for (const f of files) {
      const text = await readFile(join(SKILLS_DIR, f), 'utf-8');
      for (const ref of parseSkillReferences(text)) {
        if (!referenceResolves(ref)) dangling.push(`${f} → ${ref}`);
      }
    }
    expect(
      dangling,
      'A skill names a sibling capability that is neither a registered skill ' +
        'nor a declared platform capability. Register it, or fix the reference.',
    ).toEqual([]);
  });

  it('flags a dangling reference rather than passing quietly', () => {
    // Both directions. A resolver that returned true for everything would make
    // the check above vacuous.
    expect(referenceResolves('war-room')).toBe(true);
    expect(referenceResolves('document-forge')).toBe(true);
    expect(referenceResolves('objection-handler')).toBe(false);
  });

  it('platform capabilities say what they actually resolve to', () => {
    // A name with no destination is a note, not a registration.
    expect(PLATFORM_CAPABILITIES.map((c) => c.name).sort()).toEqual([
      'document-forge',
      'market-watch',
    ]);
    for (const c of PLATFORM_CAPABILITIES) expect(c.resolvesTo.length).toBeGreaterThan(10);
  });

  it('a platform capability is not silently treated as a skill', () => {
    // They resolve, but they are NOT in SKILLS — otherwise the §6 checks and
    // the loader would start demanding files for them.
    for (const c of PLATFORM_CAPABILITIES) {
      expect(SKILLS.map((s) => s.slug)).not.toContain(c.name);
    }
  });
});
