import { describe, expect, it } from 'vitest';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { POWERDEAL_VERSION } from '@/lib/brand';
import {
  KNOWLEDGE, KNOWLEDGE_FILES, PLATFORM_CAPABILITIES, RETIRED_KNOWLEDGE, SKILLS,
  frontmatterName,
  parseKnowledgeCaveat, parseSection6Knowledge, parseSection6Skills, parseSkillReferences,
  referenceResolves, resolveSection6Name, skillCoverage, skillFilename,
} from '@/lib/skills/registry';
import {
  awaitedSkillReason, loadSkill, skillBlock, unavailableSkillBlock,
} from '@/lib/skills/load';
import {
  clearKnowledgeCache, knowledgeBlock, loadKnowledge, looksBinary,
} from '@/lib/skills/knowledge';

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
   * Pinned in both directions, exactly as the skills are. Six have landed and
   * are registered; PowerBD.pdf has not, and the moment it appears anywhere
   * this fails until its status flips — which is the moment the size check and
   * the caveat lookup start applying to it.
   *
   * Scanned across three directories, not just `knowledge/`, because "dropped
   * it next to the prompt" is the likeliest way one of these actually lands.
   */
  /**
   * THE STATE PIN — exact counts, one place, changed deliberately.
   *
   * Everything below is GUARDED rather than required, because the sets it
   * describes legitimately empty out: `awaited` emptied when the sixth file
   * landed, and `retired` empties when v3.1.11 drops PowerBD.pdf from §6.
   * Guarded blocks alone would then assert nothing and say nothing about it
   * (checklist rule 10), so this one assertion holds the whole shape and cannot
   * go vacuous — an object comparison has no empty case.
   *
   * WHEN v3.1.11 LANDS: delete the PowerBD.pdf entry from KNOWLEDGE and set
   * `retired: []` here. Those two edits are the whole cleanup, and the
   * forcing function below stays red until both are done.
   */
  it('the shelf is in exactly the expected state', () => {
    expect({
      present: KNOWLEDGE.filter((k) => k.status === 'present').length,
      awaited: KNOWLEDGE.filter((k) => k.status === 'awaited').length,
      retired: RETIRED_KNOWLEDGE.map((k) => k.filename),
    }).toEqual({ present: 6, awaited: 0, retired: ['PowerBD.pdf'] });
  });

  it.skipIf(KNOWLEDGE.every((k) => k.status === 'present'))(
    'no file that must not exist is anywhere in the repo', async () => {
    // Covers `awaited` AND `retired` — both mean "must not be on disk", for
    // opposite reasons. Scoping this to `awaited` alone made it fire its own
    // empty-set guard the moment PowerBD.pdf stopped being "coming" and became
    // "never".
    const shouldNotExist = KNOWLEDGE
      .filter((k) => k.status !== 'present')
      .map((k) => k.filename);
    expect(shouldNotExist, 'nothing pinned absent — this check proves nothing').not.toEqual([]);

    const found: string[] = [];
    for (const dir of ['knowledge', 'skills', 'prompts']) {
      const entries = await readdir(join(REPO, dir)).catch(() => [] as string[]);
      for (const f of entries) if (shouldNotExist.includes(f)) found.push(`${dir}/${f}`);
    }
    expect(
      found,
      'A knowledge file §6 references has landed. Flip its status to "present" ' +
        'in lib/skills/registry.ts — an unread file in a directory is the gap ' +
        'this suite exists to catch.',
    ).toEqual([]);
  },
  );

  it('every markdown file in knowledge/ is a registered, present file', async () => {
    const expected = KNOWLEDGE.filter((k) => k.status === 'present')
      .map((k) => k.filename)
      .sort();
    const onDisk = (await readdir(join(REPO, 'knowledge')))
      .filter((f) => f !== 'README.md')
      .sort();
    expect(onDisk).toEqual(expected);
  });

  it.each(RETIRED_KNOWLEDGE)('$filename records why, in enough detail to act on', (k) => {
    expect(k.retiredReason, `${k.filename} is retired with no reason`).toBeTruthy();
    expect(k.retiredReason!.length).toBeGreaterThan(80);
  });

  it('refuses a filename that is not registered', () => {
    const loaded = loadKnowledge('made-up-primer.md');
    expect(loaded.ready).toBe(false);
    expect(loaded.error).toContain('not a registered knowledge file');
  });

  /**
   * THE PRESENT PATH, NOW LIVE.
   *
   * Recorded as unproven last commit — the loader's success branch had never
   * executed. Six files landed, so it executes now, and this is what proves it
   * rather than the shape of the code.
   */
  describe('the six that landed actually load', () => {
    const present = KNOWLEDGE.filter((k) => k.status === 'present');

    it('there are some, or the block below proves nothing', () => {
      // Checklist rule 10. it.each over an empty array registers no tests and
      // reports green, which is how the awaited-skills block silently stopped
      // asserting anything the moment every skill landed.
      expect(present.length).toBeGreaterThan(0);
    });

    it.each(present)('$filename loads', (entry) => {
      const loaded = loadKnowledge(entry.filename);
      expect(loaded.error).toBeNull();
      expect(loaded.ready).toBe(true);
      expect(loaded.text.length).toBeGreaterThan(1000);
    });

    it.each(present)('$filename is embedded verbatim', (entry) => {
      const block = knowledgeBlock(entry.filename);
      expect(block).toContain(loadKnowledge(entry.filename).text);
      expect(block).not.toContain('NOT AVAILABLE');
    });

    it('the caveat leads the content, it does not trail it', () => {
      // A warning printed after the material is read by whoever already
      // doubted it. The reader who needs it is the one who did not.
      const block = knowledgeBlock('competitive-matrix.md');
      const caveatAt = block.indexOf('CAVEAT');
      const contentAt = block.indexOf('# Competitive Matrix');
      expect(caveatAt).toBeGreaterThan(-1);
      expect(contentAt).toBeGreaterThan(-1);
      expect(caveatAt).toBeLessThan(contentAt);
    });

    it('a file with no §6 caveat gets no caveat header', () => {
      expect(knowledgeBlock('ercot-market-primer.md')).not.toContain('CAVEAT');
    });
  });

  /**
   * RETIRED IS NOT MISSING, AND MUST NOT READ AS MISSING.
   *
   * PowerBD.pdf was opened. It is not a PDF — a ZIP with a `.pdf` extension
   * holding page images and extracted text of "PowerDeal Strategist — System
   * Prompt v1.0", twelve versions stale. Supplying it would put v1.0 doctrine
   * in front of a v3.1.10 model with nothing on the page saying which wins.
   *
   * An `awaited` entry invites somebody to go find the file. That is the wrong
   * instruction here, which is why retirement is a separate status rather than
   * a comment on an awaited one.
   */
  describe.skipIf(RETIRED_KNOWLEDGE.length === 0)('the retired one', () => {
    it.each(RETIRED_KNOWLEDGE)('$filename never loads', (entry) => {
      const loaded = loadKnowledge(entry.filename);
      expect(loaded.ready).toBe(false);
      expect(loaded.text).toBe('');
      expect(loaded.error).toContain('RETIRED');
    });

    it.each(RETIRED_KNOWLEDGE)('$filename carries its reason to whoever hits it', (entry) => {
      const loaded = loadKnowledge(entry.filename);
      // Not "go find it" — the refusal has to explain itself or someone will
      // helpfully supply the thing.
      expect(loaded.error).not.toContain('has not been synced');
      expect(loaded.error).toContain('System Prompt v1.0');
    });

    it.each(RETIRED_KNOWLEDGE)('$filename is nowhere in the repo', async (entry) => {
      for (const dir of ['knowledge', 'skills', 'prompts']) {
        const entries = await readdir(join(REPO, dir)).catch(() => [] as string[]);
        expect(entries, `${entry.filename} found in ${dir}/`).not.toContain(entry.filename);
      }
    });

    /**
     * THE FORCING FUNCTION.
     *
     * The entry exists only to keep §6's current mention resolving. v3.1.11
     * removes the name; when it does, this fails until the entry is deleted.
     * A retirement that outlives its reason is debt, and debt with a passing
     * test is debt nobody finds.
     *
     * Verified satisfiable: with §6 edited, the entry deleted and the state pin
     * updated, the suite goes green with this block skipped. A forcing function
     * whose intended resolution does not clear it is a trap.
     */
    it.each(RETIRED_KNOWLEDGE)('$filename entry is deleted once §6 stops naming it', (entry) => {
      expect(
        parseSection6Knowledge(promptText),
        `§6 no longer names ${entry.filename}. Delete its entry from KNOWLEDGE ` +
          `in lib/skills/registry.ts and set retired: [] in the state pin above.`,
      ).toContain(entry.filename);
    });
  });

  /**
   * THE EXTENSION WAS THE LIE, SO THE CHECK IS ON THE BYTES.
   *
   * A declared `format: 'pdf'` would have trusted the filename and routed the
   * file to a PDF path — and a PDF parser fails on a ZIP with an error about
   * PDF structure, which is a confident answer to the wrong question. Content
   * sniffing gives one verdict for a ZIP, a PDF, a JPEG or a truncated
   * download: not text, keep it out of the prompt.
   */
  describe('a binary file cannot reach a prompt', () => {
    it('refuses a ZIP wearing a .md extension', async () => {
      // PK\x03\x04 — the signature of the file that actually arrived.
      const decoy = join(REPO, 'knowledge', 'ercot-market-primer.md');
      const original = await readFile(decoy);
      try {
        await writeFile(decoy, Buffer.concat([
          Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
          Buffer.alloc(4096, 0),
        ]));
        clearKnowledgeCache();
        const loaded = loadKnowledge('ercot-market-primer.md');
        expect(loaded.ready).toBe(false);
        expect(loaded.error).toContain('not text');
      } finally {
        await writeFile(decoy, original);
        clearKnowledgeCache();
      }
    });

    it('judges the bytes in both directions', () => {
      // A detector that returned true for everything would pass the test above
      // and break all six real files.
      expect(looksBinary('\u0000\u0000binary')).toBe(true);
      expect(looksBinary('\uFFFD'.repeat(40))).toBe(true);
      expect(looksBinary('# Competitive Matrix\n\nWärtsilä, 18–36 months.')).toBe(false);
      // One bad glyph in a short string is 2% — a ratio-only test calls that
      // binary, which is why the count floor is there too.
      expect(looksBinary('a normal document with one \uFFFD glyph in it')).toBe(false);
    });

    it('accepts every real file, so the sniff is not just refusing everything', () => {
      for (const k of KNOWLEDGE.filter((x) => x.status === 'present')) {
        expect(loadKnowledge(k.filename).ready, `${k.filename} misread as binary`).toBe(true);
      }
    });
  });

  /**
   * §6 OWNS THE CAVEAT. There is no field on the entry any more — it held one
   * for exactly one commit, and a rule written in doctrine and restated in
   * TypeScript is two rules that agree until the first edit.
   *
   * Same discipline as the tier-1b and Both → Multiple renames: one concept,
   * one authority, and the code reads it. That makes drift in emphasis
   * impossible rather than merely detectable — the earlier cross-check could
   * only catch contradiction.
   */
  it('parses competitive-matrix\u2019s caveat out of §6', () => {
    const caveat = parseKnowledgeCaveat(promptText, 'competitive-matrix.md');
    expect(
      caveat,
      '§6 no longer carries the competitive-matrix staleness note. The loader ' +
        'has nothing to print above the file — restore the note or decide the ' +
        'caveat no longer applies.',
    ).toBeTruthy();
    expect(caveat!.toLowerCase()).toContain('four-tier');
    expect(caveat!.toLowerCase()).toContain('predates');
    // Nothing between doctrine and the loader.
    expect(loadKnowledge('competitive-matrix.md').caveat).toBe(caveat);
  });

  it('returns null for a file §6 attaches no caveat to', () => {
    // Both directions. A parser that returned the same note for everything
    // would put a staleness warning on six clean files.
    for (const f of ['ercot-market-primer.md', 'vertical-playbooks.md', 'PowerBD.pdf']) {
      expect(parseKnowledgeCaveat(promptText, f), f).toBeNull();
    }
  });

  it('matches the Note line by the file it names, not by position', () => {
    const doc = '**Note:** widget-guide predates everything — ignore it.\nUnrelated line.';
    expect(parseKnowledgeCaveat(doc, 'widget-guide.md')).toBe(
      'widget-guide predates everything — ignore it.',
    );
    expect(parseKnowledgeCaveat(doc, 'other-guide.md')).toBeNull();
    // A mention that is not a Note is not a caveat.
    expect(parseKnowledgeCaveat('See widget-guide for detail.', 'widget-guide.md')).toBeNull();
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
