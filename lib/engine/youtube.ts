import { fetchWithTimeout } from '@/lib/utils';

/**
 * YouTube Data API v3 — search plus real caption tracks.
 *
 * The point is transcripts, not descriptions: a video's show notes are
 * marketing copy, its transcript is what was actually said. Items backed by a
 * real transcript grade higher than ones backed only by a description, and the
 * `hasTranscript` flag carries that distinction downstream.
 */

export interface YouTubeItem {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnail: string | null;
  transcript: string | null;
  hasTranscript: boolean;
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

interface SearchResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string } };
    };
  }[];
}

/** Search for videos on a topic within a recency window. */
export async function searchVideos(
  topic: string,
  maxResults = 5,
  publishedAfterDays = 30,
): Promise<YouTubeItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const after = new Date(Date.now() - publishedAfterDays * 86400_000).toISOString();
  const params = new URLSearchParams({
    key,
    part: 'snippet',
    q: topic,
    type: 'video',
    order: 'relevance',
    maxResults: String(Math.min(maxResults, 10)),
    publishedAfter: after,
    relevanceLanguage: 'en',
  });

  try {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { headers: { Accept: 'application/json' } },
      12000,
    );
    if (!res.ok) {
      console.warn(`[youtube] search ${res.status} for "${topic}"`);
      return [];
    }

    const json = (await res.json()) as SearchResponse;

    return (json.items ?? []).flatMap((item): YouTubeItem[] => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet?.title) return [];

      return [
        {
          videoId,
          title: snippet.title,
          channel: snippet.channelTitle ?? 'Unknown channel',
          description: snippet.description ?? '',
          publishedAt: snippet.publishedAt ?? new Date().toISOString(),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: snippet.thumbnails?.medium?.url ?? null,
          transcript: null,
          hasTranscript: false,
        },
      ];
    });
  } catch (err) {
    console.warn('[youtube] search failed:', (err as Error).message);
    return [];
  }
}

/**
 * Fetch the caption track for a video.
 *
 * The Data API's `captions.download` endpoint requires OAuth as the video
 * OWNER — an API key cannot download third-party captions. The timedtext
 * endpoint below is the only keyless path, and it works only when the uploader
 * published a public track. Returning null is the common case, and callers
 * fall back to the description with a lower grade.
 */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`,
      { headers: { 'User-Agent': 'PowerDealBot/1.0' } },
      10000,
    );
    if (!res.ok) return null;

    const text = await res.text();
    if (!text.trim()) return null;

    const json = JSON.parse(text) as {
      events?: { segs?: { utf8?: string }[] }[];
    };

    const transcript = (json.events ?? [])
      .flatMap((e) => e.segs ?? [])
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    return transcript.length > 200 ? transcript : null;
  } catch {
    return null;
  }
}

/** Search plus best-effort transcript enrichment. */
export async function fetchTopicVideos(
  topics: string[],
  perTopic = 3,
): Promise<YouTubeItem[]> {
  if (!youtubeConfigured()) return [];

  const all: YouTubeItem[] = [];

  // Sequential: YouTube's free quota is 10k units/day and search costs 100
  // per call. Parallelizing here burns the daily budget in one sweep.
  for (const topic of topics.slice(0, 6)) {
    const videos = await searchVideos(topic, perTopic);
    for (const video of videos) {
      const transcript = await fetchTranscript(video.videoId);
      all.push({
        ...video,
        transcript,
        hasTranscript: transcript !== null,
      });
    }
  }

  // Dedupe — one video can match several watchlist topics.
  const seen = new Set<string>();
  return all.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}
