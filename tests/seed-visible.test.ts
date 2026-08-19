import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { SEED_DEALS, SEED_PREFIX } from '@/lib/seed-data';
import { isInPipeline, normalizeCompanyName } from '@/lib/engine/entities';

/**
 * ═══════════════════════════════════════════════════════════════
 * NO SCREENSHOT OF SEED DATA MAY EVER BE AMBIGUOUS AGAIN.
 * ═══════════════════════════════════════════════════════════════
 *
 * A screenshot taken during this build showed BAE with a champion recorded and
 * health 2.8. The live book has BAE at health 4 with no champion. Nothing in
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

describe('no seed row carries a name from the real book', () => {
  it('no champion is shared with supabase/seed.sql', async () => {
    /*
      ⚠️ ASSERTED AGAINST THE LIVE SEED FILE RATHER THAN AGAINST A HARDCODED
      NAME, for the obvious reason: writing the real champion's name into a
      test to check it is absent would put it straight back into the repo.

      supabase/seed.sql holds the operator's actual book and is deliberately
      NOT modified. It is the reference for what must not be duplicated here.

      ⚠️ SCOPED TO `champion`, AND THE NARROWING IS A FINDING, NOT A
      CONVENIENCE. The first version of this check also covered `next_move` and
      `key_risk`, and it failed immediately: all forty-two of those strings are
      the operator's real BD notes, verbatim — "HGB non-attainment permitting
      angle; map Gulf Coast vinyls plants", "They are building gas power
      themselves — buyer, partner, or neither?".

      That is the same class as the champion's name and a larger quantity of
      it, and it is the substantive reason a screenshot of seed data read as
      real: the strategy in the cells was real. It is NOT changed here, because
      rewriting forty-two strategy notes is a decision about what the fallback
      dataset is for — it makes the demo behave like the book — and that is the
      operator's call, not a change to make quietly inside a task about
      prefixes. Raised in the reply instead.

      States, utilities, verticals and stages legitimately overlap and must, or
      the fallback stops exercising the same code paths the live data does.
    */
    const live = await readFile('supabase/seed.sql', 'utf8');
    expect(live.length, 'seed.sql is empty — nothing to compare against').toBeGreaterThan(500);

    const fields = ['champion'] as const;
    let checked = 0;
    for (const deal of SEED_DEALS) {
      for (const field of fields) {
        const value = deal[field];
        if (typeof value !== 'string' || value.trim().length < 8) continue;
        checked += 1;
        expect(
          live.includes(value),
          `${deal.deal_id}.${field} is copied verbatim from the live book`,
        ).toBe(false);
      }
    }
    // The loop must have had something to do. One seed deal carries a champion
    // and that is the one this check exists for — if it drops to zero, either
    // the field was emptied or the guard stopped reading it.
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the marker does not break what matches on company names', () => {
  /*
    ⚠️ THIS IS THE REGRESSION THE PREFIX ACTUALLY CAUSED, AND IT WOULD HAVE
    BEEN SILENT. `isInPipeline` compares both directions — the book's name
    inside the news name, and the news name inside the book's.

    With the marker left in the normaliser, "SAMPLE — Valero" becomes
    "sample valero" and a headline about "Valero Energy Corp" becomes "valero
    energy". Neither contains the other, so peer radar, trending and the feed's
    account mapping go quiet — in exactly the mode the render check runs in.

    And it would have half-worked: "SAMPLE — BAE Systems" still contains "bae
    systems", so any fixture built from a multi-word company would have kept
    passing. The full suite (1,134 tests) went green with the bug present.
  */

  it('normalising strips the marker', () => {
    expect(normalizeCompanyName(`${SEED_PREFIX}Valero`)).toBe('valero');
    expect(normalizeCompanyName(`${SEED_PREFIX}BAE Systems`)).toBe('bae systems');
    // And leaves an unmarked name alone.
    expect(normalizeCompanyName('Valero Energy Corp')).toBe('valero energy');
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
    // The news says "Valero Energy Corp"; the book says "Valero". This is the
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
