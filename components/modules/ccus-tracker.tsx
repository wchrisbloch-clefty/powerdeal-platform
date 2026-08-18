'use client';

import Link from 'next/link';
import type { CcusEvent, Deal } from '@/lib/types';
import { PRIMACY_STATUS, primacyCounts, type PrimacyStatus } from '@/lib/geo/epa-api';
import { STATE_CENTROIDS } from '@/lib/geo/states';
import { formatDate, cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import ProvenanceChip from '@/components/ui/provenance-chip';

const STATUS_TONE: Record<PrimacyStatus, 'success' | 'warning' | 'neutral'> = {
  granted: 'success',
  pending: 'warning',
  federal: 'neutral',
};

export default function CcusTracker({
  events,
  deals,
}: {
  events: CcusEvent[];
  deals: Deal[];
}) {
  const counts = primacyCounts();

  // Deals in a state where primacy is granted or pending — the accounts for
  // whom the CCUS permitting path is actually different.
  const affected = deals.filter(
    (d) => d.state && PRIMACY_STATUS[d.state.toUpperCase()],
  );

  return (
    <div className="space-y-rhythm-page">
      {/* ⚠️ A SECTION HEADING, NOT A PAGE TITLE. This rendered <PageHeader>,
        which was right when this panel had its own route — and
        app/app/ccus/page.tsx is now a bare redirect into the Intelligence
        tab. The move left the page title behind, so the tab showed two <h1>s:
        "Intelligence" from the page and this one directly under it.
        Only visible once the render check visited the tabs; the default tab
        is Headlines, so eight of the nine had never been loaded. */}
      <div>
        <p className="eyebrow">Carbon capture</p>
        <h2 className="mt-1 font-display text-xl text-text">CCUS Tracker</h2>
      </div>

      {/* ── Status header ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="States with primacy" value={String(counts.granted)} />
        <Tile label="Primacy pending" value={String(counts.pending)} tone="warn" />
        <Tile label="Under federal EPA" value={String(counts.federal)} />
        <Tile label="Accounts affected" value={String(affected.length)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* ── Primacy table ── */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>State primacy</CardTitle>
                <p className="mt-0.5 text-xs text-text-dim">
                  Who issues the Class VI permit — the single biggest driver of
                  permitting timeline.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {Object.entries(PRIMACY_STATUS)
                .sort(([, a], [, b]) => a.status.localeCompare(b.status))
                .map(([state, rec]) => {
                  const stateName = STATE_CENTROIDS[state]?.name ?? state;
                  const dealsHere = deals.filter(
                    (d) => d.state?.toUpperCase() === state,
                  );
                  return (
                    <div
                      key={state}
                      className="flex flex-wrap items-center gap-2 border-b border-rule-faint pb-2 last:border-0 last:pb-0"
                    >
                      <span className="w-10 shrink-0 font-mono text-xs text-text-faint">
                        {state}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-text">{stateName}</span>
                      <Badge tone={STATUS_TONE[rec.status]}>{rec.status}</Badge>
                      <span className="w-full text-xs text-text-dim sm:w-auto">
                        {rec.authority}
                        {rec.date ? ` · ${rec.date}` : ''}
                        {rec.expected ? ` · expected ${rec.expected}` : ''}
                      </span>
                      {dealsHere.length > 0 && (
                        <span className="text-xs text-accent-dim">
                          {dealsHere.length} account{dealsHere.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  );
                })}
              <p className="pt-1 text-xs text-text-faint">
                Every state not listed is under direct EPA implementation. Verify against
                epa.gov/uic before citing a permitting path to a customer — a wrong
                primacy claim misstates the timeline.
              </p>
            </CardBody>
          </Card>

          {/* ── Event feed ── */}
          <Card>
            <CardHeader><CardTitle>Recent CCUS events</CardTitle></CardHeader>
            {events.length === 0 ? (
              <EmptyState
                kind="unchecked"
                title="No CCUS events logged"
                body="The daily CCUS sweep writes Class VI permit movement, GCCSI project updates, and DOE funding here. Deploy the ccus-sweep edge function to start collecting."
              />
            ) : (
              <CardBody className="space-y-3">
                {events.map((e) => {
                  const related = e.deal_ids
                    .map((id) => deals.find((d) => d.id === id))
                    .filter((d): d is Deal => Boolean(d));
                  return (
                    <article
                      key={e.id}
                      className="border-b border-rule-faint pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <ProvenanceChip tier={e.source_tier} />
                        <Badge tone="neutral">{e.event_type}</Badge>
                        {e.state ? (
                          <span className="font-mono text-xs text-text-faint">{e.state}</span>
                        ) : null}
                        <span className="ml-auto text-xs text-text-faint">
                          {formatDate(e.event_date ?? e.logged_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-text">
                        {e.project_name ?? 'Untitled project'}
                        {e.operator ? (
                          <span className="font-normal text-text-dim"> · {e.operator}</span>
                        ) : null}
                      </p>
                      {e.details ? (
                        <p className="mt-0.5 text-sm text-text-dim">{e.details}</p>
                      ) : null}
                      {related.length > 0 && (
                        <p className="mt-1.5 text-sm text-text-dim">
                          <span className="eyebrow mr-1.5">Hits</span>
                          {related.map((d, i) => (
                            <span key={d.id}>
                              {i > 0 ? ', ' : ''}
                              <Link
                                href={`/app/pipeline/${d.id}`}
                                className="text-text underline decoration-rule underline-offset-2 hover:decoration-accent"
                              >
                                {d.company}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                    </article>
                  );
                })}
              </CardBody>
            )}
          </Card>
        </div>

        {/* ── Deal connection panel ── */}
        <aside>
          <Card>
            <CardHeader><CardTitle>Your accounts in primacy states</CardTitle></CardHeader>
            {affected.length === 0 ? (
              <CardBody>
                <p className="text-sm text-text-dim">
                  No pipeline account sits in a state with Class VI primacy granted or
                  pending. Every account here follows the federal EPA path.
                </p>
              </CardBody>
            ) : (
              <CardBody className="space-y-2">
                {affected.map((d) => {
                  const rec = PRIMACY_STATUS[d.state!.toUpperCase()];
                  return (
                    <Link
                      key={d.id}
                      href={`/app/pipeline/${d.id}`}
                      className="block rounded-md border border-rule px-3 py-2 hover:bg-bg-overlay"
                    >
                      <p className="text-sm text-text">{d.company}</p>
                      <p className="mt-0.5 text-xs text-text-dim">
                        {d.state} · {rec.authority}
                      </p>
                      <Badge tone={STATUS_TONE[rec.status]} className="mt-1.5">
                        {rec.status}
                      </Badge>
                    </Link>
                  );
                })}
              </CardBody>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-card border border-rule bg-bg-raised px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-xl tabular-nums',
          tone === 'warn' ? 'text-warning' : 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  );
}
