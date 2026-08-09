import 'server-only';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType,
} from 'docx';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { BRAND, APP_NAME } from '@/lib/brand';
import {
  PALETTE, TABLE_BORDERS, TABLE_CELL_MARGINS, buildStylesXml,
  TABLE_HEADER_SHADING, TITLE_RULE, brandHeader, PAGE_MARGIN_TWIPS,
  FONT as THEME_FONT,
} from './theme';
import type { Deal } from '@/lib/types';

/**
 * Document generation.
 *
 * Takes the AI's markdown-ish output and renders it into a real file. All brand
 * decisions — type, palette, table treatment, header band — live in ./theme.
 * This module decides STRUCTURE; it does not decide what things look like.
 */

export type ForgeFormat = 'docx' | 'pptx' | 'xlsx' | 'md' | 'pdf';

/** One definition, in the theme. */
const FONT_STACK = THEME_FONT;

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'para' | 'rule' | 'table';
  text: string;
  /** Populated for `table`: first row is the header. */
  rows?: string[][];
}

/** A markdown table row: leading and trailing pipes optional. */
function isTableRow(line: string): boolean {
  return line.includes('|') && /^\|?.*\|.*$/.test(line);
}

/** The |---|---| separator under a table header. */
function isTableDivider(line: string): boolean {
  return /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => clean(c.trim()));
}

/** Parse the AI's output into a flat block list. Tolerant of partial input. */
export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    // Tables are consumed as a unit: a header row, a |---| divider, then body
    // rows until the run ends. Checked before the horizontal-rule case, since
    // a divider row would otherwise read as one.
    if (isTableRow(t) && i + 1 < lines.length && isTableDivider(lines[i + 1].trim())) {
      const rows: string[][] = [splitRow(t)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i].trim()) && lines[i].trim()) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      i--;
      blocks.push({ type: 'table', text: '', rows });
      continue;
    }

    if (/^[-—]{3,}$/.test(t)) { blocks.push({ type: 'rule', text: '' }); continue; }
    if (t.startsWith('### ')) { blocks.push({ type: 'h3', text: clean(t.slice(4)) }); continue; }
    if (t.startsWith('## ')) { blocks.push({ type: 'h2', text: clean(t.slice(3)) }); continue; }
    if (t.startsWith('# ')) { blocks.push({ type: 'h1', text: clean(t.slice(2)) }); continue; }
    if (/^[-*•]\s+/.test(t)) {
      blocks.push({ type: 'bullet', text: clean(t.replace(/^[-*•]\s+/, '')) });
      continue;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      blocks.push({ type: 'numbered', text: clean(t.replace(/^\d+[.)]\s+/, '')) });
      continue;
    }
    blocks.push({ type: 'para', text: clean(t) });
  }

  return blocks;
}

/** Strip markdown emphasis markers — the renderers apply real styling. */
function clean(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
}

// ── DOCX ────────────────────────────────────────────────────────

export async function generateDocx(
  title: string,
  subtitle: string,
  markdown: string,
): Promise<Buffer> {
  const blocks = parseBlocks(markdown);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [
        new TextRun({ text: title, bold: true, size: 40, color: PALETTE.charcoal, font: FONT_STACK }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: subtitle, size: 20, color: PALETTE.muted, font: FONT_STACK }),
      ],
      border: TITLE_RULE,
      spacing: { after: 280 },
    }),
  ];

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
      case 'h2':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                size: 28,
                color: PALETTE.charcoal,
                font: FONT_STACK,
              }),
            ],
            style: 'PDHeading1',
            spacing: { before: 300, after: 120 },
          }),
        );
        break;
      case 'h3':
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                size: 23,
                color: PALETTE.charcoal,
                font: FONT_STACK,
              }),
            ],
            style: 'PDHeading2',
            spacing: { before: 220, after: 90 },
          }),
        );
        break;
      case 'bullet':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, size: 21, font: FONT_STACK })],
            bullet: { level: 0 },
            spacing: { after: 70 },
          }),
        );
        break;
      case 'numbered':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `• ${block.text}`, size: 21, font: FONT_STACK })],
            indent: { left: 360 },
            spacing: { after: 70 },
          }),
        );
        break;
      case 'rule':
        children.push(
          new Paragraph({
            text: '',
            border: { bottom: { color: PALETTE.rule, size: 6, style: 'single', space: 4 } },
            spacing: { before: 120, after: 120 },
          }),
        );
        break;
      case 'table': {
        // A MAP walked through on a call is a table or it is nothing — loose
        // paragraphs of "milestone, owner, date" are unreadable at speed.
        //
        // KNOWN COSMETIC, not chased: every emitted gridCol is w:w="100", so
        // the column widths are placeholder-equal. tblW is 100% and tblLayout
        // is absent, so Word's autofit reflows them and nothing breaks —
        // proportional widths would only read better. Fix by passing explicit
        // `columnWidths` sized to the content when this becomes worth it.
        //
        // ALSO UNTESTED: header repeat across a real page break. The
        // <w:tblHeader/> flag is emitted on row 0 only, with w:val="false" on
        // every body row, which is the correct shape — but no export has yet
        // been long enough to break a page and confirm the behaviour.
        const rows = block.rows ?? [];
        if (rows.length === 0) break;
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            // Green on the top and bottom edges only. Never a fill.
            borders: TABLE_BORDERS,
            rows: rows.map(
              (cells, rowIndex) =>
                new TableRow({
                  tableHeader: rowIndex === 0,
                  children: cells.map(
                    (cell) =>
                      new TableCell({
                        margins: TABLE_CELL_MARGINS,
                        // Neutral light grey with charcoal bold text. A green
                        // fill would be the background wash RULE 3 prohibits,
                        // and light text on #3CAD3A measures ~2.6:1 — the same
                        // failure class as the 1.98:1 button label.
                        ...(rowIndex === 0 ? { shading: TABLE_HEADER_SHADING } : {}),
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: cell,
                                size: 19,
                                bold: rowIndex === 0,
                                color: PALETTE.charcoal,
                                font: FONT_STACK,
                              }),
                            ],
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        );
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        break;
      }
      default:
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, size: 21, font: FONT_STACK })],
            spacing: { after: 110 },
          }),
        );
    }
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by ${APP_NAME}. Verify every figure before external use.`,
          size: 16,
          color: PALETTE.muted,
          italics: true,
          font: FONT_STACK,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 500 },
    }),
  );

  const doc = new Document({
    creator: APP_NAME,
    title,
    // docDefaults is the theme's font, NOT the fallback. This line previously
    // read `font: FONT_FALLBACK`, which set Calibri as the document default and
    // left Aptos to inline run overrides — so any run emitted without an
    // explicit rPr silently rendered in Calibri.

    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_TWIPS,
              right: PAGE_MARGIN_TWIPS,
              bottom: PAGE_MARGIN_TWIPS,
              left: PAGE_MARGIN_TWIPS,
            },
          },
        },
        headers: { default: brandHeader() },
        children,
      },
    ],
  });

  // The library emits a fixed default style set carrying Word's blue
  // Heading1..6 and Hyperlink. `externalStyles` appends rather than replaces,
  // so the only way to keep the blue OUT of the file — as opposed to
  // overriding it inside the file — is to swap the part after packing.
  return replaceStylesPart(await Packer.toBuffer(doc), buildStylesXml());
}

/**
 * Swap word/styles.xml in a packed .docx.
 *
 * An unreferenced blue Heading1 is the defect class nothing reveals: it renders
 * correctly today and wrongly the moment someone writes
 * `heading: HeadingLevel.HEADING_1`. Removing it costs one repack.
 */
async function replaceStylesPart(buffer: Buffer, stylesXml: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('word/styles.xml', stylesXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── PPTX ────────────────────────────────────────────────────────

export async function generatePptx(
  title: string,
  subtitle: string,
  markdown: string,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = APP_NAME;
  pptx.title = title;

  // Title slide.
  const cover = pptx.addSlide();
  cover.background = { color: '0F1117' };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 2.35, w: 0.9, h: 0.06,
    fill: { color: BRAND.accent.replace('#', '') },
  });
  cover.addText(title, {
    x: 0.6, y: 2.6, w: 8.8, h: 1.0,
    fontSize: 34, bold: true, color: 'FFFFFF', fontFace: FONT_STACK,
  });
  cover.addText(subtitle, {
    x: 0.6, y: 3.55, w: 8.8, h: 0.5,
    fontSize: 15, color: '9A9DAA', fontFace: FONT_STACK,
  });

  // Content slides: each h1/h2 opens a slide, everything under it is bullets.
  const blocks = parseBlocks(markdown);
  let slide: PptxGenJS.Slide | null = null;
  let bullets: string[] = [];

  const flush = () => {
    if (slide && bullets.length > 0) {
      slide.addText(
        bullets.map((b) => ({ text: b, options: { breakLine: true, bullet: true } })),
        {
          x: 0.6, y: 1.35, w: 8.8, h: 3.6,
          fontSize: 15, color: '3E3E3E', fontFace: FONT_STACK, valign: 'top',
        },
      );
    }
    bullets = [];
  };

  for (const block of blocks) {
    if (block.type === 'h1' || block.type === 'h2') {
      flush();
      slide = pptx.addSlide();
      slide.addText(block.text, {
        x: 0.6, y: 0.5, w: 8.8, h: 0.6,
        fontSize: 24, bold: true, color: '3E3E3E', fontFace: FONT_STACK,
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.6, y: 1.15, w: 0.7, h: 0.045,
        fill: { color: BRAND.accent.replace('#', '') },
      });
    } else if (block.type === 'rule') {
      continue;
    } else if (slide) {
      // PowerPoint bullets stop being readable past ~9 per slide.
      if (bullets.length >= 9) {
        flush();
        slide = pptx.addSlide();
        slide.addText('(continued)', {
          x: 0.6, y: 0.5, w: 8.8, h: 0.6,
          fontSize: 18, color: '9A9DAA', fontFace: FONT_STACK,
        });
      }
      bullets.push(block.text);
    }
  }
  flush();

  // pptxgenjs types the nodebuffer case loosely; it does return a Buffer.
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as unknown;
  return out as Buffer;
}

// ── XLSX ────────────────────────────────────────────────────────

/**
 * Pro forma workbook.
 *
 * Ships the INPUTS and the FORMULAS, never invented numbers. Every assumption
 * cell is blank and highlighted — the model computes once the user fills in
 * their own figures. A pro forma pre-populated with plausible-looking rates
 * and heat rates is exactly the artifact that ends up in a customer's inbox
 * with fabricated economics in it.
 */
export async function generateProForma(deal: Deal): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet('Pro Forma');
  ws.columns = [
    { key: 'label', width: 38 },
    { key: 'value', width: 18 },
    { key: 'unit', width: 14 },
    { key: 'note', width: 52 },
  ];

  const titleRow = ws.addRow([`${deal.company} — Economic Model`, '', '', '']);
  titleRow.font = { size: 15, bold: true, color: { argb: 'FF3E3E3E' } };
  ws.addRow([`${deal.deal_id} · ${deal.vertical} · ${deal.state ?? '—'}`, '', '', '']).font =
    { size: 10, color: { argb: 'FF767676' } };
  ws.addRow([]);

  const warn = ws.addRow([
    'ALL ASSUMPTION CELLS ARE INTENTIONALLY BLANK — fill in with verified figures.',
    '', '', '',
  ]);
  warn.font = { bold: true, color: { argb: 'FFC0392B' } };
  ws.addRow([]);

  const section = (name: string) => {
    const row = ws.addRow([name, '', '', '']);
    row.font = { bold: true, size: 11, color: { argb: 'FF3CAD3A' } };
    return row;
  };

  const input = (label: string, unit: string, note: string) => {
    const row = ws.addRow([label, null, unit, note]);
    const cell = row.getCell(2);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF6D6' },
    };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
    row.getCell(4).font = { size: 9, color: { argb: 'FF767676' } };
    return row.number;
  };

  section('SYSTEM');
  const rSize = input('System size', 'MW', deal.size_mw ? `Spine records ${deal.size_mw} MW` : 'From the site load study');
  const rCapacity = input('Capacity factor', '%', 'Expected annual availability');
  const rHours = ws.addRow(['Annual operating hours', { formula: `${rCapacity ? `B${rCapacity}` : '0'}*8760` }, 'hrs', 'Derived']).number;

  section('ENERGY');
  const rOutput = ws.addRow([
    'Annual output',
    { formula: `B${rSize}*1000*B${rHours}` },
    'kWh',
    'Derived: MW × 1000 × operating hours',
  ]).number;

  section('COST — GRID BASELINE');
  const rGridRate = input('Current blended rate', '$/kWh', 'The customer\'s actual tariff — not a state average');
  const rEscalation = input('Annual escalation', '%', 'From the utility\'s authorized rate trajectory');
  const rGridCost = ws.addRow([
    'Year 1 grid cost',
    { formula: `B${rOutput}*B${rGridRate}` },
    'US$',
    'Derived',
  ]).number;

  section('COST — ON-SITE');
  const rPpa = input('PPA rate', '$/kWh', 'Contracted rate');
  const rOnsite = ws.addRow([
    'Year 1 on-site cost',
    { formula: `B${rOutput}*B${rPpa}` },
    'US$',
    'Derived',
  ]).number;

  section('RESULT');
  const rSavings = ws.addRow([
    'Year 1 delta',
    { formula: `B${rGridCost}-B${rOnsite}` },
    'US$',
    'Positive = on-site is cheaper in year 1',
  ]).number;
  ws.getRow(rSavings).font = { bold: true };

  ws.addRow([
    'Term',
    null,
    'years',
    'Contract term',
  ]);
  const rTerm = ws.lastRow!.number;
  ws.getRow(rTerm).getCell(2).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6D6' },
  };

  const totalRow = ws.addRow([
    'Term value (undiscounted, with escalation)',
    {
      formula:
        `IF(OR(B${rTerm}="",B${rEscalation}=""),"",` +
        `B${rGridCost}*IF(B${rEscalation}=0,B${rTerm},((1+B${rEscalation})^B${rTerm}-1)/B${rEscalation})` +
        `-B${rOnsite}*B${rTerm})`,
    },
    'US$',
    'Escalating grid cost vs. flat PPA. Undiscounted — add a discount rate for NPV.',
  ]);
  totalRow.font = { bold: true, color: { argb: 'FF3CAD3A' } };

  ws.addRow([]);
  ws.addRow([
    'Generated by PowerDeal. Every figure above is either blank or derived from a blank.',
    '', '', '',
  ]).font = { italic: true, size: 9, color: { argb: 'FF9A9DAA' } };
  ws.addRow([
    'Nothing here is a Bloom Energy quote. Do not send to a customer without pricing review.',
    '', '', '',
  ]).font = { italic: true, size: 9, color: { argb: 'FFC0392B' } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function contentTypeFor(format: ForgeFormat): string {
  switch (format) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'md':
      return 'text/markdown; charset=utf-8';
    case 'pdf':
      return 'application/pdf';
  }
}

export function filenameFor(deal: Deal, action: string, format: ForgeFormat): string {
  const slug = deal.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${action}-${date}.${format}`;
}
