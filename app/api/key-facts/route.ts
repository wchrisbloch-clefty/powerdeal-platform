import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDeals } from '@/lib/data';
import { getKeyFacts, putKeyFacts } from '@/lib/item-extras';
import { hashString } from '@/lib/utils';
import { fetchContent } from '@/lib/engine/fetch-content';
import { route, canRun } from '@/lib/engine/model-routing';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';
import type { Deal } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI KEY FACTS — the depth layer's reasoning step.
 *
 * This is NOT field extraction. Nothing here parses a number out of a page. It
 * reads the article and writes the three-to-five things that actually matter to
 * someone selling behind-the-meter baseload, which is a judgment call about
 * relevance — so it routes to Claude rather than the cheap summarize tier.
 * Groq will happily produce five true, useless sentences.
 *
 * ── The hard rule ──
 * These bullets get copy-pasted into customer-facing briefs. A fabricated
 * figure in front of a plant manager is unrecoverable, so the prompt forbids
 * inferring, estimating or rounding any number not in the source, and the
 * response is checked for the one failure mode that survives a good prompt:
 * a thin body producing confident-sounding specifics. When the fetched article
 * is too short to support facts, we say so instead of synthesizing from the
 * headline.
 */

/** Below this, the "article" is a headline and a teaser, not a source. */
const THIN_BODY_CHARS = 600;

const Body = z.object({
  title: z.string().min(1).max(500),
  url: z.string().url().optional(),
  /** Feed snippet, used when the article body cannot be fetched. */
  summary: z.string().max(20_000).optional(),
  /** The item's stable key (url_hash). Cache is keyed on it. */
  itemKey: z.string().max(120).optional(),
  source: z.string().max(200).optional(),
  dealIds: z.array(z.string().max(80)).max(10).optional(),
});

export interface KeyFactsResult {
  facts: string[];
  /** True when the body was too thin to do better than the summary. */
  thin: boolean;
  note: string | null;
  model: string | null;
}

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

  if (!canRun('intel')) {
    return NextResponse.json(
      {
        error:
          'Key facts need ANTHROPIC_API_KEY. This is judgment about what matters, so it is not routed to a cheaper model.',
      },
      { status: 503 },
    );
  }

  // ── Cache read: first generation is the only generation ──
  const cacheKey = parsed.itemKey ?? (parsed.url ? hashString(parsed.url) : null);
  if (cacheKey) {
    const cached = await getKeyFacts(cacheKey);
    if (cached?.facts?.length) return NextResponse.json({ ...cached, cached: true });
  }

  // ── Body ──
  let text = parsed.summary ?? '';
  let thin = false;
  if (parsed.url) {
    try {
      const content = await fetchContent(parsed.url, text);
      text = content.text || text;
    } catch {
      // Paywalled, blocked, or slow.
    }
  }
  if (text.trim().length < THIN_BODY_CHARS) thin = true;

  // ── Account context ──
  let accountContext = '';
  if (parsed.dealIds?.length) {
    const { data: deals } = await getDeals();
    const mapped = deals.filter((d) => parsed.dealIds!.includes(d.id));
    if (mapped.length > 0) accountContext = mapped.map(describeDeal).join('\n\n');
  }

  const user = [
    `Read this article and write the key facts a BD professional selling behind-the-meter SOFC baseload power needs to know.`,
    ``,
    `3-5 bullets. Each one a complete, plain sentence. Lead with the fact, then why it matters commercially.`,
    ``,
    `Include specific figures, dates, and named parties WHERE THE ARTICLE STATES THEM. Never infer, estimate, or round a number that is not in the source. If a figure is absent, write around it — do not invent it.`,
    ``,
    accountContext
      ? `If the article touches a pipeline account, say what it means for that account in one sentence.`
      : ``,
    thin
      ? `\nThe full article body could NOT be retrieved — you are working from a short summary. Write only what that summary supports, and do not manufacture specifics to fill the space. Fewer bullets is correct here.`
      : ``,
    ``,
    `Return ONLY the bullets, one per line, each starting with "- ". No preamble, no heading, no closing line.`,
    ``,
    `ARTICLE`,
    `TITLE: ${parsed.title}`,
    parsed.source ? `SOURCE: ${parsed.source}` : '',
    parsed.url ? `URL: ${parsed.url}` : '',
    ``,
    text.slice(0, 12_000) || parsed.title,
    accountContext ? `\n\nACCOUNT CONTEXT\n${accountContext}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  let raw: string;
  let model: string | null = null;
  try {
    const result = await route('intel', { system: POWERDEAL_IDENTITY, user, maxTokens: 700 });
    raw = result.text;
    model = result.provider ?? null;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Key facts failed.' },
      { status: 502 },
    );
  }

  const facts = raw
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter((line) => line.length > 12)
    .slice(0, 5);

  if (facts.length === 0) {
    return NextResponse.json({
      facts: [],
      thin,
      note: 'The model returned nothing usable for this item.',
      model,
    });
  }

  const payload: KeyFactsResult = {
    facts,
    thin,
    note: thin
      ? 'Full text unavailable — facts below are from the summary only.'
      : null,
    model,
  };

  // Cache write is best-effort: losing it costs one regeneration, and the facts
  // are already on their way back to the reader either way.
  if (cacheKey) {
    try {
      await putKeyFacts(cacheKey, { ...payload, at: new Date().toISOString() });
    } catch (err) {
      console.warn('[key-facts] cache write skipped:', (err as Error).message);
    }
  }

  return NextResponse.json({ ...payload, cached: false });
}

/** Only the fields that change what the facts should say. */
function describeDeal(deal: Deal): string {
  return [
    `${deal.deal_id} — ${deal.company}`,
    `Vertical: ${deal.vertical}`,
    deal.state ? `State: ${deal.state}` : null,
    deal.utility ? `Utility: ${deal.utility}` : null,
    `Stage: ${deal.stage}`,
    deal.identified_pain ? `Known pain: ${deal.identified_pain}` : null,
    deal.key_risk ? `Key risk: ${deal.key_risk}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
