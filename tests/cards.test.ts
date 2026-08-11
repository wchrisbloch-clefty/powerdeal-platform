import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/forge/generate';
import {
  assembleCard,
  cardFilename,
  cardTitle,
  cardablePostures,
  negativeHeader,
} from '@/lib/cards';
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
  it('appears with no competitors recorded', () => {
    expect(cardablePostures([]).map((p) => p.label)).toEqual(['Do nothing']);
  });

  it('leads the list when competitors exist', () => {
    const p = cardablePostures([
      competitor({ id: 'c1', competitor: 'The Grid' }),
      competitor({ id: 'c2', competitor: 'Packaged integrator', tier: 'integrator' }),
    ]);
    expect(p[0].label).toBe('Do nothing');
    expect(p).toHaveLength(3);
  });

  it('omits eliminated competitors', () => {
    const p = cardablePostures([competitor({ id: 'c1', competitor: 'Battery', status: 'eliminated' })]);
    expect(p.map((x) => x.label)).not.toContain('Battery');
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
