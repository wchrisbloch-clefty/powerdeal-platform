import { NextResponse } from 'next/server';
import { webSearch } from '@/lib/engine/web-search';
import { classifyExternal } from '@/lib/engine/tiering';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/coverage?q= — what the wider web says about an entity.
 *
 * Deliberately tiered with the same classifier as the main feed and rendered
 * apart from it. These results did NOT come from a curated source, so most of
 * them grade INFERRED — showing them next to a FERC filing without that grade
 * would quietly undo the whole provenance spine.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });

  let web: Awaited<ReturnType<typeof webSearch>> = [];
  try {
    web = await webSearch(q);
  } catch (err) {
    console.warn('[coverage] search failed:', (err as Error).message);
  }

  const results = web.slice(0, 8).map((w) => ({
    title: w.title,
    desc: w.desc,
    source: w.source,
    url: w.link,
    tier: classifyExternal({
      title: w.title,
      url: w.link,
      source: w.source,
      desc: w.desc,
    }).tier,
  }));

  return NextResponse.json({ results });
}
