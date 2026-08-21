import { describe, it, expect } from 'vitest';
import { parseBlocks, hasStructure, blockFormatInstruction, VISUAL_FENCE } from '@/lib/learn/blocks';
import { PRACTICE_FENCE } from '@/lib/learn/practice/response';

/**
 * The block parser runs on every streamed chunk, so most of these assertions
 * are about PARTIAL input. A parser that is only ever tested on complete
 * answers is tested in the state it spends the least of its life in.
 */

const FIGURE = JSON.stringify({
  kind: 'magnitude',
  title: 'Levelized cost',
  takeaway: 'The spread is wider than any average suggests.',
  measure: '¢/kWh',
  data: [
    {
      label: 'Grid',
      value: 14.2,
      unit: '¢/kWh',
      series: 0,
      basis: { source: 'worked example', kind: 'illustrative' },
    },
  ],
  provenance: { bases: [{ source: 'worked example', kind: 'illustrative' }], unfilled: [] },
});

const fenced = (body: string, tag = VISUAL_FENCE) => `\`\`\`${tag}\n${body}\n\`\`\``;

describe('parseBlocks — complete answers', () => {
  it('returns one prose block for prose', () => {
    const blocks = parseBlocks('Heat rate is 3,412 divided by efficiency.');
    expect(blocks).toEqual([
      { kind: 'prose', text: 'Heat rate is 3,412 divided by efficiency.' },
    ]);
  });

  it('keeps the model’s order: prose, figure, prose', () => {
    const blocks = parseBlocks(`Before.\n\n${fenced(FIGURE)}\n\nAfter.`);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'visual', 'prose']);
    expect(blocks[0]).toMatchObject({ text: 'Before.' });
    expect(blocks[2]).toMatchObject({ text: 'After.' });
  });

  it('validates the figure rather than passing it through', () => {
    const blocks = parseBlocks(fenced(FIGURE));
    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    if (b.kind !== 'visual') throw new Error('expected a visual block');
    expect(b.visual.kind).toBe('magnitude');
    expect(b.problems).toEqual([]);
  });

  it('renders an unsupported shape as unrenderable rather than dropping it', () => {
    const blocks = parseBlocks(fenced(JSON.stringify({ kind: 'sankey', title: 'Flow' })));
    const b = blocks[0];
    if (b.kind !== 'visual') throw new Error('expected a visual block');
    expect(b.visual.kind).toBe('unrenderable');
    if (b.visual.kind !== 'unrenderable') throw new Error('narrowing');
    expect(b.visual.wanted).toBe('sankey');
  });

  it('reports the validator’s corrections instead of applying them silently', () => {
    const noTakeaway = JSON.parse(FIGURE) as Record<string, unknown>;
    delete noTakeaway.takeaway;
    const blocks = parseBlocks(fenced(JSON.stringify(noTakeaway)));
    const b = blocks[0];
    if (b.kind !== 'visual') throw new Error('expected a visual block');
    expect(b.problems.join(' ')).toMatch(/takeaway/);
  });

  it('handles two figures in one answer', () => {
    const blocks = parseBlocks(`One.\n\n${fenced(FIGURE)}\n\nTwo.\n\n${fenced(FIGURE)}\n\nEnd.`);
    expect(blocks.map((b) => b.kind)).toEqual([
      'prose', 'visual', 'prose', 'visual', 'prose',
    ]);
  });
});

describe('parseBlocks — mid-stream', () => {
  it('does not render a half-written fence as prose', () => {
    const partial = `Here is the split.\n\n\`\`\`${VISUAL_FENCE}\n{"kind": "magn`;
    const blocks = parseBlocks(partial);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'arriving']);
    // The thing that must never happen: the JSON reaching the reader as text.
    for (const b of blocks) {
      if (b.kind === 'prose') expect(b.text).not.toContain('"kind"');
    }
  });

  it('an open fence with nothing after it is still `arriving`', () => {
    const blocks = parseBlocks(`Text.\n\n\`\`\`${VISUAL_FENCE}\n`);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'arriving']);
  });

  it('never emits `malformed` before the fence closes', () => {
    // The distinction the `arriving` kind exists for: unparseable-so-far is
    // not the same as broken, and only the closing fence can tell them apart.
    const growing = `\`\`\`${VISUAL_FENCE}\n${FIGURE}`;
    for (let n = 1; n <= growing.length; n += 7) {
      for (const b of parseBlocks(growing.slice(0, n))) {
        expect(b.kind).not.toBe('malformed');
      }
    }
  });

  it('converges on the same blocks however it was chunked', () => {
    const whole = `Intro.\n\n${fenced(FIGURE)}\n\nOutro.`;
    const final = JSON.stringify(parseBlocks(whole));
    for (const step of [1, 3, 17, 64]) {
      let acc = '';
      let last = '';
      for (let i = 0; i < whole.length; i += step) {
        acc += whole.slice(i, i + step);
        last = JSON.stringify(parseBlocks(acc));
      }
      expect(last).toBe(final);
    }
  });
});

describe('parseBlocks — the failures that must stay visible', () => {
  it('a closed fence over broken JSON becomes malformed, not silence', () => {
    const blocks = parseBlocks(fenced('{"kind": "magnitude", oops}'));
    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    if (b.kind !== 'malformed') throw new Error('expected malformed');
    expect(b.reason).toMatch(/did not parse/);
    // The evidence is kept, or the reason is a claim nobody can check.
    expect(b.raw).toContain('oops');
  });

  it('names a figure emitted in a ```json fence', () => {
    const blocks = parseBlocks(fenced(FIGURE, 'json'));
    const b = blocks[0];
    if (b.kind !== 'malformed') throw new Error('expected malformed');
    expect(b.reason).toContain(VISUAL_FENCE);
    expect(b.reason).toContain('json');
  });

  it('leaves an ordinary code fence alone', () => {
    const blocks = parseBlocks(fenced('select 1;', 'sql'));
    expect(blocks.map((b) => b.kind)).toEqual(['prose']);
    const b = blocks[0];
    if (b.kind !== 'prose') throw new Error('expected prose');
    expect(b.text).toContain('select 1;');
    expect(b.text).toContain('```sql');
  });

  it('a JSON code sample without a `kind` is a code sample', () => {
    const blocks = parseBlocks(fenced('{"a": 1}', 'json'));
    expect(blocks.map((b) => b.kind)).toEqual(['prose']);
  });
});

describe('a resumed practice exchange comes back through this parser', () => {
  /**
   * ⚠️ FOUND BY READING WHAT THE SURFACE ACTUALLY PRODUCES, NOT BY A TEST.
   * Practice writes its turns to the same session store as everything else, and
   * the resume list replays them into the answer pane. The
   * `powerdeal-practice` fence was an unrecognised tag, so it fell through to
   * the ordinary-code-fence branch and put the raw JSON tail on screen as a
   * code block — the exact "arrives as its own source code" defect this parser
   * was written to stop, reappearing one route over.
   */
  const TAIL =
    '```' + PRACTICE_FENCE + '\n' +
    '{"tookAway":"They heard cost.","stillOpen":["The steam load is still open."]}\n' +
    '```';

  it('renders the tail as observations, never as raw JSON', () => {
    const blocks = parseBlocks(`The budget is frozen.\n\n${TAIL}`);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'observations']);
    const b = blocks[1];
    if (b.kind !== 'observations') throw new Error('expected observations');
    expect(b.tookAway).toBe('They heard cost.');
    expect(b.stillOpen).toEqual(['The steam load is still open.']);
    // The failure this replaces: the JSON reaching the reader as text.
    for (const p of blocks) {
      if (p.kind === 'prose') expect(p.text).not.toContain('tookAway');
    }
  });

  it('carries the guardrail with it, so a grade is visible on the way back too', () => {
    const graded =
      '```' + PRACTICE_FENCE + '\n' +
      '{"tookAway":"That was a strong answer.","stillOpen":["You missed permitting."]}\n' +
      '```';
    const b = parseBlocks(`Fine.\n\n${graded}`)[1];
    if (b.kind !== 'observations') throw new Error('expected observations');
    expect(b.findings.map((f) => f.rule).sort()).toEqual(['miss', 'verdict']);
  });

  it('a broken tail is reported rather than shown as a code block', () => {
    const b = parseBlocks('Fine.\n\n```' + PRACTICE_FENCE + '\n{oops}\n```')[1];
    if (b.kind !== 'malformed') throw new Error('expected malformed');
    expect(b.reason).toMatch(/did not parse/);
  });
});

describe('the instruction and the parser cannot disagree', () => {
  it('names the tag the parser accepts', () => {
    expect(blockFormatInstruction()).toContain(`\`\`\`${VISUAL_FENCE}`);
  });

  it('a fence built from the instruction’s own tag parses as a figure', () => {
    // Rule 4 on the pair: if the instruction ever names a tag the parser does
    // not take, this is the assertion that says so.
    const tag = /```([a-z0-9-]+)/.exec(blockFormatInstruction())?.[1];
    expect(tag).toBeTruthy();
    expect(parseBlocks(fenced(FIGURE, tag!))[0].kind).toBe('visual');
  });

  it('warns against collecting figures at the end', () => {
    expect(blockFormatInstruction().toLowerCase()).toContain('not collected at the');
  });
});

describe('hasStructure', () => {
  it('is false for prose only', () => {
    expect(hasStructure(parseBlocks('Just words.'))).toBe(false);
  });
  it('is true once a figure lands', () => {
    expect(hasStructure(parseBlocks(fenced(FIGURE)))).toBe(true);
  });
});
