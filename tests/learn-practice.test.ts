import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inspect, inspectResponse } from '@/lib/learn/practice/guardrail';
import { parsePractice, PRACTICE_FENCE } from '@/lib/learn/practice/response';
import { SCENARIOS, scenarioById, scenarioSources } from '@/lib/learn/practice/scenarios';
import { resolveScenarios } from '@/lib/learn/practice/scenarios-resolve';
import { buyerInstruction } from '@/lib/learn/practice/prompt';

/**
 * ⚠️ THE GUARDRAIL IS TESTED IN BOTH DIRECTIONS, AND THE SECOND DIRECTION IS
 * THE ONE THAT MATTERS. A matcher that only ever sees the phrases it was built
 * from will fire on ordinary buyer speech — "that is a fair amount of capex" —
 * and a guardrail that cries wolf on a normal reply gets switched off inside a
 * week. Every rule below has a case it must catch and a case it must not.
 */

const rules = (fs: { rule: string }[]) => fs.map((f) => f.rule).sort();

describe('assent — a buyer who agrees should agree by moving', () => {
  it('catches praise as an opener', () => {
    for (const opener of [
      "That's fair. But my board still has to sign it.",
      'Good point — though the capital is still frozen.',
      'Fair enough. What about the steam load?',
      'Well put. Now tell me about the outage window.',
      "You're right about the permitting.",
    ]) {
      expect(rules(inspect(opener, 'reply', true)), opener).toContain('assent');
    }
  });

  it('does NOT fire on ordinary buyer speech containing the same words', () => {
    for (const ordinary of [
      'That is a fair amount of capex for something with no track record here.',
      'I need a fair comparison against what the cogen already gives me.',
      // ⚠️ THIS ONE CAUGHT A REAL FALSE POSITIVE. Bare `nice` in the opener
      // list flagged a buyer being curt — the opposite of praise.
      'Nice of you to come out, but the budget is the budget.',
      'Exactly the problem I have with the whole idea.',
      'Understood the pitch. Now the number.',
      'The point I keep coming back to is the steam.',
    ]) {
      expect(rules(inspect(ordinary, 'reply', true)), ordinary).not.toContain('assent');
    }
  });

  it('but a single word that IS the reaction still counts', () => {
    for (const opener of ['Nice. Now the number.', 'Exactly. So what changes?', 'Agreed.']) {
      expect(rules(inspect(opener, 'reply', true)), opener).toContain('assent');
    }
  });

  it('only fires as an OPENER — the position is what makes it a grade', () => {
    const mid = "The permitting math is the part I cannot argue with. That's fair.";
    expect(rules(inspect(mid, 'reply', true))).not.toContain('assent');
  });

  it('and not at all outside the buyer’s reply', () => {
    expect(rules(inspect("That's fair.", 'what they took away', false))).not.toContain('assent');
  });
});

describe('verdict — a score with the number removed', () => {
  it('catches a judgement of the answer', () => {
    for (const t of [
      'That was a solid framing of the risk transfer.',
      'Good answer, but I still need the number.',
      'You handled that well.',
      'Well done — now the harder one.',
      'That was strong.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).toContain('verdict');
    }
  });

  it('does not fire on a buyer describing the WORLD as good or strong', () => {
    for (const t of [
      'Our reliability record is strong and I am not risking it.',
      'The gas basis argument is a good deal weaker than you think.',
      'We have a solid relationship with Wärtsilä.',
      'That is a clear operational risk for us.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).not.toContain('verdict');
    }
  });
});

describe('comparison — a mastery curve drawn one point at a time', () => {
  it('catches measuring this attempt against another', () => {
    for (const t of [
      'That was better than last time.',
      "You're getting there.",
      'Sharper than your previous answer.',
      'Last time you led with capex.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).toContain('comparison');
    }
  });

  it('does not fire on a buyer comparing two technologies', () => {
    for (const t of [
      'The recips are cheaper than this by a wide margin.',
      'A turbine gives me better steam than either of them.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).not.toContain('comparison');
    }
  });
});

describe('escalation — difficulty tuned to quality is a score', () => {
  /**
   * The change that reframed this whole surface: "a strong answer gets the next
   * real objection, because you've earned it" — earned is the tell. The model
   * signalling the verdict by choosing what comes next is still a verdict.
   */
  it('catches the scenario announcing it adjusted', () => {
    for (const t of [
      "Now that you've got that, let me push harder.",
      'Since you handled the permitting, I will make this tougher.',
      "Let's go harder.",
      'Ready for a harder one?',
      'Time to step it up.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).toContain('escalation');
    }
  });

  it('does not fire on a buyer simply raising a harder objection', () => {
    // The correlation is fine. Engineering it is not — and a buyer who just
    // asks the brutal question has engineered nothing.
    for (const t of [
      'Then explain what happens to my stranded cogen asset.',
      'What is your answer when my CFO asks about stack replacement in year seven?',
      'That is harder than it sounds, because the steam has to come from somewhere.',
    ]) {
      expect(rules(inspect(t, 'reply')), t).not.toContain('escalation');
    }
  });
});

describe('miss — the same information, one of them a checklist', () => {
  it('catches a miss report in what is still open', () => {
    for (const t of [
      'You missed the stranded-asset question.',
      'Nothing you said touched permitting.',
      "You didn't address the outage window.",
      'You covered 2 of 3 of the objections.',
      'You should have led with the permitting angle.',
    ]) {
      expect(rules(inspect(t, 'still open [1]')), t).toContain('miss');
    }
  });

  it('does not fire on the same point phrased as open', () => {
    // This is the change: identical information, no checklist.
    for (const t of [
      'The stranded-asset question is still open.',
      'Nothing in the exchange settled the outage window.',
      'Permitting has not come up yet.',
      'How the steam load gets covered remains unresolved.',
    ]) {
      expect(rules(inspect(t, 'still open [1]')), t).toEqual([]);
    }
  });
});

describe('every part of the response is actually wired to the guardrail', () => {
  /**
   * ⚠️ A MUTATION SURVIVED HERE AND THIS IS WHY THESE EXIST. Deleting the
   * `stillOpen` arm of `inspectResponse` — so the field a miss report is most
   * likely to survive in went uninspected — left all 31 tests green. Every miss
   * case above calls `inspect()` DIRECTLY, so the rules were proven and the
   * WIRING was not, which is the same shape as a check that only ever saw the
   * passing case.
   *
   * These go through the real path a rendered response takes.
   */
  const withTail = (reply: string, tail: object) =>
    `${reply}\n\n\`\`\`${PRACTICE_FENCE}\n${JSON.stringify(tail)}\n\`\`\``;

  it('a miss report in stillOpen reaches the findings', () => {
    const r = parsePractice(
      withTail('The budget is frozen.', {
        tookAway: 'They answered cost with timing.',
        stillOpen: ['You never touched the stranded-asset question.'],
      }),
    );
    expect(rules(r.findings)).toContain('miss');
    expect(r.findings[0].where).toBe('still open [1]');
  });

  it('and names WHICH entry, when there are several', () => {
    const r = parsePractice(
      withTail('Fine.', {
        tookAway: 'They heard a cost argument.',
        stillOpen: ['The steam load is still open.', 'You missed permitting entirely.'],
      }),
    );
    expect(r.findings.map((f) => f.where)).toContain('still open [2]');
  });

  it('a verdict in tookAway reaches the findings', () => {
    const r = parsePractice(
      withTail('Fine.', { tookAway: 'That was a strong answer on permitting.', stillOpen: [] }),
    );
    expect(rules(r.findings)).toContain('verdict');
    expect(r.findings[0].where).toBe('what they took away');
  });

  it('assent is NOT reported from the observations, only from the reply', () => {
    // Position is the whole discriminator, and it must survive the wiring too.
    const r = parsePractice(
      withTail('The budget is frozen.', { tookAway: "That's fair.", stillOpen: [] }),
    );
    expect(rules(r.findings)).not.toContain('assent');
  });

  it('findings from different parts are all reported, not just the first', () => {
    const r = parsePractice(
      withTail("Good point. Now that you've got that, here is the real one.", {
        tookAway: 'You handled that well.',
        stillOpen: ['You missed the steam load.'],
      }),
    );
    expect(new Set(rules(r.findings))).toEqual(
      new Set(['assent', 'escalation', 'verdict', 'miss']),
    );
  });
});

describe('a clean exchange produces no findings at all', () => {
  it('reads a realistic buyer turn as clean', () => {
    const r = inspectResponse({
      reply:
        'The capital is still frozen and nothing you have said changes that. ' +
        'I have ten minutes. If there is a structure where I am not writing a ' +
        'cheque this year, start there — otherwise we are both wasting an afternoon.',
      tookAway:
        'They heard a technology argument and answered with a budget constraint, which is where they already were.',
      stillOpen: [
        'Whether a PPA removes the capital question entirely is still open.',
        'The steam load has not come up.',
      ],
    });
    expect(r).toEqual([]);
  });
});

describe('the response parser', () => {
  const withTail = (reply: string, tail: object) =>
    `${reply}\n\n\`\`\`${PRACTICE_FENCE}\n${JSON.stringify(tail)}\n\`\`\``;

  it('splits the reply from the observations', () => {
    const r = parsePractice(
      withTail('Budget is frozen.', {
        tookAway: 'They heard cost and answered with timing.',
        stillOpen: ['The steam load is still open.'],
      }),
    );
    expect(r.reply).toBe('Budget is frozen.');
    expect(r.tookAway).toBe('They heard cost and answered with timing.');
    expect(r.stillOpen).toEqual(['The steam load is still open.']);
    expect(r.pending).toBe(false);
    expect(r.malformed).toBeNull();
  });

  it('an unclosed fence is PENDING, not absent', () => {
    // Same distinction as the answer parser: mid-stream the observations have
    // not arrived, which is not the same as a model that declined to make any.
    const r = parsePractice(`Budget is frozen.\n\n\`\`\`${PRACTICE_FENCE}\n{"tookAway": "They`);
    expect(r.pending).toBe(true);
    expect(r.tookAway).toBeNull();
    expect(r.reply).toBe('Budget is frozen.');
    // And the half-written JSON never reaches the reader as the buyer's words.
    expect(r.reply).not.toContain('tookAway');
  });

  it('inspects the reply before the fence has closed', () => {
    // A grade in the buyer's mouth is a finding immediately. Waiting for the
    // tail would mean the worst case renders un-flagged for as long as it takes
    // the rest to stream.
    const r = parsePractice(`That's fair. But the budget is frozen.\n\n\`\`\`${PRACTICE_FENCE}\n{`);
    expect(r.pending).toBe(true);
    expect(rules(r.findings)).toContain('assent');
  });

  it('a fence closing over broken JSON is reported, not swallowed', () => {
    const r = parsePractice(`Fine.\n\n\`\`\`${PRACTICE_FENCE}\n{"tookAway": oops}\n\`\`\``);
    expect(r.malformed).toMatch(/did not parse/);
    expect(r.reply).toBe('Fine.');
  });

  it('a reply with no fence at all is still inspected', () => {
    const r = parsePractice('Good answer. The budget is still frozen.');
    expect(r.pending).toBe(false);
    expect(rules(r.findings)).toContain('verdict');
  });

  it('drops empty entries from stillOpen rather than rendering blanks', () => {
    const r = parsePractice(withTail('Fine.', { tookAway: '  ', stillOpen: ['', '  ', 'Real.'] }));
    expect(r.tookAway).toBeNull();
    expect(r.stillOpen).toEqual(['Real.']);
  });
});

describe('the scenarios are grounded and are not a difficulty ladder', () => {
  it('every scenario names a knowledge file that loads', () => {
    for (const { scenario, available, reason } of resolveScenarios()) {
      expect(available, `${scenario.id} → ${scenario.source}: ${reason ?? ''}`).toBe(true);
    }
  });

  it('ids are unique and resolvable', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(scenarioById(id)?.id).toBe(id);
    expect(scenarioById('not-a-scenario')).toBeNull();
    expect(scenarioSources().length).toBeGreaterThan(0);
  });

  it('no scenario carries a level, order or difficulty', async () => {
    const src = await readFile('lib/learn/practice/scenarios.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of ['difficulty', 'level', 'hard', 'easy', 'beginner', 'advanced', 'order:']) {
      expect(code.toLowerCase(), `scenarios.ts mentions "${banned}"`).not.toContain(banned);
    }
  });

  it('every scenario has a person, a situation and something already said', () => {
    for (const s of SCENARIOS) {
      expect(s.who.length, s.id).toBeGreaterThan(5);
      expect(s.setting.length, s.id).toBeGreaterThan(40);
      expect(s.opener.length, s.id).toBeGreaterThan(40);
    }
  });
});

describe('the buyer instruction says both of the things that are easy to get wrong', () => {
  const text = buyerInstruction(SCENARIOS[0]).toLowerCase();

  it('forbids being a difficulty dial, in those terms', () => {
    expect(text).toContain('you are not a difficulty setting');
    expect(text).toContain('do not get harder because the answer was good');
    // The alternative has to be named, or "do not escalate" reads as "be gentle".
    expect(text).toContain('disengagement');
  });

  it('forbids opening with assent', () => {
    expect(text).toContain("no \"that's fair\"");
    expect(text).toContain('shows it by moving');
  });

  it('asks for what is OPEN rather than what was missed', () => {
    expect(text).toContain('remains open');
    expect(text).toContain('never as something they failed to');
  });

  it('names the fence the parser actually reads', () => {
    expect(buyerInstruction(SCENARIOS[0])).toContain(`\`\`\`${PRACTICE_FENCE}`);
  });
});

describe('nothing on the practice surface keeps score', () => {
  it('the component holds no attempt history', async () => {
    const src = await readFile('components/learn/practice.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const banned of [
      'attempt', 'score', 'streak', 'previous', 'history', 'best', 'localStorage',
    ]) {
      expect(code.toLowerCase(), `practice.tsx mentions "${banned}"`).not.toContain(banned);
    }
  });

  it('the guardrail surfaces findings and never edits the text', async () => {
    const src = await readFile('lib/learn/practice/response.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // A quietly scrubbed grade is indistinguishable from one never written.
    for (const banned of ['.replace(', 'strip', 'sanitiz', 'redact']) {
      expect(code, `response.ts uses ${banned}`).not.toContain(banned);
    }
  });

  it('the panel renders the offending phrase verbatim', async () => {
    const src = await readFile('components/learn/practice.tsx', 'utf8');
    expect(src).toContain('{f.phrase}');
    expect(src).toContain('{f.why}');
  });
});
