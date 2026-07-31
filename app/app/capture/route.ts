import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeals } from '@/lib/data';
import { canonicalUrl, hashString } from '@/lib/utils';
import { summarizeItem } from '@/lib/engine/summarize';
import { mapToAccounts } from '@/lib/engine/tiering';
import { canRun } from '@/lib/engine/model-routing';

export const dynamic = 'force-dynamic';

/**
 * Web Share Target landing point.
 *
 * The PWA manifest posts shared content here as multipart/form-data. Android
 * hands off a title, a text body, and/or a URL depending on the source app —
 * LinkedIn sends text plus URL, a browser share sends title plus URL.
 *
 * Always redirects rather than returning JSON: the user is looking at a share
 * sheet, and the only sensible outcome is landing in the app.
 */
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const supabase = getAdminClient();
  if (!supabase) {
    // /login no longer exists — there is nowhere to send someone to fix this,
    // and a share sheet still expects to land in the app. Carry the reason in
    // the query string so the page can say why nothing was saved.
    return NextResponse.redirect(
      `${origin}/app/intelligence?error=${encodeURIComponent(
        'Supabase is not configured, so the shared item was not saved.',
      )}`,
      { status: 303 },
    );
  }

  try {
    const form = await request.formData();
    const title = form.get('title')?.toString().trim() ?? '';
    const text = form.get('text')?.toString().trim() ?? '';
    const rawUrl = form.get('url')?.toString().trim() ?? '';

    // Some apps put the URL inside `text` rather than `url`.
    const urlFromText = /https?:\/\/\S+/.exec(text)?.[0];
    const url = rawUrl || urlFromText || null;

    if (!title && !text && !url) {
      return NextResponse.redirect(`${origin}/app/intelligence?capture=empty`, {
        status: 303,
      });
    }

    const canonical = url ? canonicalUrl(url) : null;
    const headline = title || text.slice(0, 120) || canonical || 'Shared item';

    let synthesis: string | null = text.slice(0, 400) || null;
    if (canRun('summarize') && (text.length > 200 || canonical)) {
      try {
        const summary = await summarizeItem(
          {
            title: headline,
            content: text || headline,
            url: canonical ?? undefined,
            source: 'Shared',
          },
          'summary',
          supabase,
        );
        if (summary.text.trim() !== 'NOT RELEVANT') synthesis = summary.text;
      } catch {
        // Losing the summary is fine. Losing the capture is not.
      }
    }

    const { data: deals } = await getDeals();
    const matches = mapToAccounts(
      { title: headline, summary: text, content: text, category: '' },
      deals,
    );

    await supabase.from('feed_items').upsert(
      {
        title: headline.slice(0, 500),
        synthesis,
        // A human sharing something means it's interesting, not verified.
        tier: 'inferred',
        confidence: 0.5,
        arrival: 'share',
        platform: detectPlatform(canonical),
        source_name: canonical
          ? new URL(canonical).hostname.replace(/^www\./, '')
          : 'Shared',
        url: canonical,
        url_hash: hashString(canonical ?? `${headline}-${Date.now()}`),
        published_at: new Date().toISOString(),
        deal_ids: matches.map((m) => m.dealId),
        action_tier: 'inferred',
        cached_at: new Date().toISOString(),
        user_id: POWERDEAL_USER_ID,
      },
      { onConflict: 'user_id,url_hash' },
    );

    return NextResponse.redirect(`${origin}/app/intelligence?capture=ok`, {
      status: 303,
    });
  } catch (err) {
    console.warn('[capture] failed:', err);
    return NextResponse.redirect(`${origin}/app/intelligence?capture=error`, {
      status: 303,
    });
  }
}

function detectPlatform(url: string | null): string {
  if (!url) return 'share';
  const host = url.toLowerCase();
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('reddit.com')) return 'reddit';
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  return 'share';
}
