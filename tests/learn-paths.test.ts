import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { LEARN_PATHS, pathSources } from '@/lib/learn/paths';
import { resolvePaths } from '@/lib/learn/paths-resolve';
import { MODES } from '@/lib/learn/modes';
import { loadKnowledge } from '@/lib/skills/knowledge';

describe('every path is grounded in doctrine that exists', () => {
  it('names a knowledge file that loads', () => {
    // ⚠️ THE POINT OF THE WHOLE FILE. A path whose source does not resolve
    // offers questions the model answers from general knowledge — fluently,
    // and indistinguishably from the grounded version at the point of reading.
    for (const { path, available, reason } of resolvePaths()) {
      expect(available, `${path.id} → ${path.source}: ${reason ?? ''}`).toBe(true);
    }
  });

  it('the resolver reports the loader’s own reason for one that does not', () => {
    // Rule 4: the unavailable branch is the one nothing exercises in normal
    // use, so it is exercised directly rather than assumed to work.
    const k = loadKnowledge('a-file-that-was-never-registered.md');
    expect(k.ready).toBe(false);
    expect(k.error).toBeTruthy();
  });

  it('resolves every declared path, not a subset', () => {
    expect(resolvePaths()).toHaveLength(LEARN_PATHS.length);
    expect(pathSources().length).toBeGreaterThan(0);
  });
});

describe('a path is an order, not a ladder', () => {
  /**
   * The guardrail is easiest to violate by accident, so it is asserted against
   * the source rather than against the type: a field added later would type-
   * check fine and quietly reintroduce scoring.
   */
  it('declares no progress, completion or score field anywhere', async () => {
    const src = await readFile('lib/learn/paths.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of [
      'complete', 'completed', 'progress', 'score', 'mastery', 'proficien',
      'streak', 'level', 'badge', 'done:', 'percent',
    ]) {
      expect(code.toLowerCase(), `paths.ts mentions "${banned}"`).not.toContain(banned);
    }
  });

  it('the component holds no per-step state', async () => {
    const src = await readFile('components/learn/paths.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // One useState CALL — the import is not a state hook. Counting the bare
    // word found two and reported a component holding twice the state it does.
    expect([...code.matchAll(/useState[<(]/g)]).toHaveLength(1);
    expect(code).toContain('useState<string | null>(null)');
    for (const banned of ['localStorage', 'sessionStorage', 'asked', 'visited']) {
      expect(code, `paths.tsx uses ${banned}`).not.toContain(banned);
    }
  });

  it('every step is reachable — nothing is gated on an earlier one', async () => {
    const src = await readFile('components/learn/paths.tsx', 'utf8');
    expect(src).not.toMatch(/\bdisabled\b/);
  });
});

describe('the steps are usable as written', () => {
  it('ids are unique', () => {
    const ids = LEARN_PATHS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every step names a real mode', () => {
    const known = new Set(MODES.map((m) => m.mode));
    for (const p of LEARN_PATHS) {
      for (const s of p.steps) {
        expect(known.has(s.mode), `${p.id}: unknown mode ${s.mode}`).toBe(true);
      }
    }
  });

  it('every path has an outcome and at least three steps', () => {
    for (const p of LEARN_PATHS) {
      expect(p.outcome.length, p.id).toBeGreaterThan(20);
      expect(p.steps.length, p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every step says why it sits where it does', () => {
    for (const p of LEARN_PATHS) {
      for (const s of p.steps) {
        expect(s.because.length, `${p.id}: "${s.ask}"`).toBeGreaterThan(20);
      }
    }
  });

  it('the ask reads like something a person would type', () => {
    /**
     * No sentence-case opening and no trailing question mark — the register the
     * mode examples already use in the box's placeholder.
     *
     * ⚠️ AN ACRONYM KEEPS ITS CASE, and the first version of this assertion did
     * not allow that. It failed on "SOFC versus an aero turbine", and the only
     * way to satisfy it as written was to lower-case SOFC — which is precisely
     * the defect lib/design/casing.ts exists to catch. A style rule that forces
     * a correctness violation is the rule that is wrong.
     */
    const acronym = /^[A-Z0-9&$¢/-]{2,}\b/;
    for (const p of LEARN_PATHS) {
      for (const s of p.steps) {
        const opensWell = s.ask[0] === s.ask[0].toLowerCase() || acronym.test(s.ask);
        expect(opensWell, `${p.id}: "${s.ask}" opens in sentence case`).toBe(true);
        expect(s.ask.endsWith('?'), `${p.id}: "${s.ask}"`).toBe(false);
      }
    }
  });

  it('no step is duplicated across paths', () => {
    const all = LEARN_PATHS.flatMap((p) => p.steps.map((s) => s.ask));
    expect(new Set(all).size).toBe(all.length);
  });
});
