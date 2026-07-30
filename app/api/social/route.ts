import { NextResponse } from 'next/server';
import { getActiveVertical } from '@/lib/active-vertical';
import { fetchSources, withinHours, sortByRecency } from '@/lib/engine/rss';
import { findCoverageGaps } from '@/lib/engine/discover';
import { fetchTopicVideos, youtubeConfigured } from '@/lib/engine/youtube';
import { getUserSettings } from '@/lib/data';
import type { SourceConfig } from '@/lib/verticals/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/social — the three social rails in one call.
 *
 *   following : discussion from the discovery nets the reader enabled
 *   trending  : coverage gaps — stories the discovery net found that the
 *               reader's core sources missed entirely
 *   videos    : YouTube results for the watchlist, transcript-backed where
 *               the uploader published a caption track
 */
export async function GET() {
  const vertical = getActiveVertical();
  const settings = await getUserSettings();
  const topics = settings?.watchlist?.topics ?? [
    'SOFC fuel cell industrial',
    'utility rate increase industrial',
    'Class VI carbon sequestration',
  ];

  const core = vertical.sources;
  const discovery = vertical.discovery;
  const social: SourceConfig[] = discovery.filter((s) => s.platform === 'reddit');

  const [coreItems, discoveryItems, socialItems, videos] = await Promise.all([
    fetchSources(core, 5),
    fetchSources(discovery, 3),
    fetchSources(social, 2),
    youtubeConfigured() ? fetchTopicVideos(topics, 2) : Promise.resolve([]),
  ]);

  const gaps = findCoverageGaps(
    withinHours(coreItems, 72),
    withinHours(discoveryItems, 72),
  );

  return NextResponse.json({
    following: sortByRecency(withinHours(socialItems, 72)).slice(0, 25).map((i) => ({
      title: i.title,
      url: i.url,
      source: i.sourceName,
      published: i.publishedAt,
      summary: i.summary.slice(0, 300),
      platform: i.platform,
    })),
    trending: gaps.slice(0, 12).map((g) => ({
      headline: g.headline,
      url: g.url,
      outletCount: g.outletCount,
      outlets: g.outlets,
      published: g.publishedAt,
      reason: g.reason,
    })),
    videos: videos.map((v) => ({
      title: v.title,
      channel: v.channel,
      url: v.url,
      published: v.publishedAt,
      thumbnail: v.thumbnail,
      hasTranscript: v.hasTranscript,
      // Transcript-backed excerpts grade VERIFIED (it's what was said);
      // description-only ones stay INFERRED (it's marketing copy).
      tier: v.hasTranscript ? 'verified' : 'inferred',
      excerpt: (v.transcript ?? v.description).slice(0, 400),
    })),
    topics,
    youtubeConfigured: youtubeConfigured(),
  });
}
