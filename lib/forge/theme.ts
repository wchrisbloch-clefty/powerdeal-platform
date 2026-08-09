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
  /** Headings, wordmark, table header text. */
  charcoal: '3E3E3E',
  /** Body copy. Matches --color-text. */
  body: '1A1A24',
  /** Meta lines, subtitles, footers. Matches --color-text-dim. */
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
    run: { font: FONT, size: 21, color: PALETTE.body },
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
