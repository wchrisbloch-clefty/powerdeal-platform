import { describe, expect, it, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { generateDocx } from '@/lib/forge/generate';
import {
  DECLARED_COLORS,
  FONT,
  FONT_FALLBACK,
  HEADER_BAND_TWIPS,
  HEADING_STYLE_IDS,
  PALETTE,
  WORDMARK,
  WORD_DEFAULT_COLORS,
} from '@/lib/forge/theme';

/**
 * BRAND ASSERTIONS — measured from the real OOXML, not from the source.
 *
 * Brand drift is the defect class that passes code review because the source
 * looks correct. Every finding these guard against was live in a shipped
 * document and invisible in the code:
 *
 *   · docDefaults read `font: FONT_FALLBACK`, so Calibri was the document
 *     default and Aptos existed only as inline run overrides
 *   · Word's stock blue sat in styles.xml, overridden inline on every heading
 *     we happened to emit — a landmine on an unexercised path
 *   · a first attempt at fixing that produced TWO <w:style w:styleId="Heading1">
 *     blocks, which is malformed and version-dependent
 *   · pure black appeared 50 times as a default argument nobody chose
 *
 * These parse the generated .docx. A test that read the theme constants would
 * pass while the renderer ignored them.
 */

/** Two bodies: one with a table, one without — table-only rules need both. */
const WITH_TABLE = `## Account plan summary

### Objective
Land one compression site.

| Stage | Owner | Exit condition |
|---|---|---|
| Discovery | R. Okafor | Load profile received |
| Design | Joint | Single-line approved |

- A bullet
`;

const WITHOUT_TABLE = `## Executive summary
Williams operates midstream compression.

### Situation
- Announced power-for-datacenter builds
`;

interface Parsed {
  doc: string;
  styles: string;
  header: string;
  names: string[];
}

async function render(markdown: string): Promise<Parsed> {
  const buf = await generateDocx('Williams — Test', 'OG-019 · O&G-Mid · OK', markdown);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const headerName = names.find((n) => /^word\/header\d*\.xml$/.test(n));
  return {
    doc: await zip.file('word/document.xml')!.async('string'),
    styles: await zip.file('word/styles.xml')!.async('string'),
    header: headerName ? await zip.file(headerName)!.async('string') : '',
    names,
  };
}

/** Text colors AND border/attribute colors — green lives in the second form. */
function allColors(xml: string): string[] {
  const text = [...xml.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  const attr = [...xml.matchAll(/w:color="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  const fills = [...xml.matchAll(/w:fill="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  return [...new Set([...text, ...attr, ...fills].map((c) => c.toUpperCase()))];
}

describe.each([
  ['with a table', WITH_TABLE],
  ['without a table', WITHOUT_TABLE],
])('every export path — %s', (_label, markdown) => {
  let out: Parsed;
  beforeAll(async () => {
    out = await render(markdown);
  });

  // ── Type ──
  it('sets the theme font in docDefaults, not the fallback', () => {
    const dd = out.styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)![0];
    expect(dd).toContain(`w:ascii="${FONT}"`);
    expect(dd).not.toContain(`w:ascii="${FONT_FALLBACK}"`);
  });

  // ── Headings ──
  it('uses namespaced heading styles, never Word stock Heading ids', () => {
    for (const id of HEADING_STYLE_IDS) {
      expect(out.styles).toContain(`w:styleId="${id}"`);
    }
    expect(out.doc).not.toMatch(/w:pStyle w:val="Heading\d"/);
  });

  it('defines each heading style exactly once', () => {
    for (const id of HEADING_STYLE_IDS) {
      const blocks = out.styles.match(new RegExp(`w:styleId="${id}"`, 'g')) ?? [];
      expect(blocks).toHaveLength(1);
    }
  });

  it('renders no Word stock color anywhere in the document body', () => {
    for (const c of WORD_DEFAULT_COLORS) {
      expect(out.doc.toUpperCase()).not.toContain(c.toUpperCase());
    }
  });

  // ── Palette ──
  it('uses only declared colors', () => {
    const declared = new Set([...DECLARED_COLORS.map((c) => c.toUpperCase()), 'FFFFFF', 'AUTO']);
    const undeclared = allColors(out.doc).filter((c) => !declared.has(c));
    expect(undeclared).toEqual([]);
  });

  it('never emits pure black', () => {
    expect(allColors(out.doc)).not.toContain('000000');
  });

  // ── Green: present, and only as a mark ──
  it('places Bloom green in the document — accent-only cannot mean absent', () => {
    expect(allColors(out.doc)).toContain(PALETTE.bloom.toUpperCase());
  });

  it('puts green in the header band rule', () => {
    expect(out.header.toUpperCase()).toContain(PALETTE.bloom.toUpperCase());
  });

  it('never uses green as a fill — no light text on green, anywhere', () => {
    const fills = [...`${out.doc}${out.styles}${out.header}`.matchAll(/w:fill="([0-9A-Fa-f]{6})"/g)]
      .map((m) => m[1].toUpperCase());
    expect(fills).not.toContain(PALETTE.bloom.toUpperCase());
  });

  it('never sets green as a text color', () => {
    const textColors = [...out.doc.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) =>
      m[1].toUpperCase(),
    );
    expect(textColors).not.toContain(PALETTE.bloom.toUpperCase());
  });

  // ── Header band ──
  it('carries a header part on every export path', () => {
    expect(out.names.some((n) => /^word\/header\d*\.xml$/.test(n))).toBe(true);
  });

  it('fixes the band height rather than sizing it to content', () => {
    expect(out.header).toMatch(
      new RegExp(`w:val="${HEADER_BAND_TWIPS}"[^>]*w:hRule="exact"|w:hRule="exact"[^>]*w:val="${HEADER_BAND_TWIPS}"`),
    );
  });

  it('fills the band with the PowerDeal wordmark in charcoal', () => {
    expect(out.header).toContain(WORDMARK);
    expect(out.header.toUpperCase()).toContain(PALETTE.charcoal.toUpperCase());
  });

  it('carries no partner trademark or image asset', () => {
    // Deliberate: a Bloom mark on customer-facing documents is a permission
    // question answered outside the codebase. The fixed box means adding one
    // later reflows nothing.
    expect(out.names.filter((n) => n.startsWith('word/media'))).toEqual([]);
    expect(`${out.doc}${out.header}`).not.toMatch(/Bloom/i);
  });
});

describe('table treatment', () => {
  let out: Parsed;
  beforeAll(async () => {
    out = await render(WITH_TABLE);
  });

  it('shades the header row neutral grey, not green', () => {
    expect(out.doc.toUpperCase()).toContain(`W:FILL="${PALETTE.headerFill.toUpperCase()}"`);
  });

  it('puts green on the table top and bottom borders', () => {
    const tbl = out.doc.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];
    expect(tbl.toUpperCase()).toContain(`W:COLOR="${PALETTE.bloom.toUpperCase()}"`);
  });

  it('keeps inside borders neutral', () => {
    const tbl = out.doc.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];
    const inside = tbl.match(/<w:insideH[\s\S]*?\/>/)?.[0] ?? '';
    expect(inside.toUpperCase()).toContain(PALETTE.ruleFaint.toUpperCase());
  });

  it('repeats only the header row across page breaks', () => {
    const flags = [...out.doc.matchAll(/<w:tblHeader([^/>]*)\/>/g)].map((m) => m[1]);
    expect(flags.filter((f) => !f.includes('false'))).toHaveLength(1);
  });
});
