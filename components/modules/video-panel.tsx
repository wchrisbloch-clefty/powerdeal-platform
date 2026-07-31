'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Youtube } from 'lucide-react';
import type { YouTubeItem } from '@/lib/engine/youtube';
import { relativeTime, cn } from '@/lib/utils';
import ProvenanceChip from '@/components/ui/provenance-chip';
import Badge from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';

/**
 * VIDEO — longer-form treatment for transcript-backed items.
 *
 * Video gets its own tab rather than dissolving into the Feed like Reddit and
 * LinkedIn did, because the unit of value is different. A feed card is a
 * headline you scan; a conference talk or an earnings call is forty minutes of
 * someone saying things nobody wrote down. The transcript is the artifact —
 * show notes are marketing copy — so the excerpt and the timestamps get room
 * that a feed card cannot give them.
 *
 * Provenance follows the same rule as everywhere else: a video backed by a real
 * transcript grades REPORTED, one backed only by its description stays
 * INFERRED. What was actually said is evidence; a description is a claim about
 * what was said.
 */
export default function VideoPanel({
  videos,
  configured,
}: {
  videos: YouTubeItem[];
  configured: boolean;
}) {
  if (!configured) {
    return (
      <EmptyState
        title="YouTube is not configured"
        body="Add YOUTUBE_API_KEY to pull watchlist videos with transcripts. Without it this tab stays empty rather than showing descriptions dressed up as substance."
      />
    );
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        title="No videos for your watchlist yet"
        body="Videos come from the watchlist topics in Settings. Broaden a topic, or check back — search runs against recent uploads only."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-dim">
        Watchlist videos, transcript-backed where the uploader published
        captions. <span className="font-mono">{videos.filter((v) => v.hasTranscript).length}</span>{' '}
        of <span className="font-mono">{videos.length}</span> have a real transcript.
      </p>

      <ul className="grid gap-3 xl:grid-cols-2">
        {videos.map((video) => (
          <VideoCard key={video.videoId} video={video} />
        ))}
      </ul>
    </div>
  );
}

function VideoCard({ video }: { video: YouTubeItem }) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Transcript-backed items earn REPORTED; description-only stays INFERRED.
  const tier = video.hasTranscript ? 'reported' : 'inferred';

  /** Full AI summary over the transcript, on demand — same lazy rule as the feed. */
  async function summarize() {
    if (summary || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: video.title,
          url: video.url,
          body: video.transcript ?? video.description,
          source: video.channel,
          category: 'power-markets',
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { synthesis?: string | null };
        setSummary(body.synthesis ?? 'No summary could be produced for this one.');
      }
    } catch {
      setSummary('Could not summarize this video.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-card border border-rule bg-bg-raised p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceChip tier={tier} />
        <Youtube size={13} className="text-text-faint" aria-hidden />
        <span className="truncate text-xs text-text-dim">{video.channel}</span>
        {video.hasTranscript ? (
          <Badge tone="neutral">Transcript</Badge>
        ) : (
          <Badge tone="warning">Description only</Badge>
        )}
        <span className="ml-auto whitespace-nowrap text-xs text-text-faint">
          {relativeTime(video.publishedAt)}
        </span>
      </div>

      <h3 className="mt-2 font-display text-base leading-snug text-text">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {video.title}
          <ExternalLink size={11} className="ml-1 inline align-baseline opacity-50" />
        </a>
      </h3>

      {video.transcript ? (
        <>
          <p className="eyebrow mt-2.5 mb-1">Transcript excerpt</p>
          <p
            className={cn(
              'rounded-md border border-rule bg-bg p-2.5 text-sm leading-relaxed text-text-dim',
              !expanded && 'line-clamp-4',
            )}
          >
            {video.transcript}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 text-xs text-text-dim hover:text-text"
          >
            {expanded ? 'Less' : 'More of the transcript'}
          </button>
        </>
      ) : video.description ? (
        <p className="mt-2 line-clamp-3 text-sm text-text-dim">{video.description}</p>
      ) : null}

      <div className="mt-2.5 border-t border-rule pt-2.5">
        {summary ? (
          <>
            <p className="eyebrow mb-1">Summary</p>
            <p className="text-sm leading-relaxed text-text-dim">{summary}</p>
          </>
        ) : (
          <button
            type="button"
            onClick={summarize}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs text-accent-dim hover:text-accent disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            {busy ? 'Summarizing…' : 'Summarize this'}
          </button>
        )}
      </div>
    </li>
  );
}
