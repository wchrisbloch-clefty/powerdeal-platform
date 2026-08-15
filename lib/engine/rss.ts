import Parser from 'rss-parser';
import type { SourceConfig } from '@/lib/verticals/types';
import { canonicalUrl, hashString } from '@/lib/utils';
import { FEED_REQUEST_HEADERS } from './feed-headers';
import { relayConfig, relayRequest, shouldRelay, type RelayConfig } from './feed-relay';

/**
 * RSS ingestion. Every source in the vertical config is an open feed — no
 * walled APIs, no keys. A feed that 404s or times out is skipped with a
 * warning; one dead publisher never fails a sweep.
 */

export interface RawItem {
  /** Stable dedupe key: hash of the canonical URL. */
  key: string;
  title: string;
  url: string;
  summary: string;
  content: string;
  byline: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  sourceId: string;
  sourceName: string;
  category: string;
  platform: string;
  defaultTier: SourceConfig['defaultTier'];
  role: SourceConfig['role'];
}

const parser: Parser<Record<string, unknown>, Record<string, unknown>> = new Parser({
  timeout: 12000,
  // Shared with the health probe so green there means readable here.
  headers: FEED_REQUEST_HEADERS,
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'dcCreator'],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickImage(item: Record<string, unknown>): string | null {
  const media = item.mediaContent as { $?: { url?: string } } | undefined;
  if (media?.$?.url) return media.$.url;
  const thumb = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (thumb?.$?.url) return thumb.$.url;
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && enclosure.type?.startsWith('image/')) return enclosure.url;

  // Last resort: first <img> in the body HTML.
  const body = (item.contentEncoded ?? item.content ?? '') as string;
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(body);
  return match?.[1] ?? null;
}

/** Fetch and normalize one source. Returns [] on any failure. */
export async function fetchSource(source: SourceConfig): Promise<RawItem[]> {
  try {
    // A `blocked` source reaches us only when a relay is configured — see
    // resolveSources. Fetched by hand and parsed from the string, because
    // parseURL does its own fetch and cannot carry the relay's auth header.
    const config = relayConfig();
    const feed = shouldRelay(source, config)
      ? await parser.parseString(await fetchThroughRelay(source.url, config))
      : await parser.parseURL(source.url);
    const items = feed.items ?? [];

    return items.flatMap((item): RawItem[] => {
      const rawLink = (item.link as string | undefined)?.trim();
      const title = (item.title as string | undefined)?.trim();
      if (!rawLink || !title) return [];

      const url = canonicalUrl(rawLink);
      const bodyHtml = (item.contentEncoded ?? item.content ?? '') as string;
      const snippet =
        (item.contentSnippet as string | undefined) ?? stripHtml(bodyHtml);

      let publishedAt: string | null = null;
      const dateStr = (item.isoDate ?? item.pubDate) as string | undefined;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
      }

      return [
        {
          key: hashString(url),
          title: stripHtml(title),
          url,
          summary: snippet.slice(0, 600),
          content: stripHtml(bodyHtml) || snippet,
          byline:
            ((item.dcCreator ?? item.creator ?? item.author) as string | undefined) ??
            null,
          imageUrl: pickImage(item),
          publishedAt,
          sourceId: source.id,
          sourceName: source.name,
          category: source.category,
          platform: source.platform,
          defaultTier: source.defaultTier,
          role: source.role,
        },
      ];
    });
  } catch (err) {
    console.warn(`[rss] ${source.name} (${source.id}) failed:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetch many sources with bounded concurrency. Publishers rate-limit, and an
 * unbounded Promise.all across 20 feeds reliably trips them.
 */
export async function fetchSources(
  sources: SourceConfig[],
  concurrency = 5,
): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const queue = [...sources];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;
      out.push(...(await fetchSource(source)));
    }
  });

  await Promise.all(workers);
  return dedupe(out);
}

/**
 * Fetch one URL through the relay.
 *
 * Throws on anything but a 2xx, so the caller's existing catch records it as a
 * source failure exactly like a direct fetch would. The relay's own status
 * codes are distinguishable in the message — a 403 from the WORKER means the
 * allowlist rejected the host, which is a configuration finding and not a
 * publisher blocking us again.
 */
async function fetchThroughRelay(url: string, config: RelayConfig): Promise<string> {
  const request = relayRequest(url, config);
  if (!request) throw new Error('Relay is not usable.');

  const res = await fetch(request.url, { headers: request.headers });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Relay ${res.status} for ${url}: ${body}`);
  }
  return res.text();
}

/** Collapse items that appear in more than one feed, newest wins. */
export function dedupe(items: RawItem[]): RawItem[] {
  const byKey = new Map<string, RawItem>();
  for (const item of items) {
    const existing = byKey.get(item.key);
    if (!existing) {
      byKey.set(item.key, item);
      continue;
    }
    const a = existing.publishedAt ? Date.parse(existing.publishedAt) : 0;
    const b = item.publishedAt ? Date.parse(item.publishedAt) : 0;
    if (b > a) byKey.set(item.key, item);
  }
  return [...byKey.values()];
}

export function sortByRecency(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => {
    const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bt - at;
  });
}

/** Items published within the last N hours — the sweep window. */
export function withinHours(items: RawItem[], hours: number): RawItem[] {
  const cutoff = Date.now() - hours * 3600_000;
  return items.filter((i) => {
    if (!i.publishedAt) return true; // undated: let tiering decide
    return Date.parse(i.publishedAt) >= cutoff;
  });
}
