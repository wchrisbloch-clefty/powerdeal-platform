import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import {
  detectMode,
  explainDetection,
  instructionFor,
  MODES,
  type LearnMode,
} from '@/lib/learn/modes';
import {
  sessionLabel,
  resumable,
  recallContext,
  newSession,
  appendTurn,
  RECALL_BUDGET_CHARS,
  type LearnSession,
} from '@/lib/learn/session';

/**
 * LEARN — five modes behind one box, no scoring, deal-free.
 *
 * Three constraints are non-negotiable and each is asserted structurally
 * rather than by convention:
 *
 *   1. NO SCORING. Not a percentage, a streak, a level, a mastery rating or a
 *      confidence value. Not now and not later as a nice-to-have.
 *   2. DEAL-FREE. `lib/learn/` imports no Deal, no pipeline type, no data
 *      layer. "We didn't mean to" is not a constraint.
 *   3. NOTHING GATES. A failed session write never withholds an answer.
 */

const session = (over: Partial<LearnSession> = {}): LearnSession => ({
  id: 'a',
  mode: 'explain',
  opener: 'what is 4CP',
  turns: [
    { role: 'user', text: 'what is 4CP', at: '2026-08-15T09:00:00Z' },
    { role: 'assistant', text: 'Four coincident peak…', at: '2026-08-15T09:00:05Z' },
  ],
  created_at: '2026-08-15T09:00:00Z',
  updated_at: '2026-08-15T09:00:05Z',
  user_id: 'u1',
  ...over,
});

describe('one box reads the question — there is no mode picker', () => {
  it('reads each mode from how somebody would actually type it', () => {
    expect(detectMode('what is 4CP and why does it matter').mode).toBe('explain');
    expect(detectMode('quiz me on the four competitive tiers').mode).toBe('drill');
    expect(detectMode('be a sceptical refinery CFO').mode).toBe('roleplay');
    expect(detectMode('SOFC versus a recip engine').mode).toBe('compare');
    expect(detectMode('what did I go through on ERCOT last week').mode).toBe('recall');
  });

  it('every mode in MODES is reachable from its own example', () => {
    // Rule 10 in spirit: an example that does not detect as its own mode is a
    // button that teaches the reader the box is wrong.
    expect(MODES.length).toBe(5);
    for (const m of MODES) {
      expect(detectMode(m.example).mode, `"${m.example}" did not read as ${m.mode}`).toBe(
        m.mode,
      );
    }
  });

  it('reports WHICH SIGNALS matched — a reason, never a score', () => {
    const d = detectMode('quiz me on the tiers');
    expect(d.matched).toContain('quiz me');
    // The reader can check a word against their own sentence. They can only
    // trust a percentage.
    expect(d).not.toHaveProperty('confidence');
    expect(d).not.toHaveProperty('score');
  });

  it('shows the alternatives rather than resolving ambiguity silently', () => {
    // "compare" and "explain" both read here. The box still answers — it never
    // asks a question before answering — and offers the other as one click.
    const d = detectMode('explain the difference between SOFC and a recip engine');
    expect(d.alternatives.length).toBeGreaterThan(0);
    expect([d.mode, ...d.alternatives]).toContain('compare');
    expect([d.mode, ...d.alternatives]).toContain('explain');
  });

  it('the specific modes win ties, and explain is the safe default', () => {
    // Nobody types "quiz me" by accident; "what is" appears inside plenty of
    // roleplay and comparison questions.
    expect(detectMode('what is the best way to quiz me on tiers').mode).toBe('drill');
  });

  it('an unrecognised question DEFAULTS and says that it defaulted', () => {
    const d = detectMode('ERCOT 4CP');
    expect(d.mode).toBe('explain');
    expect(d.defaulted).toBe(true);
    expect(d.matched).toEqual([]);
    // The copy must not imply the box recognised something it did not.
    expect(explainDetection(d)).toContain('nothing in it pointed to another mode');
  });

  it('an empty box does not throw', () => {
    expect(detectMode('').mode).toBe('explain');
    expect(detectMode('   ').defaulted).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectMode('QUIZ ME ON THE TIERS').mode).toBe('drill');
  });

  it('does not fire a signal that is only a substring of another word', () => {
    // "be a" inside "describe a", "vs" inside a word.
    expect(detectMode('describe a refinery load profile').mode).toBe('explain');
  });

  it('the explanation quotes the actual match, so the read is checkable', () => {
    expect(explainDetection(detectMode('roleplay a hostile CFO'))).toMatch(/matched "/);
  });
});

describe('NO SCORING — structurally, not by policy', () => {
  it('the drill instruction forbids a tally in so many words', () => {
    const i = instructionFor('drill');
    expect(i).toContain('NO SCORING');
    expect(i).toContain('no percentage');
    expect(i.toLowerCase()).toContain('a score turns practice into a test');
  });

  it('no mode instruction asks for a rating of any kind', () => {
    const banned = [
      'confidence score', 'mastery', 'proficiency', 'rate your', 'out of 10',
      'skill level', 'knowledge graph', 'streak',
    ];
    for (const mode of MODES.map((m) => m.mode)) {
      const text = instructionFor(mode).toLowerCase();
      for (const term of banned) {
        expect(text, `${mode} mentions "${term}"`).not.toContain(term);
      }
    }
  });

  it('the session record has NOWHERE to put a number', async () => {
    // The guarantee is structural. A field that could hold a score is a field
    // somebody eventually fills.
    const src = await readFile('lib/learn/session.ts', 'utf8');
    const shape = /export interface LearnSession \{[\s\S]*?\n\}/.exec(src)![0];
    expect(shape).not.toMatch(/:\s*number/);
    expect(shape).not.toMatch(/score|level|streak|rating|confidence|mastery/i);
  });

  it('and neither does the table', async () => {
    const sql = await readFile('supabase/migrations/20260815_learn_sessions.sql', 'utf8');
    const create = /create table if not exists learn_sessions \(([\s\S]*?)\n\);/.exec(sql)![1];
    expect(create).not.toMatch(/\b(numeric|integer|int|real|float|smallint|bigint)\b/i);
    expect(create).not.toMatch(/score|level|streak|rating|confidence|mastery/i);
  });

  it('every mode instruction ends by forbidding an invented number', () => {
    // The failure mode of a learning surface is a confident answer that makes
    // up the figure the reader was trying to learn.
    for (const m of MODES) {
      expect(instructionFor(m.mode)).toContain('Never state a rate, price');
    }
  });
});

describe('lib/learn is structurally deal-free', () => {
  it('imports no Deal, no pipeline type and no data layer', async () => {
    // "We didn't mean to" is not a constraint. A learn surface that needed a
    // deal selected first would be unusable in the ninety seconds between
    // meetings that is the only time anyone opens it.
    const files = (await readdir('lib/learn')).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const src = await readFile(`lib/learn/${f}`, 'utf8');
      const imports = [...src.matchAll(/^import[\s\S]*?from '([^']+)';/gm)].map((m) => m[1]);
      for (const i of imports) {
        expect(i, `lib/learn/${f} imports ${i}`).not.toMatch(/lib\/data|lib\/deals|lib\/stage/);
      }
      // Deal-shaped identifiers, not just the module path.
      const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
      expect(code, `lib/learn/${f} references a Deal type`).not.toMatch(
        /\b(Deal|DealStage|MeddpiccResult|Pipeline)\b/,
      );
    }
  });

  it('the page has no deal picker', async () => {
    const src = await readFile('app/app/learn/page.tsx', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/getDeals|dealId|deal_id/);
  });
});

describe('persistence is RESUME-ONLY', () => {
  it('labels a session by its opener, not by a generated title', () => {
    // A title costs a call, arrives late, and would be the only thing here
    // that could be subtly wrong about what the reader actually did.
    expect(sessionLabel({ opener: '  what is  4CP\n ' })).toBe('what is 4CP');
  });

  it('truncates a long opener with an ellipsis', () => {
    const long = 'a'.repeat(200);
    const label = sessionLabel({ opener: long });
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(72);
  });

  it('an empty opener still labels rather than rendering blank', () => {
    expect(sessionLabel({ opener: '   ' })).toBe('Untitled session');
  });

  it('a session with no ANSWER is not offered to resume', () => {
    // It would reopen to nothing.
    const abandoned = session({
      id: 'b',
      turns: [{ role: 'user', text: 'asked', at: '2026-08-15T09:00:00Z' }],
    });
    expect(resumable([abandoned])).toEqual([]);
    expect(resumable([session(), abandoned])).toHaveLength(1);
  });

  it('a session whose answer is whitespace is not resumable either', () => {
    const empty = session({
      turns: [
        { role: 'user', text: 'q', at: 'x' },
        { role: 'assistant', text: '   ', at: 'y' },
      ],
    });
    expect(resumable([empty])).toEqual([]);
  });

  it('newest first', () => {
    const older = session({ id: 'old', updated_at: '2026-08-01T00:00:00Z' });
    const newer = session({ id: 'new', updated_at: '2026-08-15T00:00:00Z' });
    expect(resumable([older, newer]).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('appending a turn moves updated_at and leaves created_at alone', () => {
    const s = newSession('id', 'drill', 'quiz me', '2026-08-15T09:00:00Z', 'u1');
    const after = appendTurn(s, { role: 'assistant', text: 'Q1…', at: '2026-08-15T09:05:00Z' });
    expect(after.created_at).toBe('2026-08-15T09:00:00Z');
    expect(after.updated_at).toBe('2026-08-15T09:05:00Z');
    expect(after.turns).toHaveLength(2);
    // Immutable — the caller's object is not mutated underneath it.
    expect(s.turns).toHaveLength(1);
  });
});

describe('recall never claims a topic was not covered when it simply did not fit', () => {
  it('says plainly when there is genuinely no history', () => {
    // An empty block reads to a model as "no constraint", and the recall
    // instruction tells it to say so — it can only do that if it can tell.
    expect(recallContext([])).toContain('none');
    expect(recallContext([])).toContain('no learn history yet');
  });

  it('includes recent sessions', () => {
    const ctx = recallContext([session({ opener: 'what is 4CP' })]);
    expect(ctx).toContain('what is 4CP');
    expect(ctx).toContain('[explain]');
  });

  it('is budgeted by CHARACTERS, not by session count', () => {
    // Ten short sessions and ten long ones are different amounts of context,
    // and a count-based cap sends ten times the tokens on a heavy week.
    //
    // The first version of this test used forty 600-char sessions and a 1.5×
    // slack, which a cap of "first ten sessions" also satisfied — so the
    // mutation swapping the character budget for a count passed. FEW AND HUGE
    // is the shape that separates them: a count cap of any plausible size
    // takes all of these and blows the budget outright.
    // Turns are individually capped at 400 chars and only the last four are
    // taken, so a session's block tops out around 1,650 characters however big
    // the session is. FOUR FULL TURNS EACH is therefore the shape that
    // separates the two caps: the character budget fits three such sessions,
    // while any count cap of ten takes all eight and sends double the budget.
    const mk = (n: number, size: number, turnCount: number) =>
      Array.from({ length: n }, (_, i) =>
        session({
          id: `s${i}`,
          opener: `topic ${i}`,
          updated_at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
          turns: Array.from({ length: turnCount }, (_, t) => ({
            role: (t % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            text: 'x'.repeat(size),
            at: `2026-08-15T00:00:0${t}Z`,
          })),
        }),
      );

    const heavy = recallContext(mk(8, 500, 4));
    expect(heavy.length).toBeLessThanOrEqual(RECALL_BUDGET_CHARS + 800);
    expect(heavy).toContain('omitted for length');

    // Many small sessions stay under the same budget.
    const manySmall = recallContext(mk(60, 120, 2));
    expect(manySmall.length).toBeLessThanOrEqual(RECALL_BUDGET_CHARS + 800);
  });

  it('SAYS SO when it truncated, rather than truncating silently', () => {
    // A history that stops at four sessions without saying so lets the model
    // state "you have not covered X" about a session that exists.
    const heavy = Array.from({ length: 40 }, (_, i) =>
      session({
        id: `s${i}`,
        updated_at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        turns: [
          { role: 'user', text: 'x'.repeat(400), at: 'a' },
          { role: 'assistant', text: 'y'.repeat(400), at: 'b' },
        ],
      }),
    );
    const ctx = recallContext(heavy);
    expect(ctx).toContain('omitted for length');
    expect(ctx).toContain('Do not claim a topic was never covered');
  });

  it('does NOT add the truncation warning when everything fit', () => {
    // A warning that is always there is a warning nobody reads.
    expect(recallContext([session()])).not.toContain('omitted for length');
  });

  it('abandoned sessions never reach the recall context', () => {
    const abandoned = session({
      id: 'b',
      opener: 'never answered',
      turns: [{ role: 'user', text: 'asked', at: 'x' }],
    });
    expect(recallContext([abandoned])).toContain('no learn history yet');
  });
});

describe('every write inspects the error supabase RESOLVES with', () => {
  it('the store returns a result, so no caller can treat a failure as success', async () => {
    // This is where the app_state bug lived: the returned error was discarded,
    // nothing threw, and the health surface reported six running jobs as
    // "never run" for a day.
    const src = await readFile('lib/learn/store.ts', 'utf8');
    // Every client call destructures `error`, whether it reads or writes.
    const calls = [...src.matchAll(/const \{ (?:data, )?error \} = await client/g)];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // And no call site can treat a failure as success — the result is returned.
    expect(src).toContain('return { ok: false, error: error.message }');
    expect(src).not.toMatch(/await client\n?\s*\.from\([^)]*\)\s*\.upsert\([\s\S]{0,400}?\);\s*\n\s*return \{ ok: true/);
  });

  it('a failed READ never becomes an empty session that overwrites the real one', async () => {
    const src = await readFile('lib/learn/store.ts', 'utf8');
    expect(src).toContain('Could not read the session to append to it');
  });

  it('a failed read is reported as an error, not as an empty list', async () => {
    const src = await readFile('lib/learn/store.ts', 'utf8');
    expect(src).toContain('if (error) return { sessions: [], error: error.message };');
  });
});

describe('nothing gates', () => {
  it('a failed session write does NOT withhold the answer', async () => {
    const src = await readFile('app/api/learn/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    // The write result rides in a meta frame; it never short-circuits.
    expect(code).toContain('writeError');
    expect(code).not.toMatch(/if\s*\(\s*!?\w*[Ww]riteError\s*\)\s*return/);
  });

  it('the panel renders the answer beside the failure, not instead of it', async () => {
    const src = await readFile('components/modules/learn-panel.tsx', 'utf8');
    expect(src).toContain('Answered,');
    expect(src).toContain('not saved');
  });

  it('a failed session READ is distinguished from having no sessions', async () => {
    const src = await readFile('components/modules/learn-panel.tsx', 'utf8');
    expect(src).toContain('not the same as having none');
    expect(src).toContain('The read succeeded and there is nothing here yet');
  });

  it('with no ANTHROPIC_API_KEY it 501s with a REASON rather than degrading', async () => {
    // Learn is a domain task. A cheaper model would teach a subtly wrong
    // version of the doctrine and the reader has no way to tell.
    const src = await readFile('app/api/learn/route.ts', 'utf8');
    expect(src).toContain('status: 501');
    expect(src).toContain('never routed to a cheaper model');
  });

  it('learn is registered as a domain task, so the routing enforces it', async () => {
    const { DOMAIN_TASKS, chainFor } = await import('@/lib/engine/model-routing');
    expect(DOMAIN_TASKS).toContain('learn');
    expect(chainFor('learn')).toEqual(['claude']);
  });
});

describe('the reader’s explicit choice beats the detector', () => {
  it('the route prefers the supplied mode over the detected one', async () => {
    // Clicking "Drill" after seeing the box read it as Explain must not be
    // re-argued by the detector.
    const src = await readFile('app/api/learn/route.ts', 'utf8');
    expect(src).toContain('const mode: LearnMode = body.mode ?? detection.mode;');
  });

  it('a new question clears the override', async () => {
    // An override belongs to the question it was chosen for, not to the box.
    const src = await readFile('components/modules/learn-panel.tsx', 'utf8');
    expect(src).toContain('setOverride(null)');
  });
});

describe('Learn loads no vertical playbook, and that is correct', () => {
  it('passes no vertical to the shelf, because it has no deal to get one from', async () => {
    // v3.1.12: say absent rather than substitute. A rep learning the four-lever
    // diagnostic is not learning it about a refinery unless they asked about
    // one, and picking a vertical for them teaches the doctrine through a lens
    // nobody chose.
    const src = await readFile('app/api/learn/route.ts', 'utf8');
    expect(src).toContain("knowledgeBlocksForSkill('discovery-call-prep')");
    expect(src).toMatch(/loads no vertical playbook/i);
  });

  it('and the shelf it gets says so', async () => {
    const { knowledgeBlocksForSkill } = await import('@/lib/skills/knowledge');
    expect(knowledgeBlocksForSkill('discovery-call-prep')).toContain(
      'NO VERTICAL PLAYBOOK LOADED',
    );
  });
});

describe('the surface is instrumented like every other', () => {
  it('appears in the usage-week surface list', async () => {
    const { KNOWN_SURFACES } = await import('@/lib/surfaces');
    expect(KNOWN_SURFACES.map((s) => s.path)).toContain('/app/learn');
  });
});

describe('mode instructions carry the behaviour that makes each mode worth having', () => {
  const expectations: Record<LearnMode, string[]> = {
    explain: ['one question they should ask a customer'],
    drill: ['ONE question at a time', 'do not answer your own question'],
    roleplay: ['Stay in character', 'Do not go easy'],
    compare: ['the OTHER one is the right answer'],
    recall: ['do not restart the topic', 'Never reconstruct a session that did not happen'],
  };

  it('each one says the thing that stops it degrading into chat', () => {
    for (const [mode, phrases] of Object.entries(expectations) as [LearnMode, string[]][]) {
      for (const phrase of phrases) {
        expect(instructionFor(mode), `${mode} is missing "${phrase}"`).toContain(phrase);
      }
    }
  });

  it('every mode produces a non-trivial instruction — none falls through', () => {
    for (const m of MODES) {
      expect(instructionFor(m.mode).length).toBeGreaterThan(200);
    }
  });
});
