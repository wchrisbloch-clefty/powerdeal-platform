import Parser from 'rss-parser';

/**
 * Open-web search — ported from The Hub.
 *
 * Google News RSS as the primary (real recent articles, no key), DuckDuckGo
 * Instant Answer as fallback. This reaches past the configured sources, which
 * is the whole point of the "what the wider web says" block on an entity page:
 * the value is seeing what your curated feed MISSED, so it cannot be drawn from
 * that same feed.
 *
 * Everything this returns is graded independently by the caller. A Google News
 * result is an aggregator hit and can never be better than INFERRED.
 */

const parser = new Parser({ timeout: 8000 });

export interface WebResult {
  title: string;
  desc: string;
  link: string;
  source: string;
}

export async function webSearch(query: string, limit = 8): Promise<WebResult[]> {
  // Primary: Google News RSS search — real recent articles.
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query,
    )}&hl=en-US&gl=US&ceid=US:en`;
    const feed = await parser.parseURL(url);
    const items = feed.items ?? [];
    if (items.length > 0) {
      return items.slice(0, limit).map((item) => ({
        title: (item.title ?? '').trim(),
        desc: (item.contentSnippet ?? item.content ?? '')
          .replace(/<[^>]*>/g, '')
          .slice(0, 200),
        link: item.link ?? '',
        // Google News titles end " - Publisher".
        source: item.title?.match(/\s-\s([^-]+)$/)?.[1]?.trim() ?? 'Google News',
      }));
    }
  } catch {
    /* fall through to DuckDuckGo */
  }

  // Fallback: DuckDuckGo Instant Answer.
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query,
      )}&format=json&no_redirect=1&no_html=1`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        AbstractSource?: string;
        Heading?: string;
        RelatedTopics?: { Text?: string; FirstURL?: string }[];
      };
      const results: WebResult[] = [];
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          desc: data.AbstractText,
          link: data.AbstractURL,
          source: data.AbstractSource || 'Web',
        });
      }
      for (const topic of (data.RelatedTopics ?? []).slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            desc: topic.Text,
            link: topic.FirstURL,
            source: 'DuckDuckGo',
          });
        }
      }
      if (results.length > 0) return results;
    }
  } catch {
    /* ignore */
  }

  return [];
}
