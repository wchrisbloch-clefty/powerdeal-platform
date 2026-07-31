import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDeal } from '@/lib/data';
import {
  generateDocx, generatePptx, generateProForma,
  contentTypeFor, filenameFor, type ForgeFormat,
} from '@/lib/forge/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({
  dealId: z.string(),
  action: z.string().max(40),
  format: z.enum(['docx', 'pptx', 'xlsx', 'md', 'pdf']),
  /** The already-streamed AI output. */
  content: z.string().max(200_000).optional(),
  title: z.string().max(200).optional(),
});

/**
 * POST /api/forge — render generated text into a real file.
 *
 * The AI output is streamed to the browser first via /api/ai, then posted back
 * here for rendering. That keeps generation visible while it happens instead of
 * a silent 60-second wait on a download.
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: deal } = await getDeal(body.dealId);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const format = body.format as ForgeFormat;

  // PDF needs a headless browser. Rather than ship a broken button, the UI
  // hides the PDF option and this returns a clear reason if it's called.
  if (format === 'pdf') {
    return NextResponse.json(
      {
        error:
          'PDF export is not wired up yet. Feasibility IS confirmed: @sparticuz/chromium + puppeteer-core trace to 70.1 MB against Vercel\'s 250 MB limit (measured 2026-07-31), and next.config.ts already force-includes the binary the tracer would otherwise miss. What remains is the HTML template, the two page sizes, and Supabase Storage. Export DOCX in the meantime.',
      },
      { status: 501 },
    );
  }

  const title = body.title ?? `${deal.company} — ${body.action}`;
  const subtitle = `${deal.deal_id} · ${deal.vertical}${deal.state ? ` · ${deal.state}` : ''} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  try {
    let buffer: Buffer;

    if (format === 'xlsx') {
      // The pro forma is built from the deal record, not from prose.
      buffer = await generateProForma(deal);
    } else {
      if (!body.content?.trim()) {
        return NextResponse.json(
          { error: 'No content to render — generate the document first.' },
          { status: 400 },
        );
      }
      if (format === 'md') {
        buffer = Buffer.from(`# ${title}\n\n_${subtitle}_\n\n${body.content}\n`, 'utf-8');
      } else if (format === 'pptx') {
        buffer = await generatePptx(title, subtitle, body.content);
      } else {
        buffer = await generateDocx(title, subtitle, body.content);
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentTypeFor(format),
        'Content-Disposition': `attachment; filename="${filenameFor(deal, body.action, format)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[forge] generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Document generation failed.' },
      { status: 500 },
    );
  }
}
