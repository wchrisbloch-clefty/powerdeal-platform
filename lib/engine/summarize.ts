import type { SupabaseClient } from '@supabase/supabase-js';
import { route, canRun } from './model-routing';
import { hashString, canonicalUrl } from '@/lib/utils';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';

/**
 * AI summarization with a Supabase-backed 24-hour cache.
 *
 * GLOBAL RULE 9: cache aggressively. The same URL is never re-summarized
 * inside the window, so a re-run of a sweep costs zero AI tokens for items
 * already seen.
 */

export const CACHE_TTL_HOURS = 24;

export interface SummarizeInput {
  title: string;
  content: string;
  url?: string;
  /** Source name, used to frame the summary. */
  source?: string;
}

export type SummarizeMode = 'summary' | 'takeaways';

export interface SummarizeResult {
  text: string;
  provider: string;
  cached: boolean;
}

function cacheKey(url: string, mode: SummarizeMode): string {
  return hashString(`${canonicalUrl(url)}::${mode}`);
}

function buildPrompt(item: SummarizeInput, mode: SummarizeMode) {
  const body = item.content.slice(0, 6000);

  if (mode === 'takeaways') {
    return {
      system: POWERDEAL_IDENTITY,
      user: `Extract the takeaways from this item for a BD rep selling behind-the-meter baseload power.

Return 2-4 bullets, each one line. Each bullet must be a fact from the text or a direct consequence of one. No preamble, no closing line.

If the item has no bearing on industrial power, grid cost, emissions, or a named operator, return exactly: NOT RELEVANT

SOURCE: ${item.source ?? 'unknown'}
TITLE: ${item.title}

${body}`,
      maxTokens: 400,
      promptCache: false,
    };
  }

  return {
    system: POWERDEAL_IDENTITY,
    user: `Summarize this item in exactly two sentences for a BD rep selling behind-the-meter baseload power.

Sentence 1: what happened.
Sentence 2: why it moves a deal — cost, reliability, emissions, permitting, or a named operator.

Only state figures that appear in the text. Never estimate a rate, price, capacity, or timeline. If the item is not relevant to industrial power, return exactly: NOT RELEVANT

SOURCE: ${item.source ?? 'unknown'}
TITLE: ${item.title}

${body}`,
    maxTokens: 300,
    promptCache: false,
  };
}

/**
 * Summarize one item, reading through the feed_items cache.
 *
 * Cache hit  → returns immediately, zero tokens.
 * Cache miss → routes through summarize (Groq → Gemini → Claude) and stores.
 */
export async function summarizeItem(
  item: SummarizeInput,
  mode: SummarizeMode = 'summary',
  supabase?: SupabaseClient | null,
): Promise<SummarizeResult> {
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();

  // ── Cache read ──
  if (supabase && item.url) {
    const canonical = canonicalUrl(item.url);
    const { data } = await supabase
      .from('feed_items')
      .select('synthesis, cached_at')
      .eq('url', canonical)
      .gte('cached_at', cutoff)
      .not('synthesis', 'is', null)
      .limit(1)
      .maybeSingle();

    if (data?.synthesis) {
      return { text: data.synthesis, provider: 'cache', cached: true };
    }
  }

  // ── Miss: generate ──
  if (!canRun('summarize')) {
    // Zero AI keys — fall back to the lede so the feed still reads.
    const lede = item.content.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    return {
      text: lede.slice(0, 400) || item.title,
      provider: 'none',
      cached: false,
    };
  }

  const { text, provider } = await route('summarize', buildPrompt(item, mode));
  return { text, provider, cached: false };
}

/** Cache key exposed for callers that want to pre-check without a round trip. */
export function summaryCacheKey(url: string, mode: SummarizeMode = 'summary'): string {
  return cacheKey(url, mode);
}

/** True when this item's summary is still inside the cache window. */
export function isFresh(cachedAt: string | null | undefined): boolean {
  if (!cachedAt) return false;
  return Date.now() - Date.parse(cachedAt) < CACHE_TTL_HOURS * 3600_000;
}
