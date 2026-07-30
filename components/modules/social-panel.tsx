'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Youtube } from 'lucide-react';
import { relativeTime, cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import ProvenanceChip from '@/components/ui/provenance-chip';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import type { SourceTier } from '@/lib/types';

interface SocialData {
  following: {
    title: string; url: string; source: string;
    published: string | null; summary: string; platform: string;
  }[];
  trending: {
    headline: string; url: string; outletCount: number;
    outlets: string[]; published: string | null; reason: string;
  }[];
  videos: {
    title: string; channel: string; url: string; published: string;
    thumbnail: string | null; hasTranscript: boolean;
    tier: SourceTier; excerpt: string;
  }[];
  topics: string[];
  youtubeConfigured: boolean;
}

export default function SocialPanel() {
  const [data, setData] = useState<SocialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/social');
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      setData((await res.json()) as SocialData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load social data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Street level</p>
          <h1 className="mt-1 font-display text-2xl text-text">Social &amp; Trending</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      {error ? (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Following ── */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Following</CardTitle>
              <p className="mt-0.5 text-xs text-text-dim">Practitioner discussion</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {loading && !data ? (
              <Skeleton />
            ) : data?.following.length === 0 ? (
              <p className="text-sm text-text-dim">
                No recent posts. Enable the Reddit discovery nets in Settings to populate
                this rail.
              </p>
            ) : (
              data?.following.slice(0, 12).map((item) => (
                <article key={item.url} className="border-b border-rule-faint pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <ProvenanceChip tier="inferred" />
                    <span className="truncate text-xs text-text-dim">{item.source}</span>
                    <span className="ml-auto shrink-0 text-xs text-text-faint">
                      {relativeTime(item.published)}
                    </span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 block text-sm text-text hover:underline"
                  >
                    {item.title}
                    <ExternalLink size={10} className="ml-1 inline opacity-50" />
                  </a>
                </article>
              ))
            )}
          </CardBody>
        </Card>

        {/* ── Trending: coverage gaps ── */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Trending</CardTitle>
              <p className="mt-0.5 text-xs text-text-dim">Not in your feeds</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {loading && !data ? (
              <Skeleton />
            ) : data?.trending.length === 0 ? (
              <p className="text-sm text-text-dim">
                No coverage gaps found. Everything the discovery net surfaced was already
                covered by one of your core sources — which is the outcome you want.
              </p>
            ) : (
              data?.trending.map((cluster) => (
                <article key={cluster.url} className="border-b border-rule-faint pb-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceChip tier="inferred" />
                    <Badge tone="warning">{cluster.outletCount} outlets</Badge>
                    <span className="ml-auto shrink-0 text-xs text-text-faint">
                      {relativeTime(cluster.published)}
                    </span>
                  </div>
                  <a
                    href={cluster.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 block text-sm text-text hover:underline"
                  >
                    {cluster.headline}
                    <ExternalLink size={10} className="ml-1 inline opacity-50" />
                  </a>
                  <p className="mt-1 text-xs text-text-dim">{cluster.reason}</p>
                  <p className="mt-0.5 truncate text-[11px] text-text-faint">
                    {cluster.outlets.join(' · ')}
                  </p>
                </article>
              ))
            )}
          </CardBody>
        </Card>

        {/* ── Topics + video ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Watchlist</CardTitle>
                <p className="mt-0.5 text-xs text-text-dim">Topics driving these rails</p>
              </div>
            </CardHeader>
            <CardBody>
              {data?.topics.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.topics.map((t) => (
                    <Badge key={t} tone="accent">{t}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-dim">No topics set.</p>
              )}
              <p className="mt-2.5 text-xs text-text-faint">
                Edit these in Settings → Watchlist.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Youtube size={15} /> Video
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {!data?.youtubeConfigured ? (
                <p className="text-sm text-text-dim">
                  Set <span className="font-mono text-xs">YOUTUBE_API_KEY</span> to search
                  video on your watchlist topics. Where the uploader published a caption
                  track, the excerpt is the real transcript and grades VERIFIED — otherwise
                  it is the description, which grades INFERRED.
                </p>
              ) : data.videos.length === 0 ? (
                <p className="text-sm text-text-dim">
                  No recent videos matched the watchlist.
                </p>
              ) : (
                data.videos.map((v) => (
                  <article key={v.url} className="border-b border-rule-faint pb-3 last:border-0">
                    <div className="flex items-center gap-2">
                      <ProvenanceChip tier={v.tier} />
                      {v.hasTranscript ? (
                        <Badge tone="accent">Transcript</Badge>
                      ) : (
                        <Badge tone="neutral">Description only</Badge>
                      )}
                    </div>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 block text-sm text-text hover:underline"
                    >
                      {v.title}
                    </a>
                    <p className="mt-0.5 text-xs text-text-dim">
                      {v.channel} · {relativeTime(v.published)}
                    </p>
                  </article>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="text-xs text-text-faint">
        Nothing on this page enters the main Intelligence feed. Discovery and social
        exist to find what your curated sources missed — they are not themselves
        reporting.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-20 rounded bg-bg-overlay" />
          <div className="h-4 w-full rounded bg-bg-overlay" />
          <div className="h-4 w-3/4 rounded bg-bg-overlay" />
        </div>
      ))}
    </div>
  );
}
