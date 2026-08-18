'use client';

import { useMemo, useState } from 'react';
import { Download, Plus, X } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { VERTICALS, DEAL_STAGES, RELATIONSHIP_TYPES } from '@/lib/types';
import { portfolioSnapshot } from '@/lib/deals';
import { formatMw, formatUsd, cn } from '@/lib/utils';
import PipelineTable from './pipeline-table';
import DealQuickAdd from './deal-quick-add';
import Button from '@/components/ui/button';
import PageHeader from '@/components/chrome/page-header';

type HealthFilter = 'all' | 'high' | 'mid' | 'low';
type ThreadFilter = 'all' | 'multi' | 'single';

export default function PipelineView({
  deals,
  isSeed,
  initialQuery = '',
}: {
  deals: Deal[];
  isSeed: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [vertical, setVertical] = useState('all');
  const [stage, setStage] = useState('all');
  const [health, setHealth] = useState<HealthFilter>('all');
  const [relType, setRelType] = useState('all');
  const [thread, setThread] = useState<ThreadFilter>('all');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((d) => {
      if (q) {
        const hay = [
          d.company, d.deal_id, d.utility, d.state, d.vertical,
          d.beachhead_site, d.next_move, d.champion,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (vertical !== 'all' && d.vertical !== vertical) return false;
      if (stage !== 'all' && d.stage !== stage) return false;
      if (relType !== 'all' && d.relationship_type !== relType) return false;
      if (thread === 'multi' && !d.multi_threaded) return false;
      if (thread === 'single' && d.multi_threaded) return false;
      if (health === 'high' && d.health_score < 8) return false;
      if (health === 'mid' && (d.health_score < 5 || d.health_score >= 8)) return false;
      if (health === 'low' && d.health_score >= 5) return false;
      return true;
    });
  }, [deals, query, vertical, stage, health, relType, thread]);

  const snap = portfolioSnapshot(filtered);
  const activeFilters =
    (query ? 1 : 0) +
    [vertical, stage, relType].filter((v) => v !== 'all').length +
    (health !== 'all' ? 1 : 0) +
    (thread !== 'all' ? 1 : 0);

  function clearFilters() {
    setQuery('');
    setVertical('all');
    setStage('all');
    setHealth('all');
    setRelType('all');
    setThread('all');
  }

  return (
    <div className="space-y-rhythm-page">
      <PageHeader eyebrow="Pipeline Spine" title="Pipeline"
        action={
          <div className="flex gap-2">
            <a href="/api/deals/export" download>
              <Button variant="secondary" size="sm">
                <Download size={14} /> Export CSV
              </Button>
            </a>
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add deal
            </Button>
          </div>
        }
      />

      {isSeed && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          Template pipeline. MEDDPICC fields and MW figures were deliberately left blank
          rather than invented — load your real Spine to replace these rows.
        </p>
      )}

      {/* ── Snapshot bar ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Tile label="Deals" value={String(filtered.length)} />
        <Tile label="Active" value={String(snap.activeCount)} />
        <Tile label="MW" value={formatMw(snap.totalMw)} />
        <Tile label="Value" value={formatUsd(snap.totalUsdM)} />
        <Tile
          label="At risk"
          value={String(snap.atRisk)}
          tone={snap.atRisk > 0 ? 'danger' : undefined}
        />
        <Tile
          label="Single-thread"
          value={String(snap.singleThreaded)}
          tone={snap.singleThreaded > 0 ? 'warn' : undefined}
        />
      </section>

      {/* ── Filters ── */}
      <section className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter deals"
          className="h-tap xl:h-8 min-w-col-wide-min flex-1 rounded-md border border-rule bg-bg-raised px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none sm:max-w-col-clamp"
        />

        <Select value={vertical} onChange={setVertical} label="Vertical">
          <option value="all">All verticals</option>
          {VERTICALS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Select>

        <Select value={stage} onChange={setStage} label="Stage">
          <option value="all">All stages</option>
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>

        <Select value={health} onChange={(v) => setHealth(v as HealthFilter)} label="Health">
          <option value="all">Any health</option>
          <option value="high">Strong (8–10)</option>
          <option value="mid">Watch (5–7)</option>
          <option value="low">Weak (1–4)</option>
        </Select>

        <Select value={relType} onChange={setRelType} label="Relationship">
          <option value="all">Any relationship</option>
          {RELATIONSHIP_TYPES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>

        <Select value={thread} onChange={(v) => setThread(v as ThreadFilter)} label="Threading">
          <option value="all">Any threading</option>
          <option value="multi">Multi-threaded</option>
          <option value="single">Single-threaded</option>
        </Select>

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X size={13} /> Clear ({activeFilters})
          </Button>
        )}

        <span className="ml-auto text-xs text-text-faint">
          {filtered.length} of {deals.length}
        </span>
      </section>

      <PipelineTable deals={filtered} />

      {/* Quick-add omits everything the user can fill in later — a 30-field
          creation form is how a pipeline stops getting updated. */}
      {showAdd && (
        <DealQuickAdd existing={deals} onClose={() => setShowAdd(false)} />
      )}
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
  tone?: 'danger' | 'warn';
}) {
  return (
    <div className="rounded-card border border-rule bg-bg-raised px-3 py-2">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-display text-lg tabular-nums',
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-tap xl:h-8 rounded-md border border-rule bg-bg-raised px-2 text-sm text-text-dim focus:border-accent-border focus:outline-none"
    >
      {children}
    </select>
  );
}
