import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/forge/generate';
import { assembleCard, cardFilename, cardTitle, negativeHeader } from '@/lib/cards';
import { cardControls } from '@/lib/competitor-catalog';
import type { DealCompetitor } from '@/lib/types';

/**
 * COMPETITIVE CARDS.
 *
 * The negative header is the one element that prevents the wrong-meeting
 * failure — a rep carrying the integrator card into a meeting where the real
 * threat is do-nothing, with nothing on the page revealing the mismatch. So it
 * cannot be app-only chrome, and it cannot be model-authored.
 *
 * This is the export/app split INVERTED. That one withheld internal messages
 * from the customer-facing document; this one must reach it.
 */

const BODY = `## The argument as they make it
Their bundled price is lower on the headline.

## What the comparison leaves out
Redundancy overbuild is not in their number.
`;

function competitor(over: Partial<DealCompetitor>): DealCompetitor {
  return {
    id: over.id ?? 'c1',
    deal_id: 'd1',
    competitor: over.competitor ?? 'The Grid',
    tier: over.tier ?? 'tier-1',
    posture: null,
    what_was_said: null,
    what_landed: null,
    status: over.status ?? 'active',
    created_at: '2026-08-10T00:00:00Z',
    updated_at: '2026-08-10T00:00:00Z',
    user_id: null,
    ...over,
  };
}

describe('the negative header is built in code', () => {
  it('names what the card addresses', () => {
    const h = negativeHeader({
      addressing: 'the grid',
      others: ['Wartsila recip'],
      generatedOn: '2026-08-10',
    });
    expect(h).toContain('This card addresses: the grid.');
  });

  it('names every posture it is NOT addressing', () => {
    const h = negativeHeader({
      addressing: 'the grid',
      others: ['Do nothing', 'Wartsila recip', 'Packaged integrator'],
      generatedOn: '2026-08-10',
    });
    expect(h).toContain('Do nothing');
    expect(h).toContain('Wartsila recip');
    expect(h).toContain('Packaged integrator');
    expect(h).toContain('does not transfer');
  });

  it('says so when nothing else is on record, as a gap not a finding', () => {
    // An empty competitor set is more likely an unlogged one than a real
    // monopoly, and a header that stayed silent would imply the opposite.
    const h = negativeHeader({ addressing: 'the grid', others: [], generatedOn: '2026-08-10' });
    expect(h).toContain('gap in the record');
    expect(h).toContain('arguing against the wrong opponent');
  });

  it('carries the generation date', () => {
    const h = negativeHeader({ addressing: 'x', others: [], generatedOn: '2026-08-10' });
    expect(h).toContain('2026-08-10');
  });

  it('is prepended to the body, not merged into it', () => {
    const card = assembleCard({
      addressing: 'the grid',
      others: ['Do nothing'],
      body: BODY,
      generatedOn: '2026-08-10',
    });
    expect(card.indexOf('This card addresses')).toBeLessThan(card.indexOf('The argument as they make it'));
  });

  it('survives even if the model returns an empty body', () => {
    // The header cannot depend on generation succeeding.
    const card = assembleCard({ addressing: 'the grid', others: [], body: '', generatedOn: '2026-08-10' });
    expect(card).toContain('This card addresses: the grid.');
  });
});

describe('the negative header survives export — the inverted split', () => {
  it('reaches the generated DOCX', async () => {
    const card = assembleCard({
      addressing: 'the grid',
      others: ['Do nothing', 'Packaged integrator'],
      body: BODY,
      generatedOn: '2026-08-10',
    });
    const buf = await generateDocx('Williams — Pricing defense vs the grid', 'OG-019', card);
    const zip = await JSZip.loadAsync(buf);
    const doc = await zip.file('word/document.xml')!.async('string');
    const text = doc.replace(/<[^>]+>/g, '');

    expect(text).toContain('This card addresses: the grid.');
    expect(text).toContain('Do nothing');
    expect(text).toContain('Packaged integrator');
  });

  it('reaches the DOCX even with no other postures on record', async () => {
    const card = assembleCard({
      addressing: 'the grid',
      others: [],
      body: BODY,
      generatedOn: '2026-08-10',
    });
    const buf = await generateDocx('Williams — Pricing defense', 'OG-019', card);
    const zip = await JSZip.loadAsync(buf);
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    expect(text).toContain('gap in the record');
  });

  it('carries the generation date into the document', async () => {
    const card = assembleCard({ addressing: 'x', others: [], body: BODY, generatedOn: '2026-08-10' });
    const buf = await generateDocx('T', 'S', card);
    const zip = await JSZip.loadAsync(buf);
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    expect(text).toContain('2026-08-10');
  });
});

describe('filenames tell two cards apart without opening them', () => {
  it('carries company, kind, posture and date', () => {
    const f = cardFilename({ company: 'Williams' }, 'pricing-defense', 'The Grid', '2026-08-10');
    expect(f).toBe('williams-pricing-defense-vs-the-grid-2026-08-10.docx');
  });

  it('distinguishes two postures for the same deal on the same day', () => {
    const a = cardFilename({ company: 'Williams' }, 'pricing-defense', 'The Grid', '2026-08-10');
    const b = cardFilename({ company: 'Williams' }, 'pricing-defense', 'Packaged integrator', '2026-08-10');
    expect(a).not.toBe(b);
  });

  it('distinguishes the same posture on two days, newest legible from the name', () => {
    const older = cardFilename({ company: 'Williams' }, 'no-decision', 'Do nothing', '2026-08-01');
    const newer = cardFilename({ company: 'Williams' }, 'no-decision', 'Do nothing', '2026-08-10');
    expect(older).not.toBe(newer);
    // Sorting the folder puts the newer one last.
    expect([newer, older].sort()[1]).toBe(newer);
  });

  it('titles name the posture too', () => {
    expect(cardTitle({ company: 'Williams' }, 'no-decision', 'Do nothing')).toContain('Do nothing');
  });
});

describe('do-nothing is always cardable', () => {
  const deal = { utility: 'CenterPoint' };

  it('appears with no competitors recorded, alongside the default-on grid', () => {
    expect(cardControls(deal, []).map((p) => p.label)).toEqual(['Do nothing', 'CenterPoint']);
  });

  it('leads the list when competitors exist', () => {
    const p = cardControls(deal, [
      competitor({ id: 'c2', competitor: 'Packaged integrator', tier: 'tier-1b' }),
    ]);
    expect(p[0].label).toBe('Do nothing');
    expect(p).toHaveLength(3);
  });

  it('omits eliminated competitors', () => {
    const p = cardControls(deal, [
      competitor({ id: 'c1', competitor: 'Batteries / storage', tier: 'tier-2', status: 'eliminated' }),
    ]);
    expect(p.map((x) => x.label)).not.toContain('Batteries / storage');
  });
});

describe('source tagging is a structural requirement of both prompts', () => {
  it('both card prompts demand a tier on every figure', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('SOURCE TAGGING — MANDATORY');
    for (const tier of ['[VERIFIED]', '[REPORTED]', '[INFERRED]']) {
      expect(src).toContain(tier);
    }
  });

  it('states never-fabricate and tag-every-source as SEPARATE rules', async () => {
    // Two requirements, and neither substitutes for the other. A blank field
    // naming its missing input is fine; an untagged number is not.
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('TWO SEPARATE RULES, BOTH BINDING');
    expect(src).toContain('NEVER FABRICATE');
    expect(src).toContain('TAG EVERY SOURCE');
    expect(src).toContain('If you cannot tag it, you cannot state it');
  });

  it('shows the gap form, so a sparse record produces a discovery checklist', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('not yet quantified');
    expect(src).toContain('discovery checklist');
  });

  it('does not ask the model to write the negative header', async () => {
    // If the prompt requested it, the model could omit it. It is prepended in
    // code precisely so that cannot happen.
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('NOT requested here');
    expect(src).not.toContain('Begin with a line naming what this card addresses');
  });

  it('the no-decision card names an absent critical event rather than hiding it', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('NO critical event on record');
    expect(src).toContain('hiding it would defeat the card');
  });

  it('the pricing defense takes posture as an input, never inferred', async () => {
    const route = await readFile('app/api/ai/route.ts', 'utf8');
    expect(route).toContain('requires a postureKey');
  });
});

describe('the header is emitted before the model, not after it', () => {
  /**
   * The whole point of building the header in code is that it cannot be lost.
   * Appending it after generation would lose it on every failed or interrupted
   * stream — and a half-generated card is exactly the situation where a reader
   * most needs to know which posture they are holding.
   */
  it('the route prefixes the stream rather than post-processing it', async () => {
    const route = await readFile('app/api/ai/route.ts', 'utf8');
    expect(route).toContain('withCardHeader');
    expect(route).toContain('if (header) yield');
    // Prefixed, so it lands in the same buffer the export button reads.
    expect(route).toContain('toSseResponse(withCardHeader(');
  });

  it('resolves the posture against the TOGGLE GRID, not the stored rows', async () => {
    // The grid is on by default and stores no row for the ordinary case, so a
    // lookup restricted to stored rows would refuse the most common card on
    // the majority of the book.
    const route = await readFile('app/api/ai/route.ts', 'utf8');
    expect(route).toContain('presenceGrid(deal, competitors)');
    expect(route).not.toContain('competitors.find((c) => c.id === body.postureKey)');
  });

  it('reads the others from the toggle set, so switching one on changes it', async () => {
    const route = await readFile('app/api/ai/route.ts', 'utf8');
    expect(route).toContain('otherPostureNames(deal, competitors');
  });
});

describe('two rules extracted from the meeting-prep pattern, applied platform-wide', () => {
  /**
   * Both were found in a document that was better than what this build ships.
   * Adopting a pattern is exactly when its rules get left behind, so they are
   * asserted on the artifacts that already exist rather than only on the new
   * one.
   */

  it('every figure carries its source IN THE BODY, on both cards', async () => {
    const src = await readFile('lib/prompts/modules/cards.ts', 'utf8');
    expect(src).toContain('INLINE_SOURCE_RULE');
    const { INLINE_SOURCE_RULE } = await import('@/lib/provenance');
    expect(INLINE_SOURCE_RULE).toContain('not in a footnote');
    // The distinction that makes this more than the existing tier rule.
    expect(INLINE_SOURCE_RULE).toContain('SEPARATE from and ADDITIONAL to the tier tag');
  });

  it('reaches BOTH built prompts, not just the one that was edited', async () => {
    const { buildNoDecisionCardPrompt, buildPricingDefenseCardPrompt } =
      await import('@/lib/prompts/modules');
    const deal = { company: 'X', deal_id: 'X-1' } as never;
    const a = buildNoDecisionCardPrompt({ deal } as never);
    const b = buildPricingDefenseCardPrompt({
      deal,
      posture: { competitor: 'the grid', tier: 'tier-1' },
    } as never);
    for (const [name, built] of [['no-decision', a], ['pricing-defense', b]] as const) {
      expect(built.user, `${name} lost the inline-source rule`).toContain('INLINE SOURCE AND DATE');
      expect(built.user, `${name} lost the return path`).toContain('What this should update');
    }
  });

  it('the return path names Spine fields as the Spine names them', async () => {
    const { RETURN_PATH_RULE } = await import('@/lib/provenance');
    // A reader looking for "the champion field" has to be able to find it.
    for (const field of ['champion', 'economic_buyer', 'critical_event', 'deal_competitors']) {
      expect(RETURN_PATH_RULE).toContain(field);
    }
    // And it names the consequence, not just the field.
    expect(RETURN_PATH_RULE).toContain('health uncaps from 6');
  });

  it('detects an untagged figure and leaves prose alone', async () => {
    const { untagged, untaggedFigures } = await import('@/lib/provenance');
    expect(untagged('Peak load is roughly 116 MW')).toBe(true);
    expect(untagged('Peak load is roughly 116 MW [REPORTED]')).toBe(false);
    expect(untagged('8% increase (CPUC Decision A.25-05-012, Dec 2025)')).toBe(false);
    // Not applicable is not a violation — flagging every sentence would make
    // the warning useless.
    expect(untagged('The buyer has not named a signer.')).toBe(false);
    expect(untaggedFigures('a\n$4.2M saving\nb\n$4.2M saving [VERIFIED]\n')).toEqual([
      '$4.2M saving',
    ]);
  });

  it('a citation without a year does not count — a stale figure is the failure', async () => {
    const { untagged } = await import('@/lib/provenance');
    expect(untagged('8% increase (CPUC decision)')).toBe(true);
  });
});
