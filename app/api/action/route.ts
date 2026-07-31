import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase/admin';
import { getDeals } from '@/lib/data';
import { fetchContent } from '@/lib/engine/fetch-content';
import { summarizeItem } from '@/lib/engine/summarize';
import { mapToAccounts } from '@/lib/engine/tiering';
import { buildHook } from '@/lib/engine/live-feed';
import { canRun } from '@/lib/engine/model-routing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * The lazy half of the summary strategy.
 *
 * The live feed summarizes its top 10 by recency on load. Everything below that
 * carries its feed snippet until someone actually opens it, and this is what
 * they get when they do: the real AI summary plus the outreach hook if the item
 * maps to a deal.
 *
 * A story nobody opens never costs a token. A story one person opens costs a
 * fraction of a cent, once — and lands in the summary cache, so the sweep and
 * every later load reuse it for free.
 */

const Body = z.object({
  title: z.string().min(1).max(500),
  url: z.string().url().optional(),
  /** Feed snippet — used when the article body can't be fetched. */
  body: z.string().max(20_000).optional(),
  source: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: deals } = await getDeals();

  // Only fetch the article when the snippet is too thin to summarize well.
  let text = parsed.body ?? '';
  if (parsed.url) {
    try {
      const content = await fetchContent(parsed.url, text);
      text = content.text || text;
    } catch {
      // Paywalled, blocked or slow — the snippet is still something.
    }
  }

  const matches = mapToAccounts(
    {
      title: parsed.title,
      summary: parsed.body ?? '',
      content: text,
      category: parsed.category ?? '',
    },
    deals,
  );
  const action = matches.length > 0 ? buildHook(matches, parsed.source ?? 'Feed') : null;

  if (!canRun('summarize')) {
    // Honest empty: no model configured. The caller keeps the snippet it has
    // rather than showing a fabricated summary, but still gets the hook.
    return NextResponse.json({ synthesis: null, action, dealIds: matches.map((m) => m.dealId) });
  }

  let synthesis: string | null = null;
  try {
    const summary = await summarizeItem(
      {
        title: parsed.title,
        content: text || parsed.title,
        url: parsed.url,
        source: parsed.source,
      },
      'summary',
      getAdminClient(),
    );
    // The prompt returns this sentinel for off-topic items rather than
    // manufacturing relevance.
    if (summary.text.trim() !== 'NOT RELEVANT') synthesis = summary.text;
  } catch (err) {
    console.warn('[action] summarize failed:', (err as Error).message);
  }

  return NextResponse.json({
    synthesis,
    action,
    dealIds: matches.map((m) => m.dealId),
  });
}
