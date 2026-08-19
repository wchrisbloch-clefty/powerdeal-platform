import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { SEED_DEALS, SEED_PREFIX } from '@/lib/seed-data';
import { isInPipeline, normalizeCompanyName } from '@/lib/engine/entities';

/**
 * ═══════════════════════════════════════════════════════════════
 * NO SCREENSHOT OF SEED DATA MAY EVER BE AMBIGUOUS AGAIN.
 * ═══════════════════════════════════════════════════════════════
 *
 * A screenshot taken during this build showed the first defense row with a champion
 * recorded at health 2.8. The live book had that account at health 4 with none. Nothing in
 * the CONTENT distinguished them — same twenty-one companies, same names, one
 * of them carrying a real person's name — so the only tell was the row's uuid,
 * which no screenshot shows.
 *
 * Banners were the previous answer and they are not sufficient. A banner is
 * one element: it can be cropped, scrolled past, or simply absent from a
 * surface nobody wired it into, which is what happened on Pipeline and the
 * deal page for months. A prefix is IN the data, so it survives a crop, a CSV
 * export, a pasted table and a photograph of a monitor.
 */

describe('every seed row announces itself', () => {
  it('there are seed deals to check, and all of them carry the marker', () => {
    // N derived from the array. A twenty-second seed deal joins this check by
    // existing rather than by somebody remembering to add it.
    expect(SEED_DEALS.length).toBeGreaterThan(0);
    for (const deal of SEED_DEALS) {
      expect(deal.company, `${deal.deal_id} is not marked`).toContain(SEED_PREFIX);
      expect(deal.company.startsWith(SEED_PREFIX)).toBe(true);
    }
  });

  it('the marker is unmistakable rather than subtle', () => {
    // A lowercase or single-character marker would be one more thing to squint
    // at. This has to read at a glance in a table cell, in a screenshot, at
    // whatever size somebody pastes it into a deck.
    expect(SEED_PREFIX).toMatch(/^[A-Z]{4,}/);
    expect(SEED_PREFIX.trim().length).toBeGreaterThanOrEqual(6);
  });

  it('the row id still carries its own tell, independently', () => {
    // Two channels, because the prefix is a string somebody could strip while
    // editing and the id is structural.
    for (const deal of SEED_DEALS) {
      expect(deal.id.startsWith('seed-')).toBe(true);
    }
  });
});

describe('the two demo representations do not drift', () => {
  /*
    ⚠️ THIS BLOCK USED TO ASSERT THAT NO CHAMPION WAS SHARED WITH
    supabase/seed.sql, ON THE PREMISE THAT seed.sql HELD THE REAL BOOK. That
    premise is gone: seed.sql is the demo now too, so the two files are SUPPOSED
    to agree and the old check failed for the right reason.

    What replaces it is the drift assertion. One demo dataset has two
    representations — a TypeScript array for the zero-key path and a SQL
    template for the database — and this repo's history is a list of two
    representations of one thing quietly disagreeing. If somebody re-adds a real
    account to one of them, this is what notices.

    The "does any of this match the live pipeline" half cannot live in a unit
    test: to assert a name is absent, the test has to write it down, which puts
    it back in the repo. `scripts/no-real-data.mjs` does that half against git
    history, where the real names can be read at runtime and never committed.
  */
  it('every deal in the TS seed appears in the SQL seed, with the same strings', async () => {
    const sql = await readFile('supabase/seed.sql', 'utf8');
    expect(sql.length).toBeGreaterThan(500);

    for (const deal of SEED_DEALS) {
      expect(sql, `${deal.deal_id} missing from seed.sql`).toContain(`'${deal.deal_id}'`);
      expect(sql, `${deal.deal_id} company differs`).toContain(`'${deal.company}'`);
      for (const field of ['next_move', 'key_risk', 'champion'] as const) {
        const value = deal[field];
        if (typeof value !== 'string') continue;
        expect(
          sql.includes(`'${value.replace(/'/g, "''")}'`),
          `${deal.deal_id}.${field} differs between lib/seed-data.ts and supabase/seed.sql`,
        ).toBe(true);
      }
    }
  });

  it('the SQL seed holds exactly as many rows as the TS seed', async () => {
    const sql = await readFile('supabase/seed.sql', 'utf8');
    const rows = [...sql.matchAll(/^\('[A-Z]{2,4}-\d{3}',/gm)];
    expect(rows).toHaveLength(SEED_DEALS.length);
  });

  it('the SQL seed only ever writes and deletes TEMPLATE rows', async () => {
    /*
      ⚠️ THE REASON REPLACING THIS FILE WAS SAFE AT ALL. It deletes
      `where user_id is null` and inserts with `user_id = null`; the per-user
      copy is ON CONFLICT DO NOTHING. So rewriting the demo cannot touch a real
      deal. Asserted rather than remembered, because the next person to edit
      this file will not have had this conversation.
    */
    const sql = await readFile('supabase/seed.sql', 'utf8');
    expect(sql).toContain('delete from deals where user_id is null;');
    expect(sql).not.toMatch(/delete from deals(?! where user_id is null)/);
    expect(sql).toContain('on conflict (user_id, deal_id) do nothing');
  });
});

describe('the marker does not break what matches on company names', () => {
  /*
    ⚠️ THIS IS THE REGRESSION THE PREFIX ACTUALLY CAUSED, AND IT WOULD HAVE
    BEEN SILENT. `isInPipeline` compares both directions — the book's name
    inside the news name, and the news name inside the book's.

    With the marker left in the normaliser, "SAMPLE — Copperline" becomes
    "sample copperline" and a headline about "Copperline Energy Corp" becomes "copperline
    energy". Neither contains the other, so peer radar, trending and the feed's
    account mapping go quiet — in exactly the mode the render check runs in.

    And it would have half-worked: "SAMPLE — Ironvale Defense Systems" still contains "ironvale
    defense systems", so any fixture built from a multi-word company would have kept
    passing. The full suite (1,134 tests) went green with the bug present.
  */

  it('normalising strips the marker', () => {
    expect(normalizeCompanyName(`${SEED_PREFIX}Copperline`)).toBe('copperline');
    expect(normalizeCompanyName(`${SEED_PREFIX}Ironvale Defense Systems`)).toBe('ironvale defense systems');
    // And leaves an unmarked name alone.
    expect(normalizeCompanyName('Copperline Energy Corp')).toBe('copperline energy');
  });

  it('every seed company is still findable by its real name', () => {
    for (const deal of SEED_DEALS) {
      const real = deal.company.slice(SEED_PREFIX.length);
      expect(
        isInPipeline(real, SEED_DEALS),
        `"${real}" no longer matches its own seed row`,
      ).toBe(true);
    }
  });

  it('and by a longer form of it, which is the direction that broke', () => {
    // The news says "Copperline Energy Corp"; the book says "Copperline". This is the
    // comparison that fails when the marker survives normalisation.
    for (const deal of SEED_DEALS) {
      const real = deal.company.slice(SEED_PREFIX.length);
      // Only meaningful for short names — a long one contains the news form.
      if (real.split(/\s+/).length > 2) continue;
      expect(
        isInPipeline(`${real} Energy Corporation`, SEED_DEALS),
        `"${real} Energy Corporation" no longer matches "${real}"`,
      ).toBe(true);
    }
  });

  it('a company genuinely absent from the book is still absent', () => {
    // The inverse. A normaliser that stripped too much, or matched on the
    // marker itself, would report everything as already in the pipeline.
    expect(isInPipeline('Nonexistent Widget Holdings', SEED_DEALS)).toBe(false);
    expect(isInPipeline(SEED_PREFIX.trim(), SEED_DEALS)).toBe(false);
  });
});
