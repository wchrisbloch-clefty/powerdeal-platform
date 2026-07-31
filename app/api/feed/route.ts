import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeals } from '@/lib/data';
import { canonicalUrl, hashString } from '@/lib/utils';
import { summarizeItem } from '@/lib/engine/summarize';
import { mapToAccounts } from '@/lib/engine/tiering';
import { canRun } from '@/lib/engine/model-routing';
import { getLiveFeed } from '@/lib/engine/live-feed';

export const dynamic = 'force-dynamic';
// Ten feeds and up to ten eager summaries on a cold cache.
export const maxDuration = 60;

/**
 * GET /api/feed — the live feed.
 *
 * Fetches the configured sources on every call (behind a ~10 minute cache) and
 * falls back to seed if every one of them is unreachable. It never returns an
 * empty list and never waits on a sweep: the sweep's job is now persistence for
 * trends and the weekly recap, not filling this response.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const category = p.get('category');
  const limit = Math.min(Number(p.get('limit') ?? 40), 100);
  const offset = Math.max(Number(p.get('offset') ?? 0), 0);

  const { data: deals } = await getDeals();
  const feed = await getLiveFeed(deals, p.get('refresh') === '1');

  let items = feed.items;
  if (category && category !== 'all') items = items.filter((i) => i.category === category);

  return NextResponse.json({
    items: items.slice(offset, offset + limit),
    total: items.length,
    isSeed: feed.isSeed,
    live: feed.live,
    fetchedAt: feed.fetchedAt,
    sourcesFetched: feed.sourcesFetched,
    sourcesFailed: feed.sourcesFailed,
    eagerCount: feed.eagerCount,
  });
}

const Capture = z.object({
  title: z.string().max(500).optional(),
  text: z.string().max(20_000).optional(),
  url: z.string().url().optional(),
  category: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
});

/**
 * POST /api/feed — manual capture.
 *
 * Also the Web Share Target landing point: sharing from LinkedIn or a browser
 * posts here. Everything captured this way is graded INFERRED — a human
 * choosing to share something says it's interesting, not that it's verified.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in to capture items.' }, { status: 401 });
  }

  let parsed: z.infer<typeof Capture>;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('form')) {
      const form = await request.formData();
      parsed = Capture.parse({
        title: form.get('title')?.toString() || undefined,
        text: form.get('text')?.toString() || undefined,
        url: form.get('url')?.toString() || undefined,
      });
    } else {
      parsed = Capture.parse(await request.json());
    }
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const body = parsed.text ?? '';
  const title = parsed.title ?? body.slice(0, 120) ?? 'Captured item';
  if (!title.trim() && !body.trim() && !parsed.url) {
    return NextResponse.json({ error: 'Nothing to capture.' }, { status: 400 });
  }

  const url = parsed.url ? canonicalUrl(parsed.url) : null;

  let synthesis: string | null = body.slice(0, 400) || null;
  if (canRun('summarize') && (body.length > 200 || url)) {
    try {
      const summary = await summarizeItem(
        { title, content: body || title, url: url ?? undefined, source: 'Manual capture' },
        'summary',
        supabase,
      );
      if (summary.text.trim() !== 'NOT RELEVANT') synthesis = summary.text;
    } catch {
      // Summarization is a nicety here; never lose the capture over it.
    }
  }

  const { data: deals } = await getDeals();
  const matches = mapToAccounts(
    { title, summary: body, content: body, category: parsed.category ?? '' },
    deals,
  );

  const row = {
    title: title.slice(0, 500),
    synthesis,
    tier: 'inferred' as const,
    confidence: 0.5,
    arrival: parsed.platform === 'share' || !parsed.platform ? 'share' : 'manual',
    platform: parsed.platform ?? 'share',
    source_name: url ? new URL(url).hostname.replace(/^www\./, '') : 'Manual capture',
    url,
    url_hash: hashString(url ?? `${title}-${Date.now()}`),
    published_at: new Date().toISOString(),
    category: parsed.category ?? null,
    deal_ids: matches.map((m) => m.dealId),
    action_tier: 'inferred' as const,
    cached_at: new Date().toISOString(),
    user_id: POWERDEAL_USER_ID,
  };

  const { data, error } = await supabase
    .from('feed_items')
    .upsert(row, { onConflict: 'user_id,url_hash' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
