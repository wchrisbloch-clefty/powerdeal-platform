import {
  BorderStyle,
  Header,
  HeightRule,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

/**
 * DOCX THEME — the single source of brand truth for every exported document.
 *
 * There has only ever been one DOCX renderer (generateDocx), so the documents
 * could not diverge from each other. What they diverged from was the standard,
 * and nothing asserted otherwise. This module makes the theme explicit and
 * assertable rather than distributed across inline literals in the renderer.
 *
 * ── ACCENT-ONLY GREEN ──────────────────────────────────────────────
 *
 * Bloom green is a MARK, never a wash. It appears in exactly three places:
 *
 *   1. the rule at the bottom edge of the header band
 *   2. the rule beneath the document title
 *   3. the top and bottom borders of a table
 *
 * It is never a fill and never behind text. Two independent reasons, and
 * either alone would settle it:
 *
 *   · RULE 3 in styles/tokens.css prohibits the accent as a background wash.
 *     The app already answered this question for itself, and documents
 *     diverging from the app is its own inconsistency.
 *
 *   · White or light text on #3CAD3A measures ~2.6:1 — the same failure class
 *     as the 1.98:1 primary-button label that shipped invisible in both themes.
 *     NEVER put light text on green anywhere in this theme.
 *
 * There is a third reason specific to these artifacts: a MAP gets printed and
 * forwarded inside defense and industrial accounts. Large green headings
 * grayscale into mud; charcoal headings with green marks survive a photocopier.
 *
 * Headings are charcoal. That is also what they already render as — the blue
 * in styles.xml was latent, overridden inline on every heading we emit. The
 * paragraph styles below kill it at the source so an unstyled heading cannot
 * fall back to Word blue.
 */

// ── Type ───────────────────────────────────────────────────────────

export const FONT = 'Aptos';
/** Aptos is not installed everywhere yet. */
export const FONT_FALLBACK = 'Calibri';

// ── Palette ────────────────────────────────────────────────────────

/**
 * Every color the exports may use. Values track styles/tokens.css so a
 * document and the app describe the same thing with the same ink.
 *
 * `body` and `muted` replace the undeclared 000000 / 767676 / 9A9DAA that were
 * in use. Pure black in particular was never a decision — it was the default
 * argument in the table renderer.
 */
export const PALETTE = {
  /**
   * The ONE dark value. Headings, body copy, wordmark, table text.
   *
   * The first pass at this replaced 000000 with 1A1A24 for body and added
   * 5A5D6B for meta, which left three dark values against a standard naming one
   * charcoal — palette drift introduced by the fix for palette drift, and it
   * went into docDefaults itself where the suite was least likely to look.
   */
  charcoal: '3E3E3E',
  /** The ONE grey. Meta lines, subtitles, footers. */
  muted: '5A5D6B',
  /** Bloom green. Mark only — never a fill. */
  bloom: '3CAD3A',
  /** Table outer borders and rules. */
  rule: 'D9D9D9',
  /** Table inside horizontals. */
  ruleFaint: 'EDEDED',
  /** Table header row fill. Neutral by decision — see the note above. */
  headerFill: 'F4F5F7',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** The closed set. Anything outside it in a rendered document is drift. */
export const DECLARED_COLORS: string[] = Object.values(PALETTE);

/** Colors Word ships in its stock heading styles. None may appear. */
export const WORD_DEFAULT_COLORS = ['2E74B5', '1F4D78', '0563C1', '954F72', '2F5496'];

// ── Header band ────────────────────────────────────────────────────

/**
 * Fixed box, filled now.
 *
 * Reserved whitespace was rejected: an empty band at the top of a page reads as
 * a rendering error rather than a design choice, and today's state is the only
 * one that exists. So the box is a fixed dimension and its CONTENT is what
 * changes — a typographic wordmark now, an image later, dropped into the same
 * box as a content substitution. Nothing reflows because nothing moves.
 *
 * The wordmark is PowerDeal's own. No Bloom mark: putting a partner's
 * trademark on customer-facing documents is a permission question that belongs
 * outside the codebase, and the fixed box means waiting costs nothing.
 */
export const HEADER_BAND_TWIPS = 936; // 0.65in x 1440 twips/in
export const PAGE_MARGIN_TWIPS = 1080; // 0.75in

export const WORDMARK = 'PowerDeal';

/**
 * The header band: a single-cell table at an EXACT row height.
 *
 * A table rather than a paragraph because `HeightRule.EXACT` is the only
 * mechanism Word honours as a hard box — paragraph spacing grows with its
 * content, which is the behaviour this is specifically avoiding.
 */
export function brandHeader(): Header {
  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          // Green placement 1 of 3: the rule at the band's bottom edge.
          bottom: { style: BorderStyle.SINGLE, size: 12, color: PALETTE.bloom },
        },
        rows: [
          new TableRow({
            height: { value: HEADER_BAND_TWIPS, rule: HeightRule.EXACT },
            children: [
              new TableCell({
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: WORDMARK,
                        bold: true,
                        size: 26,
                        color: PALETTE.charcoal,
                        font: FONT,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ── Document defaults ──────────────────────────────────────────────

/**
 * docDefaults, so no run can fall back to Calibri.
 *
 * Aptos previously appeared only as inline run overrides. Any run emitted
 * without an explicit rPr inherited Calibri — a mixed-font document waiting on
 * an unexercised code path, which is the same defect shape as the latent blue
 * headings.
 */
export const DOC_DEFAULTS = {
  document: {
    run: { font: FONT, size: 21, color: PALETTE.charcoal },
    paragraph: { spacing: { after: 110 } },
  },
};

/**
 * Heading styles, charcoal.
 *
 * Declared here so styles.xml itself carries charcoal. Overriding inline (what
 * the renderer already did) leaves Word's blue latent in the file, ready for
 * the first heading someone emits without an explicit color.
 */
export const HEADING_STYLE_IDS = ['PDHeading1', 'PDHeading2', 'PDHeading3'] as const;

/**
 * Namespaced IDs, deliberately NOT 'Heading1'.
 *
 * Defining a style with an id the docx library already emits produces TWO
 * <w:style w:styleId="Heading1"> blocks in styles.xml — one blue, one charcoal.
 * Duplicate style ids are malformed OOXML and Word's precedence between them is
 * undefined, which is worse than the latent blue it was meant to fix: the
 * heading colour would depend on the reader's Word version.
 *
 * So our headings carry their own ids and reference them explicitly. The
 * library's stock blue Heading1..6 still sit in styles.xml — they are part of
 * its fixed default set and cannot be suppressed — but nothing in any document
 * references them, which the tests assert.
 *
 * outlineLevel keeps Word's navigation pane and TOC working; that behaviour
 * came from HeadingLevel, not from the blue.
 */
export const PARAGRAPH_STYLES = [
  {
    id: 'PDHeading1',
    name: 'PowerDeal Heading 1',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font: FONT, size: 28, bold: true, color: PALETTE.charcoal },
    paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 0 },
  },
  {
    id: 'PDHeading2',
    name: 'PowerDeal Heading 2',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font: FONT, size: 23, bold: true, color: PALETTE.charcoal },
    paragraph: { spacing: { before: 220, after: 90 }, outlineLevel: 1 },
  },
  {
    id: 'PDHeading3',
    name: 'PowerDeal Heading 3',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font: FONT, size: 21, bold: true, color: PALETTE.charcoal },
    paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 },
  },
];

// ── Table treatment ────────────────────────────────────────────────

/**
 * Green on the top and bottom edges only; neutral everywhere else.
 *
 * Green placement 3 of 3.
 */
export const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 8, color: PALETTE.bloom },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: PALETTE.bloom },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PALETTE.ruleFaint },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

/** Light grey fill, charcoal bold text. Never green — see the note above. */
export const TABLE_HEADER_SHADING = {
  type: ShadingType.CLEAR,
  color: 'auto',
  fill: PALETTE.headerFill,
};

export const TABLE_CELL_MARGINS = { top: 60, bottom: 60, left: 80, right: 80 };

/** Green placement 2 of 3: the rule beneath the document title. */
export const TITLE_RULE = {
  bottom: { color: PALETTE.bloom, size: 12, style: BorderStyle.SINGLE, space: 6 },
};


// ── styles.xml, supplied wholesale ──────────────────────────────────

/**
 * The complete styles.xml, replacing the library's default set.
 *
 * The library ships stock Heading1..6 and Hyperlink carrying Word blue. Seven
 * occurrences survived the theme work because they are part of its fixed
 * default styles — unreferenced, but present, and by the same reasoning that
 * made the latent blue worth fixing at all, an unreferenced landmine is the
 * worse defect class precisely because nothing reveals it. One stray
 * `heading: HeadingLevel.HEADING_1` brings it back.
 *
 * docx exposes `externalStyles`, but it APPENDS to the default set rather than
 * replacing it — supplying this string that way produced the library's blue
 * headings AND ours, plus two <w:docDefaults> blocks, which is worse than the
 * problem. So generateDocx packs the document and then replaces the
 * word/styles.xml part outright. One styles.xml, ours, no blue in the file at
 * all — not overridden, absent.
 *
 * Generated from the constants above rather than hand-written, so there is
 * still one source of truth and the assertions test what the renderer emits.
 */
export function buildStylesXml(): string {
  const heading = (id: string, name: string, size: number, outline: number, before: number, after: number) =>
    `<w:style w:type="paragraph" w:styleId="${id}">` +
    `<w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:outlineLvl w:val="${outline}"/>` +
    `<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>` +
    `<w:b/><w:bCs/><w:color w:val="${PALETTE.charcoal}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:style>`;

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>` +
    `<w:color w:val="${PALETTE.charcoal}"/><w:sz w:val="21"/><w:szCs w:val="21"/>` +
    '</w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>' +
    // Bullets reference ListParagraph; omitting it would leave them unstyled.
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>' +
    // ── Styles other PARTS reference ──────────────────────────────
    //
    // Replacing styles.xml wholesale dropped ten definitions the library
    // shipped, and the library still emits footnotes.xml and endnotes.xml that
    // reference two of them by name. Dangling rStyle references are harmless
    // while nothing emits a footnote and are a latent defect the moment
    // something does — the same shape as the blue this replacement removed.
    //
    // Hyperlink is the one that matters, and it matters NOW. Source tagging on
    // the no-decision and pricing-defense cards is next in the queue, and those
    // are the two documents whose credibility rests entirely on a reader being
    // able to check a figure. Without this style a source reference renders as
    // plain body text: no underline, no affordance, nothing to click or even
    // notice. Provenance failing silently is the worst way for that feature to
    // break, because the document still looks finished.
    //
    // Charcoal underlined, not a colour. Green would be the obvious "link"
    // choice and is wrong twice over: it is accent-only in three defined
    // places, and #3CAD3A on white measures ~2.7:1, which fails AA for text.
    // The underline is the affordance, and it is the one that survives the
    // photocopier these documents get put through.
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>` +
    `<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
    `<w:rPr><w:color w:val="${PALETTE.charcoal}"/><w:u w:val="single"/></w:rPr></w:style>` +
    '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/>' +
    '<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
    '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/>' +
    '<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
    '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
    heading('PDHeading1', 'PowerDeal Heading 1', 28, 0, 300, 120) +
    heading('PDHeading2', 'PowerDeal Heading 2', 23, 1, 220, 90) +
    heading('PDHeading3', 'PowerDeal Heading 3', 21, 2, 180, 80) +
    '</w:styles>'
  );
}
