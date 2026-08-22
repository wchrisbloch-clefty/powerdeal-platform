import { describe, expect, it, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { Document, Packer, type Paragraph, type Table } from 'docx';
import { generateDocx, generatePptx } from '@/lib/forge/generate';
import { VALUE_PROPS } from '@/lib/types';
import { untagged } from '@/lib/provenance';
import {
  DECLARED_COLORS,
  FONT,
  FONT_FALLBACK,
  HEADER_BAND_TWIPS,
  HEADING_STYLE_IDS,
  PALETTE,
  WORDMARK,
  SECTION_BAR,
  SECTION_BAR_TWIPS,
  callout,
  sectionBar,
  classificationLine,
  CLASSIFICATION_INTERNAL,
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
  /** Every word/*.xml part, for whole-package checks. */
  parts: Record<string, string>;
}

async function render(markdown: string): Promise<Parsed> {
  const buf = await generateDocx('Williams — Test', 'OG-019 · O&G-Mid · OK', markdown);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const headerName = names.find((n) => /^word\/header\d*\.xml$/.test(n));
  const parts: Record<string, string> = {};
  for (const name of names) {
    if (name.startsWith('word/') && name.endsWith('.xml')) {
      parts[name] = await zip.file(name)!.async('string');
    }
  }

  return {
    doc: parts['word/document.xml'],
    styles: parts['word/styles.xml'],
    header: headerName ? parts[headerName] : '',
    names,
    parts,
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
  it('uses only declared colors — in the body, the styles AND the header', () => {
    // All three parts. The palette drift that survived the first theme pass
    // landed in docDefaults, inside styles.xml, which a document-only
    // assertion could never have seen.
    const declared = new Set([...DECLARED_COLORS.map((c) => c.toUpperCase()), 'FFFFFF', 'AUTO']);
    for (const [label, xml] of [
      ['document', out.doc],
      ['styles', out.styles],
      ['header', out.header],
    ] as const) {
      const undeclared = allColors(xml).filter((c) => !declared.has(c));
      expect(undeclared, `undeclared colors in ${label}.xml`).toEqual([]);
    }
  });

  it('pins the whole palette — adding a color has to be deliberate', () => {
    // The standard names one charcoal. The first theme pass introduced 1A1A24
    // for body and 5A5D6B for meta on top of 3E3E3E — three dark values against
    // a spec naming one, drift introduced by the fix for drift, and it landed
    // in docDefaults where a document-only assertion could not see it.
    //
    // Pinned as an exact set rather than derived. A luminance heuristic was
    // tried first and classified Bloom green as a dark neutral (relative
    // luminance 126 against a 128 threshold) — clever, and wrong in a way that
    // would have hidden a real palette addition behind a false pass.
    // Two added deliberately for the callout patterns: E8F5E8 is the pale
    // green surface (charcoal text on it, accent permitted inside it) and
    // F5F5F5 is its neutral twin, for callouts that must not read as good news.
    //
    // The section bar added NOTHING. It was specified as 3E3E3E on FFFFFF, and
    // both are already declared — charcoal and paper. A `sectionBarFill` token
    // would have put one hex behind two names, and this assertion is what
    // caught it.
    expect(new Set(DECLARED_COLORS)).toEqual(
      new Set(['3E3E3E', '5A5D6B', '3CAD3A', 'D9D9D9', 'EDEDED', 'F4F5F7', 'E8F5E8', 'F5F5F5']),
    );
  });

  it('the section bar is composed from declared tokens, never a new one', () => {
    expect(SECTION_BAR.fill).toBe(PALETTE.charcoal);
    expect(SECTION_BAR.text).toBe('FFFFFF');
    // And the composition must not have leaked back into the palette.
    expect(DECLARED_COLORS.filter((c) => c === PALETTE.charcoal)).toHaveLength(1);
  });

  it('keeps the two callout surfaces light enough for charcoal text', () => {
    // The rule is about CONTRAST, not hue. A green fill is legal here only
    // because the text on it stays charcoal — the same reasoning that forbids
    // white on 3CAD3A permits charcoal on E8F5E8.
    for (const fill of [PALETTE.calloutFill, PALETTE.neutralFill]) {
      const n = parseInt(fill, 16);
      const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
      expect(lum, `${fill} is too dark to carry charcoal text`).toBeGreaterThan(200);
    }
  });

  it('carries exactly one dark neutral and one grey, accent excluded', () => {
    const neutrals = DECLARED_COLORS.filter((c) => c !== PALETTE.bloom);
    const dark = neutrals.filter((c) => {
      const n = parseInt(c, 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return 0.299 * r + 0.587 * g + 0.114 * b < 128;
    });
    expect(dark.sort()).toEqual([PALETTE.charcoal, PALETTE.muted].sort());
  });

  it('carries no Word stock color in styles.xml either — the latent blue is gone', () => {
    // Not overridden: absent. The library's stock Heading1..6 never enter the
    // file, so a stray HeadingLevel reference cannot resurrect them.
    for (const c of WORD_DEFAULT_COLORS) {
      expect(out.styles.toUpperCase()).not.toContain(c.toUpperCase());
    }
  });

  it('emits no stock Heading style definitions at all', () => {
    expect(out.styles).not.toMatch(/w:styleId="Heading\d"/);
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

  it('carries no partner trademark in the brand zone and no image asset', () => {
    // Deliberate: a Bloom mark on customer-facing documents is a permission
    // question answered outside the codebase. The fixed box means adding one
    // later reflows nothing.
    //
    // SCOPED to the header zone and word/media ON PURPOSE. A global string
    // check fails on the first real MAP, because "R. Okafor (Bloom)" is a
    // legitimate milestone owner — a Bloom employee's name in a body cell is
    // content, not branding, and will recur on every genuine plan. The rule is
    // about the brand zone, so the test has to be too.
    expect(out.names.filter((n) => n.startsWith('word/media'))).toEqual([]);
    expect(out.header).not.toMatch(/Bloom/i);
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

describe('referential integrity of the packed styles part', () => {
  /**
   * Replacing word/styles.xml wholesale is the right fix for the latent blue
   * and a standing hazard: it drops every definition the library shipped, while
   * the library keeps emitting OTHER parts that reference them by name. The
   * first cut dropped ten styles and left footnotes.xml and endnotes.xml
   * pointing at rStyles that no longer existed.
   *
   * These check the CLASS — every style any part references must be defined —
   * rather than the three instances that happened to be found. A future part
   * referencing a style we forget is caught here, not in a customer's Word.
   */
  it.each([
    ['with a table', WITH_TABLE],
    ['without a table', WITHOUT_TABLE],
  ])('every referenced style resolves to a definition — %s', async (_label, markdown) => {
    const out = await render(markdown);
    const defined = new Set([...out.styles.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]));

    const dangling: { style: string; part: string }[] = [];
    for (const [part, xml] of Object.entries(out.parts)) {
      if (part === 'word/styles.xml') continue;
      for (const m of xml.matchAll(/w:(?:pStyle|rStyle|tblStyle) w:val="([^"]+)"/g)) {
        if (!defined.has(m[1])) dangling.push({ style: m[1], part });
      }
    }
    expect(dangling).toEqual([]);
  });

  it('defines Hyperlink, so a source reference is visibly a reference', async () => {
    // Load-bearing for source tagging on the no-decision and pricing-defense
    // cards: without it a citation renders as plain body text and provenance
    // fails silently, on the two documents where verifiability IS the product.
    const out = await render(WITHOUT_TABLE);
    const style = out.styles.match(/<w:style[^>]*w:styleId="Hyperlink"[\s\S]*?<\/w:style>/)?.[0];
    expect(style).toBeDefined();
    expect(style).toContain('<w:u w:val="single"/>');
    expect(style).toContain(`w:color w:val="${PALETTE.charcoal}"`);
  });

  it('does not colour links green — accent-only, and 2.7:1 on white', async () => {
    const out = await render(WITHOUT_TABLE);
    const style = out.styles.match(/<w:style[^>]*w:styleId="Hyperlink"[\s\S]*?<\/w:style>/)![0];
    expect(style.toUpperCase()).not.toContain(PALETTE.bloom.toUpperCase());
  });

  it('defines every style the library references from other parts', async () => {
    const out = await render(WITHOUT_TABLE);
    for (const id of ['FootnoteReference', 'EndnoteReference', 'ListParagraph', 'Normal']) {
      expect(out.styles).toContain(`w:styleId="${id}"`);
    }
  });
});

describe('the deck is the same brand system as the document', () => {
  /**
   * The PPTX was the last output the theme did not reach. It carried its own
   * palette — a near-black cover, 9A9DAA subtitles, FFFFFF type — none of it in
   * PALETTE, all of it invented at the point of use. A deck and a document
   * handed to the same reader in the same meeting described the same company
   * with different ink.
   *
   * Asserted against the GENERATED OOXML, not the source. A test that read
   * generate.ts would pass on a file that imported the palette and then wrote
   * a literal anyway.
   */
  const DECK = `# Where they win
- Single-throat procurement
- Contracting speed

## Where we win
- Zero planned downtime inside the O&M scope
- No combustion permitting for the host
`;

  async function slideXml(): Promise<string> {
    const buf = await generatePptx('Williams — Pricing defense', 'OG-019 · O&G-Mid', DECK);
    const zip = await JSZip.loadAsync(buf);
    const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(parts.length).toBeGreaterThan(1);
    return (await Promise.all(parts.map((f) => zip.file(f)!.async('string')))).join('\n');
  }

  it('uses no colour outside the declared palette', async () => {
    const xml = await slideXml();
    const used = [...xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
    expect(used.length).toBeGreaterThan(0);
    const declared = DECLARED_COLORS.map((c) => c.toUpperCase());
    const drift = [...new Set(used)].filter((c) => !declared.includes(c));
    expect(drift, `undeclared colours in the deck: ${drift.join(', ')}`).toEqual([]);
  });

  it('has retired the invented values specifically', async () => {
    // Named rather than left to the set check, because these are the exact
    // three that were there and a regression would reintroduce them by name.
    const xml = await slideXml();
    for (const dead of ['0F1117', '9A9DAA', 'FFFFFF']) {
      expect(xml.toUpperCase(), `${dead} is back`).not.toContain(`SRGBCLR VAL="${dead}"`);
    }
  });

  it('uses ONE dark value for headings and body alike', async () => {
    // Pinned, not derived. A luminance heuristic was tried in the DOCX pass
    // and classified Bloom green as a dark neutral — clever, and wrong in a
    // way that would have passed silently.
    const xml = await slideXml();
    const used = new Set(
      [...xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()),
    );
    const DARK = new Set(['000000', '1A1A24', '0F1117', '767676', '9A9DAA']);
    for (const d of DARK) expect(used, `${d} is a second dark value`).not.toContain(d);
    expect(used).toContain(PALETTE.charcoal.toUpperCase());
  });

  it('uses green as an accent only — never as a fill behind text', async () => {
    const buf = await generatePptx('T', 'S', DECK);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('ppt/slides/slide2.xml')!.async('string');
    // Every green occurrence must sit inside a shape's fill, and that shape
    // must carry no text run. Split on shape boundaries and check each.
    const shapes = xml.split(/<p:sp>/).filter((s) => s.includes(PALETTE.bloom));
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape, 'text found in a green shape').not.toMatch(/<a:t>[^<]+<\/a:t>/);
    }
  });

  it('has no Office colour scheme left in the theme part', async () => {
    // The slides render clean by construction, and a check that stopped there
    // would pass. The THEME PART shipped Office's stock scheme — 4472C4,
    // ED7D31, FFC000, 70AD47, and the 0563C1 / 954F72 hyperlink pair already
    // stripped from the DOCX. Layouts reference it by NAME, so the first shape
    // or link added in PowerPoint reintroduces colours this build never chose.
    const buf = await generatePptx('T', 'S', DECK);
    const zip = await JSZip.loadAsync(buf);
    const theme = await zip.file('ppt/theme/theme1.xml')!.async('string');
    for (const office of ['4472C4', 'ED7D31', 'FFC000', '70AD47', 'A5A5A5', '5B9BD5', '44546A', 'E7E6E6']) {
      expect(theme.toUpperCase(), `Office ${office} still in the theme`).not.toContain(office);
    }
    for (const link of WORD_DEFAULT_COLORS) {
      expect(theme.toUpperCase(), `${link} still in the theme`).not.toContain(link.toUpperCase());
    }
  });

  it('names the scheme after the palette, so a stray shape inherits it', async () => {
    const zip = await JSZip.loadAsync(await generatePptx('T', 'S', DECK));
    const theme = await zip.file('ppt/theme/theme1.xml')!.async('string');
    expect(theme).toContain('<a:clrScheme name="PowerDeal">');
    expect(theme).toContain(`<a:accent1><a:srgbClr val="${PALETTE.bloom}"/></a:accent1>`);
    // The hyperlink takes charcoal with the underline carrying the affordance,
    // matching the DOCX Hyperlink style so a link looks the same in both.
    expect(theme).toContain(`<a:hlink><a:srgbClr val="${PALETTE.charcoal}"/></a:hlink>`);
  });

  it('keeps the font and format schemes the layouts reference', async () => {
    // The scheme is REPLACED, not the whole theme file. Dropping the sibling
    // schemes produced exactly the version-dependent breakage the duplicate
    // Word styleIds did.
    const zip = await JSZip.loadAsync(await generatePptx('T', 'S', DECK));
    const theme = await zip.file('ppt/theme/theme1.xml')!.async('string');
    expect(theme).toContain('<a:fontScheme');
    expect(theme).toContain('<a:fmtScheme');
  });

  it('allows black ONLY as a shadow, never as ink', async () => {
    // One 000000 survives, inside an outerShdw at 63% alpha in the format
    // scheme. A shadow is not type. Asserted as a location rather than waved
    // through, so black reappearing as a text or fill colour fails here.
    const zip = await JSZip.loadAsync(await generatePptx('T', 'S', DECK));
    for (const f of Object.keys(zip.files).filter((n) => n.endsWith('.xml'))) {
      const xml = await zip.file(f)!.async('string');
      for (const m of xml.matchAll(/srgbClr val="000000"/gi)) {
        const before = xml.slice(Math.max(0, m.index! - 200), m.index!);
        expect(before, `black used as ink in ${f}`).toMatch(/Shdw|effect/i);
      }
    }
  });

  it('carries the PowerDeal wordmark, and no Bloom mark', async () => {
    const xml = await slideXml();
    expect(xml).toContain(WORDMARK);
    // Same rule as the document: a partner's trademark on a customer-facing
    // artifact is a permission question that belongs outside the codebase.
    expect(xml).not.toMatch(/Bloom/i);
  });

  it('opens a slide per heading and keeps bullets under it', async () => {
    const buf = await generatePptx('T', 'S', DECK);
    const zip = await JSZip.loadAsync(buf);
    const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(s2).toContain('Where they win');
    expect(s2).toContain('Single-throat procurement');
  });
});

describe('the five defects in the reference document, asserted against our output', () => {
  /**
   * The Meeting Prep reference doc is better than what this build ships in
   * three ways — the callout surfaces and the section bar are adopted above.
   * It also carries five defects, and adopting a pattern is exactly when they
   * get inherited: the good parts and the bad parts arrive in the same file.
   *
   * Each one is asserted against the RENDERED artifact, not against our source,
   * because the question is what reaches the reader.
   */

  const CONTENT = `# Meeting prep
## Openers
- **Cost lead** — open on the rate trajectory.

| Field | Value |
|---|---|
| Value Prop | Multiple |
| Size | ~116 MW [REPORTED] |
`;

  async function docParts() {
    const buf = await generateDocx('Williams — Meeting prep', 'OG-019 · 45 min', CONTENT);
    const zip = await JSZip.loadAsync(buf);
    const out: Record<string, string> = {};
    for (const f of Object.keys(zip.files)) {
      if (f.endsWith('.xml')) out[f] = await zip.file(f)!.async('string');
    }
    return out;
  }

  it('DEFECT 1 — no Word blue anywhere in styles.xml', async () => {
    // The reference doc carries it in the stock heading and hyperlink styles.
    // Unreferenced, but one stray HeadingLevel.HEADING_1 brings it back.
    const parts = await docParts();
    const styles = parts['word/styles.xml'];
    expect(styles).toBeTruthy();
    for (const blue of WORD_DEFAULT_COLORS) {
      expect(styles.toUpperCase(), `${blue} is in styles.xml`).not.toContain(blue.toUpperCase());
    }
  });

  it('DEFECT 2 — none of the four undeclared greys reach the document', async () => {
    // 666666, 888888, 999999, DDDDDD. Four greys against a palette naming one,
    // which is how a document ends up with four shades of "secondary text"
    // that nobody chose.
    const parts = await docParts();
    const all = Object.values(parts).join('\n').toUpperCase();
    for (const grey of ['666666', '888888', '999999', 'DDDDDD']) {
      expect(all, `undeclared grey ${grey} reached the output`).not.toContain(grey);
    }
  });

  it('DEFECT 3 — every shaded band carries an EXACT row height', async () => {
    // The reference header band has no trHeight, so it grows with its content
    // and reflows the page around it. Both of our shaded bands pin it.
    const parts = await docParts();
    const doc = parts['word/document.xml'] + (parts['word/header1.xml'] ?? '');
    const bands = [...doc.matchAll(/<w:trHeight[^/]*\/>/g)].map((m) => m[0]);
    expect(bands.length, 'no fixed-height row found at all').toBeGreaterThan(0);
    for (const b of bands) {
      expect(b, `a shaded band is not exact: ${b}`).toContain('w:hRule="exact"');
    }
    expect(sectionBar('Openers')).toBeTruthy();
    expect(SECTION_BAR_TWIPS).toBeGreaterThan(0);
  });

  it('DEFECT 4 — the retired Value Prop value cannot render', async () => {
    // The reference prints "Both", which v3.1.10 renamed to "Multiple".
    const parts = await docParts();
    const text = parts['word/document.xml'].replace(/<[^>]+>/g, '');
    expect(text).toContain('Multiple');
    expect(text).not.toMatch(/\bBoth\b/);
    // And the enum itself no longer offers it, so the renderer cannot be fed it.
    expect(VALUE_PROPS as readonly string[]).not.toContain('Both');
  });

  it('DEFECT 5 — a figure without a provenance tag is refused', () => {
    // The reference prints "~116 MW" bare. A number with no tier is a number
    // a reader cannot check, in a document whose credibility rests on being
    // checkable.
    expect(untagged('~116 MW')).toBe(true);
    expect(untagged('~116 MW [REPORTED]')).toBe(false);
    expect(untagged('116 MW (CPUC Decision A.25-05-012, Dec 2025)')).toBe(false);
  });

  /**
   * The callout and the bar are PACKED and scanned, not merely constructed.
   *
   * The first version of this asserted `callout(...)` was truthy and checked
   * its fill against DECLARED_COLORS — and a mutation putting 888888 on the
   * text inside it passed, because nothing ever rendered the thing. Building
   * an object proves the object builds. Only the packed XML says what a reader
   * gets.
   */
  async function packed(children: (Table | Paragraph)[]): Promise<string> {
    const doc = new Document({ sections: [{ children }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    return zip.file('word/document.xml')!.async('string');
  }

  it('the callout surfaces render as shaded single-cell tables', async () => {
    for (const [tone, fill] of [
      ['positive', PALETTE.calloutFill],
      ['neutral', PALETTE.neutralFill],
    ] as const) {
      const xml = await packed([callout(['A line.'], tone)]);
      expect(xml, `${tone} callout is not shaded ${fill}`).toContain(`w:fill="${fill}"`);
      expect(xml).toContain('A line.');
    }
  });

  it('the callout and the bar use no undeclared colour either', async () => {
    // Same scan as the document, applied to the parts the document renderer
    // never sees.
    const xml = await packed([
      callout(['Positive.'], 'positive'),
      callout(['Neutral.'], 'neutral'),
      sectionBar('Openers'),
      ...classificationLine('internal'),
    ]);
    const used = [...xml.matchAll(/w:(?:val|fill|color)="([0-9A-Fa-f]{6})"/g)].map((m) =>
      m[1].toUpperCase(),
    );
    const allowed = new Set([...DECLARED_COLORS.map((c) => c.toUpperCase()), 'FFFFFF']);
    const drift = [...new Set(used)].filter((c) => !allowed.has(c));
    expect(drift, `undeclared colours in the callout parts: ${drift.join(', ')}`).toEqual([]);
    for (const grey of ['666666', '888888', '999999', 'DDDDDD']) {
      expect(xml.toUpperCase(), `undeclared grey ${grey}`).not.toContain(grey);
    }
  });

  it('text on the green surface is charcoal, and the accent is the edge', async () => {
    // The never-light-text-on-green rule, at the one place green is a fill.
    const xml = await packed([callout(['A line.'], 'positive')]);
    expect(xml).toContain(`w:val="${PALETTE.charcoal}"`);
    expect(xml).not.toContain(`w:val="${PALETTE.bloom}"`);
    // Green appears, but as a border — the left edge of the box.
    expect(xml).toContain(`w:color="${PALETTE.bloom}"`);
  });

  it('the section bar is white on charcoal at an exact height', async () => {
    const xml = await packed([sectionBar('Openers')]);
    expect(xml).toContain(`w:fill="${SECTION_BAR.fill}"`);
    expect(xml).toContain(`w:val="${SECTION_BAR.text}"`);
    expect(xml).toMatch(/<w:trHeight[^/]*w:hRule="exact"[^/]*\/>/);
    expect(xml).toContain('OPENERS');
  });

  it('the classification header is internal-only, and says so exactly', () => {
    expect(CLASSIFICATION_INTERNAL).toBe('CONFIDENTIAL — INTERNAL USE ONLY');
    expect(classificationLine('internal')).toHaveLength(1);
    // A champion-facing artifact must NOT carry it — stamping a document a
    // customer is meant to receive tells them they are holding something they
    // were not meant to see.
    expect(classificationLine('champion-facing')).toHaveLength(0);
  });
});

describe('the PPTX theme part, which the slides do not reach', () => {
  /**
   * ⚠️ THE LATENT-SCHEME SHAPE, ONE PART OVER FROM WHERE IT WAS FOUND LAST TIME.
   *
   * Every run `generatePptx` writes carries an explicit `fontFace` and an
   * explicit `color`, so the deck LOOKS right and every slide-level assertion
   * passes. `ppt/theme/theme1.xml` is what anything we did NOT draw inherits
   * from — a placeholder the reader adds, a pasted table, a chart, SmartArt.
   *
   * Reading it found the colour scheme already branded (`name="PowerDeal"`,
   * our own hlink and folHlink) sitting beside a font scheme still declaring
   * `Calibri Light`. Half-done, and invisible from every other test.
   */
  // Its own deck source: `DECK` is scoped to another describe block, and
  // reaching for it would couple two suites through a variable neither owns.
  const SOURCE = '# Heading\n\nBody text.\n\n- one\n- two\n';

  async function themeXml(): Promise<string> {
    const buf = await generatePptx('T', 'S', SOURCE);
    const zip = await JSZip.loadAsync(buf);
    const part = Object.keys(zip.files).find((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f));
    expect(part, 'the deck has no theme part').toBeTruthy();
    return zip.file(part!)!.async('string');
  }

  it('declares the brand face as major and minor, not Calibri Light', async () => {
    const xml = await themeXml();
    const major = /<a:majorFont><a:latin typeface="([^"]*)"/.exec(xml);
    const minor = /<a:minorFont><a:latin typeface="([^"]*)"/.exec(xml);
    expect(major?.[1], 'major font in the theme part').toBe(FONT);
    expect(minor?.[1], 'minor font in the theme part').toBe(FONT);
    // The specific stock value that was there.
    expect(xml).not.toContain('typeface="Calibri Light"');
  });

  it('the colour scheme is ours, including the hyperlink pair', async () => {
    /*
      Stock Office hyperlink blues are the tell that a theme was never touched,
      and they are the exact thing that survived the DOCX pass. Checked here so
      a future regeneration cannot quietly reintroduce them.
    */
    const xml = await themeXml();
    const scheme = /<a:clrScheme name="([^"]*)">([\s\S]*?)<\/a:clrScheme>/.exec(xml);
    expect(scheme, 'no colour scheme in the theme part').toBeTruthy();
    expect(scheme![1]).toBe('PowerDeal');

    const hlink = /<a:hlink><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(scheme![2])?.[1];
    const folHlink = /<a:folHlink><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(scheme![2])?.[1];
    for (const [name, value] of [['hlink', hlink], ['folHlink', folHlink]] as const) {
      expect(value, `${name} is missing`).toBeTruthy();
      expect(
        DECLARED_COLORS.map((c) => c.toUpperCase()),
        `${name} (${value}) is not a declared colour`,
      ).toContain(value!.toUpperCase());
    }
    for (const stock of WORD_DEFAULT_COLORS) {
      expect(scheme![2].toUpperCase(), `stock Office colour ${stock} in the scheme`)
        .not.toContain(stock.toUpperCase());
    }
  });

  it('every accent in the scheme is a declared colour', async () => {
    const xml = await themeXml();
    const scheme = /<a:clrScheme name="[^"]*">([\s\S]*?)<\/a:clrScheme>/.exec(xml)![1];
    const declared = new Set(DECLARED_COLORS.map((c) => c.toUpperCase()));
    // White is legitimate in a theme's lt1 and is not a brand colour.
    declared.add('FFFFFF');
    for (const m of scheme.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)) {
      expect(declared, `${m[1]} in the theme scheme is not declared`).toContain(m[1].toUpperCase());
    }
  });

  /**
   * ⚠️ ONE THING NOT ASSERTED, AND SAID RATHER THAN LEFT TO BE DISCOVERED.
   * `<a:fontScheme name="Office">` keeps that NAME — pptxgenjs hardcodes it and
   * exposes no setting. The name shows in PowerPoint's theme-fonts dropdown and
   * changes nothing about what renders; the typefaces above are what the
   * document actually inherits. Rewriting the zip to rename it would be a
   * post-processing step for a cosmetic string, on a file format where every
   * such step is a future breakage.
   */
  it('records that the font scheme NAME is pptxgenjs’s, not ours', async () => {
    const xml = await themeXml();
    expect(xml).toContain('<a:fontScheme name="Office">');
  });
});
