import { describe, expect, it } from 'vitest';
import {
  classifySeedState,
  describeSeedState,
  shouldShowState,
  isTrustworthy,
  type SeedState,
} from '@/lib/seed-state';

/**
 * THREE TIMES IN THIS BUILD, A READ THAT FAILED RENDERED AS A READ THAT FOUND
 * NOTHING.
 *
 * `agents:runs` could not be written and six live jobs showed "never run".
 * The sweep's cache lookup discarded its error and treated every item as new.
 * `feed_items` had no `url_hash`, every store failed, and the feed said "no
 * items yet" for the entire life of the feature.
 *
 * Always the same direction, and always the benign-looking one.
 */

describe('a failed read is never an empty result', () => {
  it('an error classifies as unreadable even when rows is an empty array', () => {
    // The exact shape supabase-js produces. `rows.length === 0` is TRUE here
    // and means nothing.
    const state = classifySeedState({ rows: [], error: { message: 'permission denied' } });
    expect(state.kind).toBe('unreadable');
  });

  it('an error wins over rows that are actually present', () => {
    const state = classifySeedState({ rows: [1, 2, 3], error: { message: 'timeout' } });
    expect(state.kind).toBe('unreadable');
  });

  it('a bare string error is accepted, because not every caller wraps it', () => {
    const state = classifySeedState({ rows: null, error: 'connection refused' });
    expect(state).toEqual({ kind: 'unreadable', reason: 'connection refused' });
  });

  it('an error with no message still reports as unreadable, not as blank', () => {
    const state = classifySeedState({ rows: null, error: { message: '' } });
    expect(state.kind).toBe('unreadable');
    expect(state.kind === 'unreadable' && state.reason).toContain('without a message');
  });

  it('null rows with NO error is still unreadable — that combination is a client fault', () => {
    const state = classifySeedState({ rows: null, error: null });
    expect(state.kind).toBe('unreadable');
  });

  it('undefined rows is treated the same as null', () => {
    expect(classifySeedState({ rows: undefined, error: undefined }).kind).toBe('unreadable');
  });
});

describe('a genuine empty is reported as a genuine empty', () => {
  it('empty rows with no error is empty, not unreadable', () => {
    expect(classifySeedState({ rows: [], error: null })).toEqual({ kind: 'empty' });
  });

  it('and the surface is entitled to say so — an empty read is trustworthy', () => {
    expect(isTrustworthy({ kind: 'empty' })).toBe(true);
    expect(isTrustworthy({ kind: 'unreadable', reason: 'x' })).toBe(false);
  });
});

describe('seeded content is not the operator’s content', () => {
  it('all-seed rows classify as seeded, not populated', () => {
    const state = classifySeedState({
      rows: [{ seed: true }, { seed: true }],
      error: null,
      isSeed: (r) => r.seed,
    });
    expect(state).toEqual({ kind: 'seeded', count: 2 });
  });

  it('a mix is populated and COUNTS the seeded rows rather than hiding them', () => {
    const state = classifySeedState({
      rows: [{ seed: true }, { seed: false }, { seed: false }],
      error: null,
      isSeed: (r) => r.seed,
    });
    expect(state).toEqual({ kind: 'populated', count: 3, seeded: 1 });
  });

  it('with no isSeed predicate nothing is claimed to be seeded', () => {
    // Guessing that a row is demonstration material is a claim, and this
    // module does not have the information to make it.
    expect(classifySeedState({ rows: [{}, {}], error: null })).toEqual({
      kind: 'populated',
      count: 2,
      seeded: 0,
    });
  });
});

describe('the copy says which state it is in', () => {
  it('an unreadable surface explicitly denies that it means "none"', () => {
    const copy = describeSeedState({ kind: 'unreadable', reason: 'permission denied' }, 'swept items');
    expect(copy.title).toContain('Could not read');
    expect(copy.body).toContain('not the same as having none');
    expect(copy.body).toContain('permission denied');
    expect(copy.tone).toBe('alert');
  });

  it('an unreadable surface never says "No"', () => {
    // The single most important assertion in this file: the failure mode is
    // the friendly empty-state sentence appearing on a broken read.
    const copy = describeSeedState({ kind: 'unreadable', reason: 'x' }, 'deals');
    expect(copy.title).not.toMatch(/^No /);
  });

  it('a genuine empty says the read SUCCEEDED', () => {
    const copy = describeSeedState({ kind: 'empty' }, 'swept items');
    expect(copy.body).toContain('read succeeded');
    expect(copy.tone).toBe('quiet');
  });

  it('seeded content is labelled as demonstration material', () => {
    const copy = describeSeedState({ kind: 'seeded', count: 4 }, 'deals');
    expect(copy.body).toContain('demonstration');
    expect(copy.body).toContain('None of it describes your pipeline');
    expect(copy.tone).toBe('caution');
  });

  it('a populated surface with seed rows mixed in still names them', () => {
    const copy = describeSeedState({ kind: 'populated', count: 10, seeded: 2 }, 'deals');
    expect(copy.body).toContain('2 of these are seeded');
  });

  it('a fully real surface says so without hedging', () => {
    const copy = describeSeedState({ kind: 'populated', count: 10, seeded: 0 }, 'deals');
    expect(copy.body).toContain('your own data');
    expect(copy.tone).toBe('normal');
  });

  it('the subject is carried into the copy, so one implementation serves every surface', () => {
    expect(describeSeedState({ kind: 'empty' }, 'trending entities').title).toContain(
      'trending entities',
    );
  });

  it('every state produces copy — no branch falls through to undefined', () => {
    const states: SeedState[] = [
      { kind: 'unreadable', reason: 'r' },
      { kind: 'empty' },
      { kind: 'seeded', count: 1 },
      { kind: 'populated', count: 1, seeded: 0 },
    ];
    for (const s of states) {
      const copy = describeSeedState(s, 'things');
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });
});

describe('the state changes the sentence, never the availability', () => {
  it('content is replaced by state copy ONLY when there is nothing to show', () => {
    expect(shouldShowState({ kind: 'unreadable', reason: 'x' })).toBe(true);
    expect(shouldShowState({ kind: 'empty' })).toBe(true);
    // Seeded content still RENDERS — it is labelled, not withheld.
    expect(shouldShowState({ kind: 'seeded', count: 3 })).toBe(false);
    expect(shouldShowState({ kind: 'populated', count: 3, seeded: 0 })).toBe(false);
  });
});
