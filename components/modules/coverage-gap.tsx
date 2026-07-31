'use client';

import { useState } from 'react';
import { Radar, Plus, Check, Users } from 'lucide-react';
import type { CoverageGap } from '@/lib/engine/discover';
import type { PeerCandidate } from '@/lib/engine/peer-radar';
import PeerChip from './peer-chip';

/**
 * "YOU MAY BE MISSING THIS" — ported from The Hub's coverage-gap block.
 *
 * Curation means the reader chose their sources; this is what makes that
 * choice safe. Each row is a story several outlets are covering that none of
 * the configured sources touched, with the gap stated as a number rather than
 * a feeling.
 *
 * Carried over verbatim from The Hub, because it is the point: these are
 * CANDIDATES and are labelled as such at every level — a distinct eyebrow, a
 * lower tier by construction, and a visible "not in your sources" mark. They
 * are never mixed unlabelled into curated results. The moment they are, the
 * reader can no longer tell what they chose from what an algorithm chose.
 *
 * PowerDeal adds the peer radar below: companies showing up in that coverage
 * that have no deal record. A gap in reading is one problem; a company you are
 * not covering at all is a bigger one, and it is invisible in a feed sorted by
 * account hits because it hits nothing.
 */
export default function CoverageGapBlock({
  gaps,
  peers,
}: {
  gaps: CoverageGap[];
  peers: PeerCandidate[];
}) {
  if (gaps.length === 0 && peers.length === 0) return null;

  return (
    <section className="rounded-card border border-rule bg-bg-raised p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Radar size={13} className="text-accent" aria-hidden />
        <span className="eyebrow">You may be missing this</span>
      </div>
      <p className="mb-3 text-xs text-text-dim">
        Covered widely elsewhere, but not by the sources you follow. Candidates
        only — nothing here is in your feed.
      </p>

      {gaps.length > 0 && (
        <ul className="flex flex-col">
          {gaps.slice(0, 5).map((gap) => (
            <GapRow key={gap.headline} gap={gap} />
          ))}
        </ul>
      )}

      {peers.length > 0 && <PeerRadar peers={peers} />}
    </section>
  );
}

function GapRow({ gap }: { gap: CoverageGap }) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const outlet = gap.outlets[0];

  async function add() {
    if (!outlet || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch('/api/settings/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-from-gap',
          name: outlet,
          articleUrl: gap.url,
          category: 'power-markets',
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      // Say plainly when it didn't work. Believing you closed a gap that is
      // still open is worse than knowing you have to do it by hand.
      if (res.ok && body.ok) setAdded(true);
      else setFailed(body.error ?? 'Could not add that source.');
    } catch {
      setFailed('Could not add that source.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-rule py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {gap.url ? (
            <a
              href={gap.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-base leading-snug text-text hover:text-accent-dim"
            >
              {gap.headline}
            </a>
          ) : (
            <p className="font-display text-base leading-snug text-text">{gap.headline}</p>
          )}

          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
            {/* The number is the whole point — a gap you can act on. */}
            <span className="text-text">
              <span className="font-mono">{gap.outletCount}</span> outlets covering
            </span>
            <span className="text-text-faint" aria-hidden>·</span>
            <span className="text-text-dim">
              you follow <span className="font-mono">0</span>
            </span>
            <span className="text-text-faint" aria-hidden>·</span>
            <span
              className="eyebrow text-text-dim"
              title="Found on a wide scan, not in your sources. Graded lower for that reason."
            >
              discovery
            </span>
          </p>
        </div>

        {outlet ? (
          <button
            type="button"
            onClick={add}
            disabled={added || busy}
            className="flex shrink-0 items-center gap-1 rounded border border-rule px-2 py-1 text-xs text-text-dim transition-colors hover:border-accent-border hover:text-text disabled:opacity-50"
          >
            {added ? <Check size={11} aria-hidden /> : <Plus size={11} aria-hidden />}
            <span className="max-w-[14ch] truncate">{added ? 'Added' : outlet}</span>
          </button>
        ) : null}
      </div>
      {failed ? <p className="mt-1.5 text-xs text-danger">{failed}</p> : null}
    </li>
  );
}

/** Companies in gap coverage with no deal record — origination leads. */
function PeerRadar({ peers }: { peers: PeerCandidate[] }) {
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Users size={13} className="text-text-dim" aria-hidden />
        <span className="eyebrow">Peer radar — add to pipeline?</span>
      </div>
      <p className="mb-2.5 text-xs text-text-dim">
        Named in coverage above, not in your book.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {peers.map((peer) => (
          <PeerChip key={peer.name} peer={peer} />
        ))}
      </div>
    </div>
  );
}

// PeerChip now lives in ./peer-chip — the entity pages surface peers too, and
// two copies of "add an unqualified company to the pipeline" would drift on
// exactly the fields that must stay blank.
