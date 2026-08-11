import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { generatePdf, markdownToHtml, pdfHtml } from '@/lib/forge/pdf';
import { PALETTE, WORDMARK } from '@/lib/forge/theme';

/**
 * PDF EXPORT.
 *
 * Everything rendered here was written by a model and is going to a customer.
 * That combination is why the renderer is deliberately small: a permissive
 * markdown library would happily emit raw HTML, an image tag pointing anywhere,
 * or a script into a document nobody inspects before sending. The escaping
 * tests below are the point of this file, not a formality.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

describe('the renderer escapes before it formats', () => {
  it('escapes raw HTML rather than passing it through', () => {
    const html = markdownToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes an image tag pointing off-host', () => {
    // A model that echoed a URL from a source document must not turn it into
    // a request the reader's PDF viewer makes.
    const html = markdownToHtml('![x](https://elsewhere.example/track.png)');
    expect(html).not.toMatch(/<img/i);
  });

  it('escapes attribute-breaking quotes in the title', () => {
    const html = pdfHtml({ title: 'A" onload="x', subtitle: 's', body: '' });
    expect(html).not.toContain('onload="x');
    expect(html).toContain('&quot;');
  });

  it('still emits the two marks the generators actually produce', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('some *emphasis* here')).toContain('<em>emphasis</em>');
  });

  it('does not let bold smuggle a tag through', () => {
    const html = markdownToHtml('**<b>x</b>**');
    expect(html).toContain('<strong>');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('the structures the generators emit', () => {
  it('renders headings at three levels', () => {
    const html = markdownToHtml('# One\n## Two\n### Three');
    expect(html).toContain('<h1>One</h1>');
    expect(html).toContain('<h2>Two</h2>');
    expect(html).toContain('<h3>Three</h3>');
  });

  it('opens and closes a list exactly once around its items', () => {
    const html = markdownToHtml('- a\n- b\n\nafter');
    expect((html.match(/<ul>/g) ?? [])).toHaveLength(1);
    expect((html.match(/<\/ul>/g) ?? [])).toHaveLength(1);
    expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('<p>after</p>'));
  });

  it('closes a list left open at the end of the document', () => {
    const html = markdownToHtml('- a\n- b');
    expect(html.trimEnd().endsWith('</ul>')).toBe(true);
  });

  it('renders the negative header rule as a rule, not as text', () => {
    expect(markdownToHtml('---')).toBe('<hr />');
  });
});

describe('the page is the same brand system as the document', () => {
  it('reads the palette rather than restating hexes', async () => {
    const src = await readFile('lib/forge/pdf.ts', 'utf8');
    // A fourth place the brand can drift is a fourth place it will.
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}[^`]/);
    expect(src).toContain('PALETTE.charcoal');
  });

  it('carries the wordmark and no partner mark', () => {
    const html = pdfHtml({ title: 't', subtitle: 's', body: '' });
    expect(html).toContain(WORDMARK);
    expect(html).not.toMatch(/Bloom/i);
  });

  it('uses green as a rule only, never behind type', () => {
    const html = pdfHtml({ title: 't', subtitle: 's', body: '' });
    const greenRules = html.split('\n').filter((l) => l.includes(PALETTE.bloom));
    expect(greenRules.length).toBeGreaterThan(0);
    for (const rule of greenRules) {
      expect(rule, 'green used as a text colour').not.toMatch(/(^|[^-])color:/);
    }
  });

  it('matches the DOCX header band at 0.65in', () => {
    expect(pdfHtml({ title: 't', subtitle: 's', body: '' })).toContain('height: 0.65in');
  });
});

describe('it produces an actual PDF', () => {
  it('renders both page sizes', async () => {
    process.env.PDF_CHROMIUM_PATH = CHROME;
    const md = '# Heading\n- one\n- two\n\n**bold** text\n';
    for (const size of ['Letter', 'A4'] as const) {
      const buf = await generatePdf('T', 'S', md, size);
      expect(buf.subarray(0, 5).toString(), `${size} is not a PDF`).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(1000);
    }
  }, 60_000);

  it('says something useful when no browser is configured', async () => {
    // Rather than a missing-library error that names nothing actionable.
    const saved = process.env.PDF_CHROMIUM_PATH;
    delete process.env.PDF_CHROMIUM_PATH;
    await expect(generatePdf('T', 'S', '# x')).rejects.toThrow(/No local Chromium configured/);
    process.env.PDF_CHROMIUM_PATH = saved;
  });
});

describe('the route no longer refuses', () => {
  it('has dropped the 501 and calls the generator', async () => {
    const src = await readFile('app/api/forge/route.ts', 'utf8');
    expect(src).not.toContain('PDF export is not wired up yet');
    expect(src).toContain('generatePdf(title, subtitle, body.content');
  });

  it('takes a page size, defaulting to Letter', async () => {
    const src = await readFile('app/api/forge/route.ts', 'utf8');
    expect(src).toContain("z.enum(['Letter', 'A4'])");
    expect(src).toContain("body.pageSize ?? 'Letter'");
  });

  it('streams the file rather than depending on a storage bucket', async () => {
    // Storage belongs to the share route, where an artifact outlives the
    // request. Folding it in here would make a download depend on a bucket
    // that does not exist yet.
    // The comment explaining WHY there is no bucket is allowed to say the
    // word; calling one is what must not happen.
    const src = await readFile('lib/forge/pdf.ts', 'utf8');
    expect(src).not.toMatch(/\.storage\b|createClient|getAdminClient/);
  });

  it('always closes the browser', async () => {
    const src = await readFile('lib/forge/pdf.ts', 'utf8');
    expect(src).toContain('} finally {');
    expect(src).toContain('await browser.close()');
  });
});
