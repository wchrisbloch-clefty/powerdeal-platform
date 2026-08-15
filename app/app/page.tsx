import Link from 'next/link';
import { AlertTriangle, ArrowRight, Users, Clock } from 'lucide-react';
import { getDeals } from '@/lib/data';
import { portfolioSnapshot, isAtRisk, riskFlags } from '@/lib/deals';
import { formatMw, formatUsd } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/card';
import DealCard from '@/components/ui/deal-card';
import HealthRing from '@/components/ui/health-ring';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const { data: deals, isSeed, readError } = await getDeals();
  const snap = portfolioSnapshot(deals);

  // The dashboard leads with problems, not totals. Worst health first, because
  // that is the list someone should actually work today.
  const needsAttention = deals
    .filter(isAtRisk)
    .sort((a, b) => a.health_score - b.health_score)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Portfolio</p>
        <h1 className="mt-1 font-display text-2xl text-text">Dashboard</h1>
        {/* ⚠️ TWO STATES, TWO SENTENCES. They used to share one.
            "Connect Supabase" is the right instruction for a deployment that
            has no key and the WRONG one for a deployment whose key is being
            refused — it sends the reader to connect something already
            connected. And it is nearly invisible: SEED_DEALS holds exactly 21
            deals and so does the live pipeline, so a rejected key renders 21
            plausible rows under a banner that reads like setup advice. */}
        {readError ? (
          <p className="mt-1.5 rounded-card border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            <span className="font-medium">These are NOT your deals.</span> The database
            refused the query, so the rows below are template data standing in for a
            pipeline that could not be read. {readError}
          </p>
        ) : isSeed ? (
          <p className="mt-1.5 text-sm text-text-dim">
            Showing template data.{' '}
            <Link href="/app/settings" className="text-accent-dim underline underline-offset-2">
              Connect Supabase
            </Link>{' '}
            to load your real pipeline.
          </p>
        ) : null}
      </header>

      {/* ── Snapshot bar ── */}
      <section
        aria-label="Portfolio snapshot"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <SnapshotTile label="Active deals" value={String(snap.activeCount)} />
        <SnapshotTile label="Total MW" value={formatMw(snap.totalMw)} />
        <SnapshotTile label="Pipeline value" value={formatUsd(snap.totalUsdM)} />
        <SnapshotTile
          label="Avg health"
          value={snap.avgHealth ? snap.avgHealth.toFixed(1) : '—'}
        />
        <SnapshotTile
          label="At risk"
          value={String(snap.atRisk)}
          tone={snap.atRisk > 0 ? 'danger' : undefined}
        />
        <SnapshotTile
          label="Single-threaded"
          value={String(snap.singleThreaded)}
          tone={snap.singleThreaded > 0 ? 'warn' : undefined}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Needs attention ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <p className="mt-0.5 text-xs text-text-dim">
                Health below 5, or stalled more than 30 days.
              </p>
            </div>
            <Link href="/app/pipeline">
              <Button variant="ghost" size="sm">
                All deals <ArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>

          {needsAttention.length === 0 ? (
            <EmptyState
              title="Nothing flagged"
              body="No deal is below health 5 or stalled past 30 days. Work the pipeline view to pick your next move."
              action={
                <Link href="/app/pipeline">
                  <Button size="sm">Open pipeline</Button>
                </Link>
              }
            />
          ) : (
            <CardBody className="space-y-2.5">
              {needsAttention.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </CardBody>
          )}
        </Card>

        <div className="space-y-6">
          {/* ── Health distribution ── */}
          <Card>
            <CardHeader>
              <CardTitle>Health distribution</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <HealthBar label="Strong (8–10)" count={snap.byBand.high} total={snap.activeCount} tone="high" />
              <HealthBar label="Watch (5–7)" count={snap.byBand.mid} total={snap.activeCount} tone="mid" />
              <HealthBar label="Weak (1–4)" count={snap.byBand.low} total={snap.activeCount} tone="low" />

              <div className="space-y-2 border-t border-rule pt-3 text-sm">
                <StatRow
                  icon={<Users size={14} strokeWidth={1.75} />}
                  label="Single-threaded"
                  value={snap.singleThreaded}
                  hint="Health is capped at 6 until a second contact is engaged."
                />
                <StatRow
                  icon={<Clock size={14} strokeWidth={1.75} />}
                  label="Stalled > 30d"
                  value={snap.stalled}
                />
                <StatRow
                  icon={<AlertTriangle size={14} strokeWidth={1.75} />}
                  label="At risk"
                  value={snap.atRisk}
                />
              </div>
            </CardBody>
          </Card>

          {/* ── Stage distribution ── */}
          <Card>
            <CardHeader>
              <CardTitle>By stage</CardTitle>
            </CardHeader>
            <CardBody>
              {Object.entries(snap.byStage).length === 0 ? (
                <p className="text-sm text-text-dim">No deals yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {Object.entries(snap.byStage)
                    .sort((a, b) => b[1] - a[1])
                    .map(([stage, count]) => (
                      <li key={stage} className="flex items-center justify-between text-sm">
                        <span className="truncate text-text-dim">{stage}</span>
                        <span className="ml-2 font-mono tabular-nums text-text">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ── Worst deal callout ── */}
      {needsAttention[0] ? (
        <Card>
          <CardHeader>
            <CardTitle>Weakest deal in the book</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap items-center gap-4">
            <HealthRing score={needsAttention[0].health_score} size={52} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-text">{needsAttention[0].company}</p>
              <p className="text-sm text-text-dim">
                {needsAttention[0].deal_id} · {needsAttention[0].stage} ·{' '}
                {needsAttention[0].days_in_stage}d in stage
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {riskFlags(needsAttention[0]).map((f) => (
                  <Badge key={f.key} tone={f.severity === 'danger' ? 'danger' : 'warning'}>
                    {f.label}
                  </Badge>
                ))}
              </div>
            </div>
            <Link href={`/app/pipeline/${needsAttention[0].id}`}>
              <Button variant="primary" size="sm">
                Work this deal <ArrowRight size={14} />
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * A metric tile.
 *
 * Number first and heavy, label second and quiet — the reverse of what the
 * markup order suggests, which is why the label sits BELOW. Reading order here
 * is "36 … active deals", not "active deals … 36": the figure is what the eye
 * is hunting for when someone opens this before a meeting.
 *
 * Weight does the hierarchy, not size alone: 36px/700 against 11px uppercase
 * dim. Two sizes that differ but share a weight read as two labels.
 */
function SnapshotTile({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  /** Comparison line, where one exists — "+3 this week". */
  delta?: string;
  tone?: 'danger' | 'warn';
}) {
  const valueClass =
    tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-text';
  return (
    <div className="rounded-card border border-rule bg-bg-raised p-4">
      <p className={`font-display text-3xl font-bold leading-tight tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-2xs uppercase tracking-label text-text-dim">{label}</p>
      {delta ? <p className="mt-0.5 text-xs text-text-faint">{delta}</p> : null}
    </div>
  );
}

function HealthBar({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: 'high' | 'mid' | 'low';
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const bg =
    tone === 'high'
      ? 'var(--health-high)'
      : tone === 'mid'
        ? 'var(--health-mid)'
        : 'var(--health-low)';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-text-dim">{label}</span>
        <span className="font-mono tabular-nums text-text">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-rule-faint">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bg }} />
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between" title={hint}>
      <span className="inline-flex items-center gap-2 text-text-dim">
        {icon}
        {label}
      </span>
      <span className="font-mono tabular-nums text-text">{value}</span>
    </div>
  );
}
