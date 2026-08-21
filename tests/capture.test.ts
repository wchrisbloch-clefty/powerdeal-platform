import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { FACT_FIELDS, FACT_KEYS, fieldFor } from '@/lib/capture/fields';
import { readProposals } from '@/lib/capture/proposal';
import { extractionInstruction } from '@/lib/capture/prompt';

const MIGRATION = 'supabase/migrations/20260821_deal_field_history.sql';

describe('the field registry and the database agree', () => {
  /**
   * ⚠️ THE PAIR THIS BUILD HAS WATCHED FAIL THREE TIMES — tokens against
   * Tailwind, the TS seed against the SQL seed, a design constant against its
   * own fixture. Here the cost is specific: a key in TypeScript that
   * `apply_fact` does not whitelist is a proposal the reader can read, decide
   * on, and confirm — and the confirm raises. The refusal would arrive after
   * the judgement, which is the worst possible moment for it.
   */
  it('every proposable field is writable by apply_fact', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const block = /deal_audited_fields\(\)[\s\S]*?select array\[([\s\S]*?)\]/.exec(sql);
    expect(block, 'deal_audited_fields() was not found in the migration').toBeTruthy();

    const audited = new Set([...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    // Rule 10: an empty set here would make every assertion below vacuous.
    expect(audited.size).toBeGreaterThan(10);

    for (const key of FACT_KEYS) {
      expect(audited.has(key), `${key} is proposable but not in deal_audited_fields()`).toBe(true);
    }
  });

  it('the PATCH route accepts every proposable field too', async () => {
    // A fact confirmable through the bridge but not editable through the deal
    // API would be a field with exactly one write path, which is how
    // `critical_event` ended up unreachable in the first place.
    const src = await readFile('app/api/deals/[id]/route.ts', 'utf8');
    const schema = /const UpdateDeal = z[\s\S]*?\.partial\(\)/.exec(src);
    expect(schema).toBeTruthy();
    for (const key of FACT_KEYS) {
      expect(schema![0], `PATCH does not accept ${key}`).toContain(`${key}:`);
    }
  });

  it('critical_event specifically — the cap nothing could satisfy', async () => {
    const src = await readFile('app/api/deals/[id]/route.ts', 'utf8');
    expect(src).toContain('critical_event:');
    expect(src).toContain('critical_event_date:');
    expect(FACT_KEYS).toContain('critical_event');
  });

  it('every field says what confirming it moves', () => {
    for (const f of FACT_FIELDS) {
      expect(f.moves.length, f.key).toBeGreaterThan(10);
      expect(f.recognise.length, f.key).toBeGreaterThan(15);
    }
  });

  it('keys are unique and resolvable', () => {
    expect(new Set(FACT_KEYS).size).toBe(FACT_KEYS.length);
    for (const k of FACT_KEYS) expect(fieldFor(k)?.key).toBe(k);
    expect(fieldFor('health_score')).toBeNull();
  });
});

describe('a proposal that cannot be checked is refused', () => {
  const ok = {
    field: 'champion',
    value: 'Trevor Reitsma',
    phrase: 'Trevor is the one pushing this internally',
  };

  it('accepts a well-formed proposal', () => {
    const out = readProposals({ proposals: [ok] });
    expect(out.proposals).toEqual([ok]);
    expect(out.refused).toEqual([]);
  });

  it('⚠️ refuses one with no source phrase', () => {
    // The phrase is what makes confirming a check rather than an act of trust.
    const out = readProposals({ proposals: [{ ...ok, phrase: '' }] });
    expect(out.proposals).toEqual([]);
    expect(out.refused[0].reason).toMatch(/where it came from/);
  });

  it('refuses a field this platform cannot write', () => {
    const out = readProposals({ proposals: [{ ...ok, field: 'health_score' }] });
    expect(out.proposals).toEqual([]);
    expect(out.refused[0].reason).toMatch(/not a fact field/);
  });

  it('refuses a non-number for a numeric column', () => {
    // The cast happens in apply_fact and RAISES. Refusing here makes it
    // information; refusing there makes it a 500 after the reader decided.
    const out = readProposals({
      proposals: [{ field: 'size_mw', value: 'about 100', phrase: 'roughly a hundred megawatts' }],
    });
    expect(out.proposals).toEqual([]);
    expect(out.refused[0].reason).toMatch(/not a number/);
  });

  it('refuses a vague deadline for a date column', () => {
    const out = readProposals({
      proposals: [{ field: 'critical_event_date', value: 'next Q1', phrase: 'sometime next Q1' }],
    });
    expect(out.proposals).toEqual([]);
    expect(out.refused[0].reason).toMatch(/not an ISO date/);
  });

  it('refuses a non-boolean for a boolean column', () => {
    const out = readProposals({
      proposals: [{ field: 'multi_threaded', value: 'yes', phrase: 'we have two contacts' }],
    });
    expect(out.proposals).toEqual([]);
    expect(out.refused[0].reason).toMatch(/not true or false/);
  });

  it('offers only the first proposal for a field, and says it dropped the second', () => {
    const out = readProposals({
      proposals: [ok, { ...ok, value: 'Someone Else', phrase: 'someone else too' }],
    });
    expect(out.proposals).toHaveLength(1);
    expect(out.refused[0].reason).toMatch(/second proposal/);
  });

  it('an empty list is a valid answer, not an error', () => {
    // "The model read nothing mappable" is a common and correct outcome.
    expect(readProposals({ proposals: [] })).toEqual({ proposals: [], refused: [] });
    expect(readProposals({})).toEqual({ proposals: [], refused: [] });
    expect(readProposals(null)).toEqual({ proposals: [], refused: [] });
    expect(readProposals('nonsense')).toEqual({ proposals: [], refused: [] });
  });

  it('never throws on malformed input', () => {
    for (const bad of [
      { proposals: [null] },
      { proposals: ['string'] },
      { proposals: [{ field: 123 }] },
      { proposals: [{}] },
    ]) {
      expect(() => readProposals(bad)).not.toThrow();
      expect(readProposals(bad).proposals).toEqual([]);
    }
  });
});

describe('the instruction is about restraint', () => {
  const text = extractionInstruction();

  it('names every field the validator accepts', () => {
    for (const k of FACT_KEYS) expect(text, `instruction omits ${k}`).toContain(k);
  });

  it('makes the phrase requirement the safeguard, in those words', () => {
    expect(text).toContain('IF YOU CANNOT QUOTE IT, DO NOT PROPOSE IT');
    expect(text.toLowerCase()).toContain('verbatim');
  });

  it('names the four things that are not what they look like', () => {
    const t = text.toLowerCase();
    expect(t).toContain('a name mentioned is not a champion');
    expect(t).toContain('is not an economic buyer');
    expect(t).toContain('is not multi-threaded');
    expect(t).toContain('is not a critical event');
  });

  it('says that proposing nothing is correct', () => {
    expect(text).toContain('PROPOSING NOTHING IS A CORRECT ANSWER');
  });

  it('shows no example VALUES — only how to recognise a field', () => {
    /**
     * ⚠️ AN EXAMPLE IS THE STRONGEST INSTRUCTION THERE IS, which is why the
     * visual prompt never shows a hex. A sample champion name here would make
     * the model likelier to produce a name shaped like it, from a sentence
     * that does not contain one.
     */
    expect(text).not.toMatch(/e\.g\.\s+[A-Z][a-z]+ [A-Z][a-z]+/);
  });
});

describe('nothing in the capture layer can write a deal', () => {
  it('the proposal module has no database client', async () => {
    /**
     * ⚠️ IMPORTS, NOT PROSE. The first version scanned the raw file for
     * /supabase/i and failed on fields.ts — on the strength of a COMMENT naming
     * supabase/schema.sql as the source of the `moves` strings. Second time
     * this exact mistake has been made in this repo's tests; a check that reads
     * documentation as code reports on the documentation.
     */
    for (const f of ['lib/capture/proposal.ts', 'lib/capture/fields.ts', 'lib/capture/prompt.ts']) {
      const src = await readFile(f, 'utf8');
      const imports = [...src.matchAll(/^import[\s\S]*?from '([^']+)';/gm)].map((m) => m[1]);
      for (const i of imports) {
        expect(i, `${f} imports ${i}`).not.toMatch(/supabase|admin|data/);
      }
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${f} references a client`).not.toMatch(/getAdminClient|createClient/);
    }
  });

  it('the capture route writes the signal and never a deal', async () => {
    const src = await readFile('app/api/capture/fact/route.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("from('intelligence_log')");
    // The separation is structural: there is no path from proposing to writing.
    expect(code, 'the capture route touches deals').not.toMatch(/from\('deals'\)|apply_fact/);
  });

  it('the confirm route goes through apply_fact, not a plain update', async () => {
    const src = await readFile('app/api/capture/confirm/route.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("rpc('apply_fact'");
    // A plain update could not stamp the signal, and the whole point of the
    // signal-first ordering is that the fact knows where it came from.
    expect(code).not.toMatch(/from\('deals'\)\s*\.\s*update/);
    // supabase-js resolves with { error }. Without this the surface would
    // report a refused write as confirmed.
    expect(code).toContain('if (error)');
  });

  it('the surface never applies without a press, and has no confirm-all', async () => {
    const src = await readFile('components/modules/fact-log.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/confirmAll|applyAll|autoApply/i);
    // Confirmation is only ever reached from a click handler.
    expect(code).toMatch(/onClick=\{onConfirm\}/);
    // useEffect anywhere here would be a path to applying without a press.
    expect(code).not.toContain('useEffect');
  });

  it('the surface renders the source phrase for every proposal', async () => {
    const src = await readFile('components/modules/fact-log.tsx', 'utf8');
    expect(src).toContain('{proposal.phrase}');
  });
});

describe('non-gating', () => {
  it('an account is not required to log', async () => {
    const src = await readFile('components/modules/fact-log.tsx', 'utf8');
    expect(src).toContain('No account — log it anyway');
    // The send button is gated on text only, never on a deal being chosen.
    expect(src).toMatch(/disabled=\{!text\.trim\(\) \|\| sending\}/);
  });

  it('the capture route defaults deal_ids to empty rather than requiring one', async () => {
    const src = await readFile('app/api/capture/fact/route.ts', 'utf8');
    expect(src).toMatch(/deal_ids:[\s\S]{0,80}\.default\(\[\]\)/);
  });

  it('an unconfigured model returns the saved signal, not a refusal', async () => {
    const src = await readFile('app/api/capture/fact/route.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Only two failure exits: unauthenticated, and the signal write itself.
    const statuses = [...code.matchAll(/status:\s*(\d{3})/g)].map((m) => m[1]);
    expect(new Set(statuses)).toEqual(new Set(['401', '400', '500', '201']));
    expect(code).not.toContain('501');
  });
});
