import { fetchWithTimeout } from '@/lib/utils';

/**
 * Layered content fetcher.
 *
 * RSS summaries are often a single truncated sentence, which makes for a poor
 * AI summary. This tries progressively harder to get real body text and gives
 * up gracefully — a failed fetch just means we summarize the RSS snippet.
 */

const UA =
  'Mozilla/5.0 (compatible; PowerDealBot/1.0; +https://powerdeal.app)';

/** Enough text to be worth summarizing. */
const MIN_USEFUL_LENGTH = 400;

export interface FetchedContent {
  text: string;
  strategy: 'rss' | 'article' | 'body';
  truncated: boolean;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer <article>, then <main>, then the whole body. */
function extractMain(html: string): { text: string; strategy: 'article' | 'body' } {
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (article?.[1]) {
    const text = stripTags(article[1]);
    if (text.length >= MIN_USEFUL_LENGTH) return { text, strategy: 'article' };
  }

  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (main?.[1]) {
    const text = stripTags(main[1]);
    if (text.length >= MIN_USEFUL_LENGTH) return { text, strategy: 'article' };
  }

  return { text: stripTags(html), strategy: 'body' };
}

/**
 * Fetch article text, falling back to the RSS snippet.
 *
 * Never throws — the caller always gets something summarizable.
 */
export async function fetchContent(
  url: string,
  rssFallback: string,
  maxChars = 8000,
): Promise<FetchedContent> {
  const fallback = (): FetchedContent => ({
    text: rssFallback.slice(0, maxChars),
    strategy: 'rss',
    truncated: rssFallback.length > maxChars,
  });

  if (rssFallback.length >= 2500) {
    // The feed already gave us a full body — don't hit the publisher again.
    return fallback();
  }

  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } },
      10000,
    );

    if (!res.ok) return fallback();

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return fallback();

    const html = await res.text();
    const { text, strategy } = extractMain(html);

    if (text.length < MIN_USEFUL_LENGTH || text.length < rssFallback.length) {
      return fallback();
    }

    return {
      text: text.slice(0, maxChars),
      strategy,
      truncated: text.length > maxChars,
    };
  } catch {
    return fallback();
  }
}
