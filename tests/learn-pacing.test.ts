import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PACING_INSTRUCTION, followUpsFor, allFollowUps } from '@/lib/learn/pacing';
import { MODES } from '@/lib/learn/modes';

describe('pacing tells the model to stop, and gives the reader a way on', () => {
  it('every mode has follow-ups', () => {
    // Rule 18: a mode with none is a mode where the pacing instruction becomes
    // withholding, because there is nothing on screen to continue with.
    for (const m of MODES) {
      expect(followUpsFor(m.mode).length, `${m.mode} has no follow-ups`).toBeGreaterThan(0);
    }
  });

  it('the instruction forbids the model announcing what it left out', () => {
    const t = PACING_INSTRUCTION.toLowerCase();
    expect(t).toContain('let me know if you would like');
    expect(t).toContain('do not offer a menu');
    // The reason the shortening is not withholding.
    expect(t).toContain('one click to ask for more');
  });

  it('an unknown mode returns nothing rather than throwing', () => {
    // @ts-expect-error deliberately outside the union
    expect(followUpsFor('nonsense')).toEqual([]);
  });
});

describe('a follow-up is an instruction the reader gives, never a verdict they receive', () => {
  /**
   * ⚠️ THE GUARDRAIL IS EASIEST TO VIOLATE HERE, BY ACCIDENT. Any feedback
   * implying a right answer is a score with the number removed, and a chip is
   * exactly the place a well-meant "you're getting there" would land.
   */
  it('no chip label or prompt reports on the reader', () => {
    const banned = [
      'score', 'level', 'mastery', 'proficien', 'streak', 'badge', 'grade',
      'you got', 'you scored', 'well done', 'correct so far', 'out of',
      'progress', 'rating', 'rank',
    ];
    for (const f of allFollowUps()) {
      const text = `${f.label} ${f.ask}`.toLowerCase();
      for (const b of banned) {
        expect(text, `"${f.label}" contains "${b}"`).not.toContain(b);
      }
    }
  });

  it('every ask is phrased as the reader speaking', () => {
    for (const f of allFollowUps()) {
      // Imperative or first-person: "give me", "ask me", "keep going".
      expect(f.ask, `"${f.label}"`).not.toMatch(/^\s*(you|your)\b/i);
      expect(f.ask.length).toBeGreaterThan(10);
    }
  });

  it('labels are short enough to sit in a row', () => {
    for (const f of allFollowUps()) {
      expect(f.label.length, f.label).toBeLessThanOrEqual(22);
    }
  });

  it('labels are unique within a mode', () => {
    for (const m of MODES) {
      const labels = followUpsFor(m.mode).map((f) => f.label);
      expect(new Set(labels).size, m.mode).toBe(labels.length);
    }
  });

  it('the drill follow-ups let the READER turn the dial', () => {
    // "harder" is the reader asking for a harder question. The forbidden shape
    // is the system telling them where they are.
    const asks = followUpsFor('drill').map((f) => f.ask.toLowerCase());
    expect(asks.some((a) => a.includes('ask me a harder one'))).toBe(true);
    for (const a of asks) expect(a).not.toMatch(/\byou (are|were|need|should)\b/);
  });
});

describe('the chips are wired without gating anything', () => {
  it('no follow-up button is ever disabled', async () => {
    const src = await readFile('components/modules/learn-panel.tsx', 'utf8');
    const block = /followUpsFor\(activeMode\)[\s\S]*?<\/button>/.exec(src);
    expect(block, 'the follow-up row was not found — this test checks nothing').toBeTruthy();
    expect(block![0]).not.toContain('disabled');
  });

  it('a follow-up does not empty a box the reader has typed in', async () => {
    const src = await readFile('components/modules/learn-panel.tsx', 'utf8');
    expect(src).toContain("if (instead === undefined) setInput('')");
  });

  it('the route sends the pacing instruction', async () => {
    const src = await readFile('app/api/learn/route.ts', 'utf8');
    expect(src).toContain('PACING_INSTRUCTION');
  });
});

describe('the reading environment', () => {
  it('the Learn answer renders at the reading scale', async () => {
    const src = await readFile('components/learn/answer.tsx', 'utf8');
    expect(src).toContain('scale="reading"');
    // The old rendering: dense UI text in the dim colour. If it comes back,
    // this is the assertion that notices.
    expect(src).not.toMatch(/className="whitespace-pre-wrap text-read/);
  });

  it('the reading scale is the .prose class the design system declares', async () => {
    const src = await readFile('components/ui/formatted-text.tsx', 'utf8');
    expect(src).toMatch(/reading \? 'prose/);

    const css = await readFile('app/globals.css', 'utf8');
    const prose = /\.prose \{([\s\S]*?)\}/.exec(css);
    expect(prose, '.prose is not declared in globals.css').toBeTruthy();
    // Size without a measure makes long reading worse rather than better.
    expect(prose![1]).toContain('max-width: var(--measure)');
    expect(prose![1]).toContain('var(--text-read)');
  });

  it('both scales come from ONE formatter', async () => {
    // The dense panels and the reading surface drifting apart is the second-copy
    // pattern that has failed on the tokens/Tailwind pair and the seed halves.
    const ai = await readFile('components/ui/ai-output.tsx', 'utf8');
    expect(ai).toContain("from './formatted-text'");
    expect(ai).not.toContain('function FormattedText');
  });
});
