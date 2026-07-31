'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, GitCompareArrows } from 'lucide-react';
import type { Consensus } from '@/lib/engine/contradiction';
import ProvenanceChip from '@/components/ui/provenance-chip';

/**
 * Where sources agree — and, more usefully, where they contradict each other.
 * Ported from The Hub.
 *
 * This is the block on an entity page worth walking into a meeting holding. "Two
 * trade outlets say the rate case cleared, the commission docket says it is
 * still pending" is a conversation with a customer. A consensus summary is not.
 *
 * Client-side and lazy on purpose: it costs an AI call plus a web search, and
 * the rest of the page — deals affected, your sources — is worth reading while
 * this resolves. It must never hold up the header.
 */
export default function ConsensusPanel({ entity }: { entity: string }) {
  const [data, setData] = useState<Consensus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/contradictions?q=${encodeURIComponent(entity)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { consensus?: Consensus }) => setData(d.consensus ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [entity]);

  if (loading) {
    return (
      <p className="flex min-h-tap items-center gap-2 text-sm xl:min-h-0 text-text-dim">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Comparing how sources cover this…
      </p>
    );
  }

  if (!data || data.insufficient) {
    return (
      <p className="text-sm text-text-dim">
        Not enough overlapping coverage to compare sources yet.
      </p>
    );
  }

  if (!data.aiGenerated) {
    return (
      <p className="text-sm text-text-dim">
        Comparing sources needs an AI model configured.
      </p>
    );
  }

  if (!data.agreement && data.conflicts.length === 0) {
    return (
      <p className="text-sm text-text-dim">
        Sources cover this without contradicting each other.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.agreement ? (
        <div className="rounded-card border border-accent-border bg-accent-bg p-3.5">
          <p className="mb-1 flex items-center gap-1.5">
            <Check size={13} className="text-accent" aria-hidden />
            <span className="eyebrow">
              {data.agreeCount > 0 ? `${data.agreeCount} sources agree` : 'Sources agree'}
            </span>
          </p>
          <p className="text-sm text-text">{data.agreement}</p>
        </div>
      ) : null}

      {data.conflicts.map((c, i) => (
        <div key={i} className="rounded-card border border-rule bg-bg-raised p-3.5">
          <p className="mb-2 flex flex-wrap items-center gap-1.5">
            <GitCompareArrows size={13} className="text-accent" aria-hidden />
            <span className="eyebrow">Sources disagree</span>
            <ProvenanceChip tier={c.tier} className="ml-auto" />
          </p>
          <p className="text-sm text-text">{c.claim}</p>
          {c.counterClaim ? (
            <p className="mt-1.5 border-l-2 border-rule pl-2.5 text-sm text-text-dim">
              {c.counterClaim}
            </p>
          ) : null}
          {c.sources.length > 0 ? (
            <p className="mt-2 text-tiny text-text-faint">{c.sources.join(' · ')}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
