'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Briefcase, Calculator, CheckCircle2, FileText,
  HelpCircle, Map as MapIcon, MessagesSquare, Radio, Send, ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type {
  Deal, Signal, MarketWatchEntry, StageTransition,
} from '@/lib/types';
import { meddpiccBreakdown, riskFlags } from '@/lib/deals';
import { formatMw, formatUsd, formatDate, relativeTime, cn } from '@/lib/utils';
import { nonAttainmentForState, primacyFor } from '@/lib/geo/epa-api';
import { useAiStream } from '@/lib/use-ai-stream';
import type { TaskKind } from '@/lib/engine/model-routing';
import { Card, CardBody, CardHeader, CardTitle, Stat } from '@/components/ui/card';
import HealthRing from '@/components/ui/health-ring';
import Badge, { StagePill } from '@/components/ui/badge';
import ProvenanceChip from '@/components/ui/provenance-chip';
import EntityLink, { EntityChip } from '@/components/ui/entity-link';
import { entitiesIn } from '@/lib/engine/entities';
import Button from '@/components/ui/button';
import AiOutput from '@/components/ui/ai-output';
import SignalCapture from './signal-capture';
import MapPlanPanel from './map-plan';
import { starterPlan } from '@/lib/map/schedule';
import type { MapPlan } from '@/lib/map/schedule';

type Tab = 'intel' | 'signals' | 'market' | 'map' | 'history' | 'artifacts';

const AI_ACTIONS: { task: TaskKind; label: string; icon: typeof FileText }[] = [
  { task: 'brief', label: 'Generate Brief', icon: FileText },
  { task: 'business-case', label: 'Business Case', icon: Briefcase },
  { task: 'objections', label: 'Objection Scripts', icon: MessagesSquare },
  { task: 'plan', label: 'Generate Plan', icon: BookOpen },
  { task: 'map-gen', label: 'Build MAP', icon: MapIcon },
  { task: 'outreach', label: 'Outreach Plan', icon: Send },
  { task: 'qualify', label: 'Qualify / Re-qualify', icon: ShieldCheck },
  { task: 'intel', label: 'Strategic Read', icon: Radio },
];

export default function DealDetail({
  deal,
  signals,
  marketWatch,
  transitions,
  isSeed,
  mapPlan,
}: {
  deal: Deal;
  signals: Signal[];
  marketWatch: MarketWatchEntry[];
  transitions: StageTransition[];
  isSeed: boolean;
  /** Saved MAP, or null — the panel falls back to the starter sequence. */
  mapPlan?: MapPlan | null;
}) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>('intel');
  const [activeTask, setActiveTask] = useState<TaskKind | null>(null);
  const [capturing, setCapturing] = useState(false);
  const ai = useAiStream();

  const flags = riskFlags(deal);
  const meddpicc = meddpiccBreakdown(deal);
  const nonAttainment = nonAttainmentForState(deal.state);
  const primacy = primacyFor(deal.state);

  async function runTask(task: TaskKind) {
    setActiveTask(task);
    await ai.run({ task, dealId: deal.id });
  }

  /**
   * Arrive with a task already chosen — /app/pipeline/[id]?ai=outreach.
   *
   * This is the landing for "Draft outreach" on a feed item. Without it the
   * handoff would drop the reader on the deal page with no indication of why
   * they are there, and they would have to find the button themselves.
   *
   * Guarded by a ref rather than the effect deps so it fires once per arrival:
   * re-running a 40-second model call because a parent re-rendered would be
   * both expensive and confusing.
   */
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    const requested = params.get('ai');
    if (!requested) return;
    if (!AI_ACTIONS.some((t) => t.task === requested)) return;
    armed.current = true;
    void runTask(requested as TaskKind);
    // runTask is stable for the life of this component; deps intentionally
    // narrow so a parent re-render cannot retrigger the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="space-y-5">
      <Link
        href="/app/pipeline"
        className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-text"
      >
        <ArrowLeft size={14} /> Pipeline
      </Link>

      {/* ── 1. Header ── */}
      <header className="flex flex-wrap items-start gap-4">
        <HealthRing score={deal.health_score} size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-text-faint">
              {deal.deal_id}
            </span>
            <StagePill stage={deal.stage} />
            <Badge tone="neutral">{deal.relationship_type}</Badge>
            {deal.geo_tier ? <Badge tone="neutral">{deal.geo_tier}</Badge> : null}
          </div>
          <h1 className="mt-1.5 font-display text-2xl text-text">{deal.company}</h1>
          {/*
            The company and its utility link out to their entity pages. This
            page answers "where is this deal", the entity page answers "what is
            happening to this account and this territory across every source" —
            and a rate move on the utility is a re-engagement reason for the
            deal sitting on it.
          */}
          <p className="mt-0.5 text-sm text-text-dim">
            {deal.vertical}
            {deal.state ? ` · ${deal.state}` : ''}
            {deal.utility && deal.utility.toLowerCase() !== 'multi' ? (
              <>
                {' · '}
                <EntityLink entity={{ name: deal.utility, type: 'utility' }} />
              </>
            ) : deal.utility ? (
              ` · ${deal.utility}`
            ) : null}
          </p>
          <p className="mt-1.5">
            <EntityLink
              entity={{ name: deal.company, type: 'company' }}
              className="text-xs text-text-dim no-underline hover:text-text"
            >
              See all coverage of {deal.company} →
            </EntityLink>
          </p>
          {flags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <Badge key={f.key} tone={f.severity === 'danger' ? 'danger' : 'warning'}>
                  <AlertTriangle size={10} /> {f.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </header>

      {isSeed && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          Template account — the MEDDPICC fields below are blank because they were never
          filled in, not because the deal is new. Sign in and load your Spine to see real
          data.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          {/* ── 2. Core intel ── */}
          <Card>
            <CardHeader><CardTitle>Core intel</CardTitle></CardHeader>
            <CardBody className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Stat label="Vertical" value={deal.vertical} />
              <Stat label="Geo tier" value={deal.geo_tier ?? '—'} />
              <Stat label="State" value={deal.state ?? '—'} />
              <Stat
                label="Utility"
                value={
                  deal.utility && deal.utility.toLowerCase() !== 'multi' ? (
                    <EntityLink entity={{ name: deal.utility, type: 'utility' }} />
                  ) : (
                    (deal.utility ?? '—')
                  )
                }
              />
              <Stat label="Value prop" value={deal.value_prop ?? 'Not yet diagnosed'} />
              <Stat label="Beachhead site" value={deal.beachhead_site ?? '—'} />
              <Stat label="Size" value={formatMw(deal.size_mw)} />
              <Stat label="Value" value={formatUsd(deal.size_usd_m)} />
              <Stat label="Days in stage" value={
                <span className={deal.days_in_stage > 30 ? 'text-danger' : undefined}>
                  {deal.days_in_stage}
                </span>
              } />
            </CardBody>
          </Card>

          {/* ── 3. MEDDPICC scorecard ── */}
          <Card>
            <CardHeader>
              <CardTitle>MEDDPICC scorecard</CardTitle>
              {/* A bar, not just a fraction. "1/8" is a number you have to
                  translate; a bar is a shape you read at a glance, and this is
                  the single clearest signal of how well the deal is known. */}
              <span className="flex items-center gap-2">
                <span
                  className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-overlay"
                  role="img"
                  aria-label={`${deal.meddpicc_score} of 8 pillars known`}
                >
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      deal.meddpicc_score >= 6
                        ? 'bg-success'
                        : deal.meddpicc_score >= 3
                          ? 'bg-warning'
                          : 'bg-danger',
                    )}
                    style={{ width: `${(deal.meddpicc_score / 8) * 100}%` }}
                  />
                </span>
                <span className="font-mono text-sm tabular-nums text-text-dim">
                  {deal.meddpicc_score}/8
                </span>
              </span>
            </CardHeader>
            <CardBody className="space-y-0">
              {meddpicc.map((f) => (
                <div
                  key={f.key}
                  className="flex items-baseline gap-2 border-b border-rule-faint py-1.5 last:border-0"
                >
                  <span className="mt-0.5 shrink-0" title={f.state}>
                    {f.state === 'known' ? (
                      <CheckCircle2 size={14} className="text-success" strokeWidth={2} />
                    ) : f.state === 'gap' ? (
                      <AlertTriangle size={14} className="text-warning" strokeWidth={2} />
                    ) : (
                      <HelpCircle size={14} className="text-text-faint" strokeWidth={2} />
                    )}
                  </span>
                  {/* One line per pillar: name, then the one-line read. Two
                      stacked blocks per row made an eight-row card scroll. */}
                  <p className="w-col-2xl shrink-0 text-sm font-medium text-text">{f.label}</p>
                  <p className="min-w-0 flex-1 truncate text-sm text-text-dim">
                    {typeof f.value === 'string' && f.value
                      ? f.value
                      : typeof f.value === 'boolean' && f.value
                        ? 'Confirmed'
                        : f.hint}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* ── 4. Key people ── */}
          <Card>
            <CardHeader><CardTitle>Key people</CardTitle></CardHeader>
            <CardBody className="grid grid-cols-2 gap-4">
              <Person role="Champion" name={deal.champion} />
              <Person role="Economic buyer" name={deal.economic_buyer} />
              <Person
                role="Threading"
                name={deal.multi_threaded ? 'Multi-threaded' : null}
                emptyLabel="Single-threaded — health capped at 6"
              />
              <Person
                role="Decision process"
                name={deal.decision_mapped ? 'Mapped' : null}
                emptyLabel="Unmapped"
              />
            </CardBody>
          </Card>

          {/* ── 5. Decision process ── */}
          <Card>
            <CardHeader><CardTitle>Decision process</CardTitle></CardHeader>
            <CardBody>
              {deal.decision_mapped && deal.decision_process ? (
                <p className="whitespace-pre-wrap text-sm text-text">
                  {deal.decision_process}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-text-dim">
                    Not yet mapped. These are the questions that close it:
                  </p>
                  <ol className="space-y-1.5 text-sm text-text-dim">
                    {[
                      'Who signs, and what is their approval limit?',
                      'What committee reviews this, and when does it meet?',
                      'Is there a security or facility-clearance gate?',
                      'Who owns the budget line, and which fiscal year is it in?',
                      'What does legal need to see, and how long do they take?',
                      'Has this customer bought anything like this before? From whom?',
                      'What is the compelling event that forces a decision?',
                      'Who can say no, and what would make them?',
                    ].map((q, i) => (
                      <li key={q} className="flex gap-2">
                        <span className="font-mono text-xs text-text-faint">{i + 1}.</span>
                        {q}
                      </li>
                    ))}
                  </ol>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => runTask('map-gen')}
                  >
                    <MapIcon size={14} /> Build a MAP to close these
                  </Button>
                </>
              )}
            </CardBody>
          </Card>

          {/* ── Territory conditions ── */}
          {(nonAttainment.length > 0 || primacy.status !== 'federal') && (
            <Card>
              <CardHeader><CardTitle>Territory conditions</CardTitle></CardHeader>
              <CardBody className="space-y-3 text-sm">
                {nonAttainment.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">EPA non-attainment</p>
                    <ul className="space-y-1">
                      {nonAttainment.map((a) => (
                        <li key={a.id} className="text-text-dim">
                          <span className="text-text">{a.name}</span> — {a.pollutant}
                          {a.classification ? ` (${a.classification})` : ''}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs text-text-faint">
                      New combustion permitting is hardest here. Verify against EPA&apos;s
                      Green Book before citing in a customer document.
                    </p>
                  </div>
                )}
                {primacy.status !== 'federal' && (
                  <div>
                    <p className="eyebrow mb-1.5">Class VI primacy</p>
                    <p className="text-text-dim">
                      <span className="text-text capitalize">{primacy.status}</span> —{' '}
                      {primacy.authority}
                      {primacy.date ? ` (${primacy.date})` : ''}
                      {primacy.expected ? ` — expected ${primacy.expected}` : ''}
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ── 6-9. Tabs ── */}
          <Card>
            <div
              className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-rule px-2 py-1.5"
              role="tablist"
            >
              {(
                [
                  ['intel', 'Notes'],
                  ['signals', `Signals (${signals.length})`],
                  ['market', `Market watch (${marketWatch.length})`],
                  ['map', 'MAP'],
                  ['history', `Stage history (${transitions.length})`],
                  ['artifacts', `Artifacts (${deal.artifacts?.length ?? 0})`],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors',
                    tab === id
                      ? 'bg-bg-overlay font-medium text-text'
                      : 'text-text-dim hover:text-text',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <CardBody>
              {tab === 'intel' && (
                <div className="space-y-3 text-sm">
                  <Field label="Next move" value={deal.next_move} />
                  {deal.next_move_date && (
                    <Field label="Next move date" value={formatDate(deal.next_move_date)} />
                  )}
                  <Field label="Key risk" value={deal.key_risk} />
                  <Field label="Identified pain" value={deal.identified_pain} />
                  <Field label="Competition" value={deal.competition} />
                  <Field label="Notes" value={deal.notes} />
                  {deal.partner_notes && (
                    <Field label="Partner notes" value={deal.partner_notes} />
                  )}
                  {(deal.landed_site || deal.next_target_site) && (
                    <div className="border-t border-rule pt-3">
                      <p className="eyebrow mb-1.5">Land and expand</p>
                      <Field label="Landed site" value={deal.landed_site} />
                      <Field label="Next target site" value={deal.next_target_site} />
                      <p className="mt-1 text-xs text-text-dim">
                        {deal.expansion_mw_captured} MW captured
                        {deal.expansion_mw_addressable
                          ? ` of ${deal.expansion_mw_addressable} MW addressable`
                          : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'signals' &&
                (signals.length === 0 ? (
                  <Empty
                    text="No signals logged for this account."
                    action={
                      <Button size="sm" onClick={() => setCapturing(true)}>
                        Log a signal
                      </Button>
                    }
                  />
                ) : (
                  <ul className="space-y-3">
                    {signals.map((s) => (
                      <li key={s.id} className="border-b border-rule-faint pb-3 last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge tone="accent">{s.signal_type}</Badge>
                          <span className="text-xs text-text-faint">
                            {relativeTime(s.logged_at)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-text">{s.raw_signal}</p>
                        {s.so_what && (
                          <p className="mt-1 text-sm italic text-accent-dim">
                            → {s.so_what}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === 'market' &&
                (marketWatch.length === 0 ? (
                  <Empty text="No market watch entries mapped to this account yet." />
                ) : (
                  <ul className="space-y-3">
                    {marketWatch.map((m) => (
                      <li key={m.id} className="border-b border-rule-faint pb-3 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <ProvenanceChip tier={m.source_tier} />
                          <Badge tone="neutral">{m.category}</Badge>
                          <span className="text-xs text-text-faint">
                            {relativeTime(m.swept_at)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm font-medium text-text">{m.headline}</p>
                        {m.summary && (
                          <p className="mt-0.5 text-sm text-text-dim">{m.summary}</p>
                        )}
                        {/* Same entity chips as a feed card — a market watch
                            row is a feed item that was persisted, so it opens
                            onto the same pages. */}
                        <MarketWatchEntities entry={m} deals={[deal]} />
                        {m.outreach_hook && (
                          <p className="mt-1 text-sm italic text-accent-dim">
                            → {m.outreach_hook}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === 'history' &&
                (transitions.length === 0 ? (
                  <Empty text="No stage changes recorded yet." />
                ) : (
                  <ul className="space-y-2.5">
                    {transitions.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-text-faint">
                          {formatDate(t.transitioned_at)}
                        </span>
                        <StagePill stage={t.from_stage} />
                        <span className="text-text-faint">→</span>
                        <StagePill stage={t.to_stage} />
                        {t.days_in_prior !== null && (
                          <span className="text-xs text-text-dim">
                            after {t.days_in_prior}d
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === 'map' && (
                <MapPlanPanel
                  dealId={deal.id}
                  initial={mapPlan ?? starterPlan()}
                  businessCaseExists={Boolean(
                    deal.artifacts?.some((a) => a.type === 'business-case'),
                  )}
                />
              )}

              {tab === 'artifacts' &&
                (!deal.artifacts || deal.artifacts.length === 0 ? (
                  <Empty
                    text="No documents generated for this account yet."
                    action={
                      <Link href={`/app/forge?deal=${deal.id}`}>
                        <Button size="sm">Open Forge</Button>
                      </Link>
                    }
                  />
                ) : (
                  <ul className="space-y-2">
                    {deal.artifacts.map((a) => (
                      <li key={`${a.type}-${a.created_at}`}>
                        <a
                          href={a.url}
                          className="flex items-center justify-between rounded-md border border-rule px-3 py-2 text-sm hover:bg-bg-overlay"
                        >
                          <span className="text-text">{a.label ?? a.type}</span>
                          <span className="text-xs text-text-faint">
                            {a.format?.toUpperCase()} · {formatDate(a.created_at)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ))}
            </CardBody>
          </Card>

          {/* ── AI output ── */}
          {(ai.text || ai.streaming || ai.error) && (
            <div>
              <p className="eyebrow mb-2">
                {AI_ACTIONS.find((a) => a.task === activeTask)?.label ?? 'Output'}
              </p>
              <AiOutput
                text={ai.text}
                streaming={ai.streaming}
                error={ai.error}
                provider={ai.provider}
                model={ai.model}
                onStop={ai.stop}
              />
            </div>
          )}
        </div>

        {/* ── 10. AI actions sidebar ── */}
        <aside className="space-y-2 lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:self-start">
          <p className="eyebrow">AI actions</p>
          {AI_ACTIONS.map(({ task, label, icon: Icon }) => (
            <Button
              key={task}
              variant={activeTask === task ? 'primary' : 'secondary'}
              size="sm"
              className="w-full justify-start"
              disabled={ai.streaming}
              onClick={() => runTask(task)}
            >
              <Icon size={14} /> {label}
            </Button>
          ))}

          {/* Model economics is a destination, not a generation task — it opens
              the module with this deal's utility, state and MW already loaded,
              and scenarios saved there come back onto this deal's artifacts. */}
          <div className="pt-2">
            <Link
              href={`/app/economics?deal=${deal.id}`}
              className="inline-flex h-tap w-full items-center justify-start gap-1.5 rounded-card border border-rule bg-bg-raised px-2.5 text-sm text-text transition-colors duration-fast hover:bg-bg-overlay xl:h-8 xl:min-h-0"
            >
              <Calculator size={14} /> Model economics
            </Link>
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={() => setCapturing(true)}
            >
              <Radio size={14} /> Log Signal
            </Button>
          </div>

          <p className="pt-2 text-xs text-text-faint">
            Briefs, plans, MAPs, and qualification run on the PowerDeal methodology —
            Claude only, never a cheaper model.
          </p>
        </aside>
      </div>

      {capturing && (
        <SignalCapture deal={deal} onClose={() => setCapturing(false)} />
      )}
    </div>
  );
}

function Person({
  role,
  name,
  emptyLabel = 'Unknown',
}: {
  role: string;
  name: string | null;
  emptyLabel?: string;
}) {
  return (
    <div>
      <p className="eyebrow mb-1">{role}</p>
      {name ? (
        <p className="text-sm text-text">{name}</p>
      ) : (
        <p className="inline-flex items-center gap-1 text-sm text-warning">
          <AlertTriangle size={12} /> {emptyLabel}
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="eyebrow mb-0.5">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-text">{value}</p>
    </div>
  );
}

/**
 * Entities named in a market watch row.
 *
 * Reuses the feed's extractor by shaping the row like a feed item — which is
 * what it is, the sweep persisted it from one — so a row here links to exactly
 * the same entity pages a feed card does.
 */
function MarketWatchEntities({
  entry,
  deals,
}: {
  entry: MarketWatchEntry;
  deals: Deal[];
}) {
  const entities = entitiesIn(
    { title: entry.headline, synthesis: entry.summary ?? null },
    deals,
    4,
  );
  if (entities.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {entities.map((e) => (
        <EntityChip key={e.name} entity={e} />
      ))}
    </div>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-text-dim">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
