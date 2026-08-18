import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import {
  directionOf, evaluateMove, isTerminal, stageIndex, stageOptions,
} from '@/lib/stage';
import { DEAL_STAGES, TERMINAL_STAGES, type Deal, type DealStage } from '@/lib/types';

/**
 * STAGE MOVEMENT.
 *
 * The field was frozen and four features ran on it. The trap in testing this is
 * asserting only that a move is permitted — "can I advance?" passes on an
 * implementation that permits everything, including the reversals and reopens
 * that have to be flagged rather than silently allowed. So every case asserts
 * the CONSEQUENCES as a set, not just the verdict.
 */

function deal(over: Partial<Deal> = {}): Pick<Deal, 'stage' | 'days_in_stage'> {
  return { stage: over.stage ?? 'Discovery', days_in_stage: over.days_in_stage ?? 42 };
}

const keys = (from: DealStage, to: DealStage, days = 42) =>
  evaluateMove(deal({ stage: from, days_in_stage: days }), to).consequences.map((c) => c.key);

describe('the ladder', () => {
  it('knows every stage in the pipeline', () => {
    for (const s of DEAL_STAGES) expect(stageIndex(s)).toBeGreaterThanOrEqual(0);
  });

  it('reads direction from position, not from a hand-maintained map', () => {
    expect(directionOf('Discovery', 'Negotiation')).toBe('forward');
    expect(directionOf('Negotiation', 'Discovery')).toBe('backward');
    expect(directionOf('Discovery', 'Discovery')).toBe('lateral');
  });

  it('offers the immediate next stage first', () => {
    // Advancing one step is what almost every move is.
    expect(stageOptions('Discovery')[0]).toBe('Solution Design');
    expect(stageOptions('Prospecting')[0]).toBe('Qualified');
  });

  it('still offers every other stage — skipping a stage is a normal deal', () => {
    const opts = stageOptions('Discovery');
    expect(opts).toHaveLength(DEAL_STAGES.length - 1);
    expect(opts).toContain('Contracting');
    expect(opts).not.toContain('Discovery');
  });

  it('offers something from the last stage rather than an empty list', () => {
    const last = DEAL_STAGES[DEAL_STAGES.length - 1];
    expect(stageOptions(last).length).toBeGreaterThan(0);
  });
});

describe('the consequence is stated before the write, not found after it', () => {
  it('always names the days_in_stage reset — the number this exists to fix', () => {
    expect(keys('Discovery', 'Solution Design')).toContain('days-reset');
  });

  it('quotes the actual number of days being reset', () => {
    const v = evaluateMove(deal({ stage: 'Discovery', days_in_stage: 137 }), 'Negotiation');
    expect(v.consequences.find((c) => c.key === 'days-reset')?.text).toContain('137');
  });

  it('says something sensible when the counter is already zero', () => {
    const v = evaluateMove(deal({ days_in_stage: 0 }), 'Negotiation');
    const text = v.consequences.find((c) => c.key === 'days-reset')?.text ?? '';
    expect(text).not.toContain('resets from 0');
    expect(text).toContain('transition row');
  });

  it('marks the reset as information and the risky moves as warnings', () => {
    // The panel renders warn on a danger border and info on a neutral one, so
    // a flattened severity would make every warning read as a note while the
    // text stayed correct — visible only to someone comparing two dialogs.
    const sev = (from: DealStage, to: DealStage, key: string) =>
      evaluateMove(deal({ stage: from }), to).consequences.find((c) => c.key === key)?.severity;
    expect(sev('Discovery', 'Solution Design', 'days-reset')).toBe('info');
    expect(sev('Negotiation', 'Discovery', 'backward')).toBe('warn');
    expect(sev('Archived', 'Discovery', 'reopen')).toBe('warn');
    expect(sev('Negotiation', 'Archived', 'terminal')).toBe('warn');
  });

  it('a plain advance carries the reset and nothing alarming', () => {
    // Asserted as a SET. Checking only that days-reset is present would pass
    // on an implementation that warned about every move.
    expect(keys('Discovery', 'Solution Design')).toEqual(['days-reset']);
  });
});

describe('backward movement is allowed, and legible', () => {
  it('is permitted', () => {
    // A ladder that only went up would force the record to lie about a deal
    // that regressed, which is worse than the regression.
    expect(evaluateMove(deal({ stage: 'Negotiation' }), 'Discovery').allowed).toBe(true);
  });

  it('is flagged rather than silent', () => {
    expect(keys('Negotiation', 'Discovery')).toEqual(['days-reset', 'backward']);
  });

  it('says the history will show it as a reversal', () => {
    const v = evaluateMove(deal({ stage: 'Negotiation' }), 'Discovery');
    expect(v.consequences.find((c) => c.key === 'backward')?.text).toMatch(/reversal/);
  });

  it('does NOT flag a forward move as backward', () => {
    expect(keys('Discovery', 'Negotiation')).not.toContain('backward');
  });
});

describe('closing and reopening', () => {
  it('moving into a terminal stage warns that no outcome is recorded', () => {
    // The whole point of Log outcome is the buyer's verbatim. A stage change
    // that quietly closed a deal would lose it.
    const k = keys('Negotiation', 'Closed-Won');
    expect(k).toContain('terminal');
    const v = evaluateMove(deal({ stage: 'Negotiation' }), 'Closed-Won');
    expect(v.consequences.find((c) => c.key === 'terminal')?.text).toMatch(/Log outcome/);
  });

  it('Archived says so specifically — it collapses three different losses', () => {
    const v = evaluateMove(deal({ stage: 'Negotiation' }), 'Archived');
    expect(v.consequences.find((c) => c.key === 'terminal')?.text).toMatch(/no-decision/);
  });

  it('reopening a closed deal is allowed', () => {
    // Deals do come back.
    expect(evaluateMove(deal({ stage: 'Archived' }), 'Discovery').allowed).toBe(true);
  });

  it('reopening names the win-loss row it leaves behind', () => {
    // log_win_loss() wrote a row on the way in. Nothing retracts it, and
    // nothing else would point that out.
    const v = evaluateMove(deal({ stage: 'Archived' }), 'Discovery');
    expect(v.consequences.map((c) => c.key)).toContain('reopen');
    expect(v.consequences.find((c) => c.key === 'reopen')?.text).toMatch(/not retracted/);
  });

  it('does not call a terminal-to-terminal move a reopen', () => {
    expect(keys('Closed-Won', 'Post-Sale')).not.toContain('reopen');
  });

  it('Post-Sale does NOT follow Closed-Won automatically', async () => {
    // An automatic advance writes a transition nobody decided, and the history
    // has to be a record of decisions rather than of defaults.
    const src = await readFile('lib/stage.ts', 'utf8');
    expect(src).toContain('POST-SALE DOES NOT FOLLOW CLOSED-WON AUTOMATICALLY');
    // And it is offered as an ordinary option, not applied.
    expect(stageOptions('Closed-Won')).toContain('Post-Sale');
  });

  it('every terminal stage is recognised as one', () => {
    for (const s of TERMINAL_STAGES) expect(isTerminal(s)).toBe(true);
    expect(isTerminal('Discovery')).toBe(false);
  });
});

describe('moves that are refused', () => {
  it('refuses a move to the stage the deal is already in', () => {
    const v = evaluateMove(deal({ stage: 'Discovery' }), 'Discovery');
    expect(v.allowed).toBe(false);
    expect(v.blockedReason).toMatch(/Already in Discovery/);
  });

  it('refuses a stage that is not in the pipeline', () => {
    const v = evaluateMove(deal(), 'Renegotiation' as DealStage);
    expect(v.allowed).toBe(false);
    expect(v.blockedReason).toMatch(/not a stage/);
  });

  it('a refused move carries no consequences to render', () => {
    expect(evaluateMove(deal({ stage: 'Discovery' }), 'Discovery').consequences).toEqual([]);
  });
});

describe('the write goes through the trigger, never around it', () => {
  it('the control PATCHes deals.stage and inserts no transition', async () => {
    // deals_stage_transition fires before update, writes the history row and
    // resets days_in_stage. Inserting a transition here would double-write.
    const src = await readFile('components/modules/stage-control.tsx', 'utf8');
    expect(src).toContain("method: 'PATCH'");
    expect(src).toContain('stage: target');
    expect(src).not.toMatch(/stage_transitions/);
  });

  it('the trigger is what resets the counter', async () => {
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toContain('new.days_in_stage := 0;');
    expect(schema).toContain('create trigger deals_stage_transition before update on deals');
  });

  it('the route already accepted a stage — only the caller was missing', async () => {
    const route = await readFile('app/api/deals/[id]/route.ts', 'utf8');
    expect(route).toContain('stage: z.enum(DEAL_STAGES)');
  });
});

describe('the four features that were reading a frozen field', () => {
  it('are named where the rules live, so the reason survives the commit', async () => {
    const src = await readFile('lib/stage.ts', 'utf8');
    for (const feature of ['stage momentum', 'stalled-30', 'isAtRisk', 'days since it was created']) {
      expect(src).toContain(feature);
    }
  });

  it('the backlog item is closed out rather than left describing a fixed thing', async () => {
    const backlog = await readFile('docs/BACKLOG.md', 'utf8');
    const item1 = backlog.slice(
      backlog.indexOf('## 1. '),
      backlog.indexOf('## 2.'),
    );
    expect(item1).toMatch(/\*\*Status:\*\*\s*(shipped|closed|landed)/i);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════
 * `Archived` IS THE LAST ELEMENT OF DEAL_STAGES AND IS NOT THE FURTHEST ALONG.
 * ═══════════════════════════════════════════════════════════════
 *
 * The ladder ends in OUTCOMES, not progress: Closed-Won, Post-Sale, Archived.
 * Any code that reads the array positionally inherits that, and it has already
 * produced two live bugs in two different files — a linear stage weight in the
 * headline ranker that ranked archived accounts above deals in Negotiation, and
 * `directionOf` scoring a loss as forward movement.
 *
 * These assertions are the general form: whatever a module does with an index
 * over DEAL_STAGES, it must first decide what a terminal state means there.
 */
describe('nothing treats a terminal stage as a rung on the ladder', () => {
  it('losing a deal is NOT forward movement', async () => {
    const { directionOf } = await import('@/lib/stage');
    // Archived is index 10. A raw index comparison called this "forward".
    expect(directionOf('Discovery', 'Archived')).toBe('terminal');
    expect(directionOf('Negotiation', 'Archived')).toBe('terminal');
    expect(directionOf('Closed-Won', 'Archived')).toBe('terminal');
  });

  it('reopening is its own direction, not "backward"', async () => {
    const { directionOf } = await import('@/lib/stage');
    expect(directionOf('Archived', 'Discovery')).toBe('reopen');
  });

  it('but the in-flight ladder still reads normally', async () => {
    const { directionOf } = await import('@/lib/stage');
    expect(directionOf('Qualified', 'Discovery')).toBe('forward');
    expect(directionOf('Negotiation', 'Discovery')).toBe('backward');
    expect(directionOf('Discovery', 'Discovery')).toBe('lateral');
    // Post-Sale after Closed-Won IS progress — those two keep their positions.
    expect(directionOf('Closed-Won', 'Post-Sale')).toBe('forward');
  });

  it('Post-Sale does NOT suggest Archived as the next step', async () => {
    // v3.1.11, in so many words: "Never treat `Archived` as something a deal
    // progresses into from `Post-Sale`." It was suggested first, because it is
    // the array element after it.
    const { stageOptions } = await import('@/lib/stage');
    expect(stageOptions('Post-Sale')[0]).not.toBe('Archived');
  });

  it('but Archived stays REACHABLE from every stage — it is not hidden', async () => {
    const { stageOptions } = await import('@/lib/stage');
    const { DEAL_STAGES } = await import('@/lib/types');
    for (const s of DEAL_STAGES) {
      if (s === 'Archived') continue;
      expect(stageOptions(s), `${s} cannot reach Archived`).toContain('Archived');
    }
  });

  it('the headline ranker made the same decision, and did not copy the list', async () => {
    // Two modules, one rule. The ranker derives its in-flight set from
    // DEAL_STAGES rather than keeping a second copy.
    const src = await readFile('lib/engine/headlines.ts', 'utf8');
    expect(src).toContain('IN_FLIGHT_STAGES');
    expect(src).toContain('TERMINAL_STAGES.includes');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    // No hand-written ladder — a copy is a copy that drifts on the first rename.
    expect(code).not.toContain("'Prospecting',");
  });

  it('there is exactly ONE stage ladder in the codebase', async () => {
    // lib/deals.ts carried a second, hand-maintained list of ten stages that
    // omitted Archived and returned 99 for it. Nothing imported it, so it had
    // drifted from DEAL_STAGES unnoticed.
    const deals = await readFile('lib/deals.ts', 'utf8');
    const code = deals.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain("'Economic Proposal', 'Negotiation'");
    expect(code).not.toContain('export function stageIndex');
  });
});

describe('nothing new may read DEAL_STAGES positionally', () => {
  /**
   * ⚠️ FOUR SEPARATE BUGS, ONE ARRAY. `Archived` is the last element of
   * `DEAL_STAGES` and is not the furthest along, and everything that reads the
   * array by position inherits that:
   *
   *   1. `directionOf` scored `Discovery → Archived` as **forward** — losing a
   *      deal counted as advancing it
   *   2. the headline ranker's linear weight put archived accounts above
   *      Negotiation
   *   3. `stageOptions('Post-Sale')` suggested `Archived` as the next rung
   *   4. `STAGE_PRIORITY` — caught by the type system rather than by a bug,
   *      because a `Record<DealStage, …>` cannot be indexed positionally at all
   *
   * The four are fixed. Nothing stops a fifth, so positional access is now an
   * allowlist: two functions in lib/stage.ts, each of which handles the
   * terminal stages BEFORE it compares indices. A new site is a deliberate
   * addition to this list, with the same decision made explicitly.
   */
  const ALLOWED = ['lib/stage.ts'];

  it('only the sanctioned module indexes the array', async () => {
    const files: string[] = [];
    async function walk(dir: string) {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const path = `${dir}/${e.name}`;
        if (e.isDirectory()) await walk(path);
        else if (/\.tsx?$/.test(e.name)) files.push(path);
      }
    }
    await walk('lib');
    await walk('app');
    await walk('components');

    const offenders: string[] = [];
    for (const path of files) {
      if (ALLOWED.some((a) => path.endsWith(a))) continue;
      const src = (await readFile(path, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      if (/DEAL_STAGES\s*\.\s*indexOf|DEAL_STAGES\s*\[/.test(src)) {
        offenders.push(path);
      }
    }
    expect(offenders, 'positional access to DEAL_STAGES outside lib/stage.ts').toEqual([]);
  });

  it('and the sanctioned module decides what terminal means BEFORE comparing', async () => {
    // The allowlist is only safe because of this. `directionOf` returns
    // terminal/reopen for Archived before it ever reads an index.
    const src = await readFile('lib/stage.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function directionOf'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body.indexOf("to === 'Archived'")).toBeLessThan(body.indexOf('stageIndex(from)'));
    expect(body.indexOf("from === 'Archived'")).toBeLessThan(body.indexOf('stageIndex(from)'));
  });

  it('stageOptions never suggests Archived as a next rung', () => {
    // The third bite, asserted directly rather than through the source.
    for (const stage of DEAL_STAGES) {
      expect(stageOptions(stage)[0], `${stage} suggests Archived`).not.toBe('Archived');
    }
  });
});
