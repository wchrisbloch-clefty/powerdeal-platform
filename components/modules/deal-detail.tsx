'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Briefcase, Calculator, CheckCircle2, Download,
  FileText, HelpCircle, Map as MapIcon, MessagesSquare, Quote, Radio, Send,
  ShieldCheck, AlertTriangle, FileDown,
} from 'lucide-react';
import type {
  Deal, Signal, MarketWatchEntry, StageTransition, DealCompetitor,
} from '@/lib/types';
import { meddpiccBreakdown, riskFlags, utilityRiskFlags } from '@/lib/deals';
import { resolveKind, nextGaps, noGapMessage } from '@/lib/design/next-gap';
import { GapInline, GapPanel } from '@/components/ui/gap';
import ReadFailureBanner from '@/components/ui/read-failure';
import { formatMw, formatUsd, formatDate, cn } from '@/lib/utils';
import { nonAttainmentForState, primacyFor } from '@/lib/geo/epa-api';
import { useAiStream } from '@/lib/use-ai-stream';
import type { TaskKind } from '@/lib/engine/model-routing';
import { Card, CardBody, CardHeader, CardTitle, Stat } from '@/components/ui/card';
import HealthRing from '@/components/ui/health-ring';
import HealthComposition from '@/components/ui/health-composition';
import Badge, { StagePill } from '@/components/ui/badge';
import ProvenanceChip from '@/components/ui/provenance-chip';
import EntityLink, { EntityChip } from '@/components/ui/entity-link';
import { entitiesIn } from '@/lib/engine/entities';
import Button from '@/components/ui/button';
import AiOutput from '@/components/ui/ai-output';
import SignalCapture from './signal-capture';
import LogOutcome from './log-outcome';
import WinLossList from './win-loss-list';
import CompetitivePanel from './competitive-panel';
import MeetingPrepPanel from './meeting-prep-panel';
import StageControl from './stage-control';
import UtilityPanel from './utility-panel';
import type { UtilityContext } from '@/lib/utility/model';
import MapPlanPanel from './map-plan';
import { cardFilename, cardTitle } from '@/lib/cards';
import { starterPlan } from '@/lib/map/schedule';
import type { MapPlan } from '@/lib/map/schedule';
import { TERMINAL_STAGES } from '@/lib/types';
import type { DealStage, WinLossEntry } from '@/lib/types';
import TimeAgo from '@/components/ui/time-ago';

type Tab =
  | 'intel' | 'signals' | 'market' | 'map' | 'competitive' | 'prep'
  | 'history' | 'outcome' | 'artifacts';

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

/**
 * Tasks that produce output but are NOT one of the buttons above.
 *
 * Meeting prep is driven by a panel with four inputs, because running it from a
 * bare button would produce a brief with no clock — and the clock is the part
 * that makes a 30-minute intro a different document from a 90-minute deep-dive.
 * Without this map the finished brief would be headed "Output" and download as
 * a file nobody recognises a week later.
 */
const PANEL_TASK_LABELS: Partial<Record<TaskKind, string>> = {
  'meeting-prep': 'Meeting Prep',
};

function taskLabel(task: TaskKind | null): string | undefined {
  if (!task) return undefined;
  return AI_ACTIONS.find((a) => a.task === task)?.label ?? PANEL_TASK_LABELS[task];
}

export default function DealDetail({
  deal,
  signals,
  marketWatch,
  transitions,
  readError,
  intelError,
  isSeed,
  mapPlan,
  winLoss = [],
  winLossError,
  competitors = [],
  competitiveError,
  utility = null,
}: {
  deal: Deal;
  signals: Signal[];
  marketWatch: MarketWatchEntry[];
  transitions: StageTransition[];
  /**
   * ⚠️ SET WHEN THE THREE READS ABOVE WERE REFUSED, NOT WHEN THEY CAME BACK
   * EMPTY, and the tab strip is why it has to exist.
   *
   * The labels print counts — "Signals (0)", "Market watch (0)", "Stage history
   * (0)". A count is the most confident thing this page says: it is a measured
   * quantity, and a reader has no reason to doubt one. Rendered off an array
   * that is empty because the database refused the key, it is a fabricated
   * measurement, and the tab body underneath then explains it — "No signals
   * logged for this account" — with a button offering to fix it.
   */
  intelError?: string | null;
  /** Set when the DEAL ITSELF came back refused and the record below is seed. */
  readError?: string | null;
  isSeed: boolean;
  /** Saved MAP, or null — the panel falls back to the starter sequence. */
  mapPlan?: MapPlan | null;
  /** Outcomes logged against this deal. */
  winLoss?: WinLossEntry[];
  /** Set when the outcome read was refused. Same reason as intelError. */
  winLossError?: string | null;
  /**
   * Stored competitor rows. EMPTY IS THE DEFAULT STATE, not an absence — the
   * toggle grid has do-nothing and the grid on with no rows at all, and a row
   * exists only where someone contradicted a default or recorded detail.
   */
  competitors?: DealCompetitor[];
  /**
   * ⚠️ SET WHEN THE COMPETITIVE READ WAS REFUSED, AND THE PANEL CANNOT INFER IT.
   *
   * `[]` is the ORDINARY deal here — the grid and the status quo are on by
   * default and store no rows — so the panel renders a complete, plausible
   * competitive position from an empty array. There is no visual difference
   * between "nothing is recorded against this deal" and "the database refused
   * to say what is recorded against this deal", and the second one is the
   * state the card buttons must not be pressed in.
   */
  competitiveError?: string | null;
  /**
   * The resolved utility layer. Null only when the lookup failed — Level 0
   * answers from a state alone, so an ordinary deal always has one.
   */
  utility?: UtilityContext | null;
}) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>('intel');
  const [activeTask, setActiveTask] = useState<TaskKind | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * The operator's own record of which fields they checked and found empty.
   *
   * Held locally so the mark responds to the tap, and reconciled against what
   * the write actually returned — never assumed. `writeError` is shown BESIDE
   * the mark rather than instead of it, the same rule the Learn panel follows:
   * a failed save must not blank the thing it failed to save.
   */
  const [verifiedEmpty, setVerifiedEmpty] = useState<string[]>(deal.verified_empty ?? []);
  const [markBusy, setMarkBusy] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  async function recordVerifiedEmpty(field: string, verified: boolean) {
    const next = verified
      ? [...new Set([...verifiedEmpty, field])]
      : verifiedEmpty.filter((f) => f !== field);
    const previous = verifiedEmpty;
    setMarkBusy(field);
    setMarkError(null);
    setVerifiedEmpty(next);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified_empty: next }),
      });
      if (!res.ok) {
        // ⚠️ REVERT ON FAILURE. Leaving the mark switched would show the
        // operator a record that does not exist — the optimistic-update
        // version of every silent failure in this build.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setVerifiedEmpty(previous);
        setMarkError(body?.error ?? `The write did not land (${res.status}).`);
      }
    } catch (err) {
      setVerifiedEmpty(previous);
      setMarkError((err as Error).message);
    } finally {
      setMarkBusy(null);
    }
  }
  /**
   * The card currently on screen: its posture and the day it was built.
   *
   * Held here because both are load-bearing on the way out — the title, the
   * filename and the header all name the posture, and the date is what tells
   * two cards for the same deal apart in a downloads folder.
   */
  const [card, setCard] = useState<{
    kind: 'no-decision' | 'pricing-defense';
    label: string;
    date: string;
  } | null>(null);
  const ai = useAiStream();

  // Structural utility risk sits alongside the deal's own flags, not in a
  // separate corner: a co-op all-requirements contract is a NO-GO candidate,
  // and burying it under a tab would make it late by construction.
  const flags = [...riskFlags(deal), ...utilityRiskFlags(utility)];
  const meddpicc = meddpiccBreakdown(deal);
  const nonAttainment = nonAttainmentForState(deal.state);
  const primacy = primacyFor(deal.state);

  async function runTask(task: TaskKind) {
    setActiveTask(task);
    setCard(null);
    setExportError(null);
    await ai.run({ task, dealId: deal.id });
  }

  /**
   * Generate one competitive card against one posture.
   *
   * The postureKey is passed, never inferred. A card that guessed which
   * competitor it was arguing against would be wrong on any deal facing more
   * than one, and nothing on the page would say so.
   *
   * The negative header is prepended SERVER-SIDE, ahead of the model's first
   * token, so it is already in the streamed text this component buffers and it
   * reaches the DOCX with no second code path.
   */
  async function runCard(
    task: 'no-decision-card' | 'pricing-defense-card',
    postureKey: string,
    label: string,
  ) {
    setActiveTask(task);
    setExportError(null);
    setCard({
      kind: task === 'no-decision-card' ? 'no-decision' : 'pricing-defense',
      label,
      date: new Date().toISOString().slice(0, 10),
    });
    await ai.run({ task, dealId: deal.id, postureKey });
  }

  /**
   * Generate a meeting brief.
   *
   * The four inputs are passed, never inferred. Length in particular changes
   * the document rather than its tone — the agenda, the question count and the
   * warnings are all computed from it server-side — so a default guessed here
   * would silently produce the wrong meeting.
   */
  async function runMeetingPrep(input: {
    meetingTypeKey?: string;
    attendees?: string;
    meetingMinutes?: number;
    meetingDate?: string;
  }) {
    setActiveTask('meeting-prep');
    setCard(null);
    setExportError(null);
    await ai.run({ task: 'meeting-prep', dealId: deal.id, ...input });
  }

  /**
   * Render the finished output to DOCX.
   *
   * Posts the already-streamed text back to /api/forge rather than
   * regenerating: a second generation would produce a DIFFERENT document from
   * the one on screen, and the user would have no way to tell which they had
   * downloaded.
   */
  async function exportDocx(
    action: string,
    label: string | undefined,
    content: string,
    filename?: string,
    format: 'docx' | 'pdf' = 'docx',
  ) {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: deal.id,
          action,
          format,
          content,
          title: `${deal.company} — ${label ?? action}`,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setExportError(json.error ?? `Export failed (${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // An explicit name wins: a card's filename carries its posture and the
      // day it was built, and both have to be legible from the file listing
      // without opening it.
      a.download =
        filename ??
        res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ??
        `${deal.deal_id}-${action}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
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
    <div className="space-y-rhythm-page">
      <Link
        href="/app/pipeline"
        className="inline-flex min-h-tap items-center gap-1.5 text-sm text-text-dim hover:text-text lg:min-h-0"
      >
        <ArrowLeft size={14} /> Pipeline
      </Link>

      {/* ── 1. Header ── */}
      <header className="flex flex-wrap items-start gap-4">
        <HealthRing score={deal.health_score} size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-label text-text-faint">
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
              // Standalone, in its own paragraph — not a link inside a
              // sentence, so the inline exemption does not apply to it.
              className="inline-flex min-h-tap items-center text-xs text-text-dim no-underline hover:text-text lg:min-h-0"
            >
              See all coverage of {deal.company} →
            </EntityLink>
          </p>
          {/* ── The next move, not the checklist ──
              ⚠️ ONE OR TWO, ORDERED BY WHAT MATTERS AT THIS STAGE. The
              MEDDPICC card below shows all eight and that is right for a
              scorecard — it is the wrong thing to put at the top of a page,
              because eight gaps at equal weight tell the reader what they have
              not done rather than what to do next.

              When the stage's fields are all recorded this renders the plain
              sentence instead. It never reaches down the list for a
              lower-priority field to keep the slot full. */}
          <div className="mt-3 border-t border-rule pt-3">
            <p className="eyebrow">Next move at {deal.stage}</p>
            {(() => {
              const next = nextGaps({ ...deal, verified_empty: verifiedEmpty });
              if (next.length === 0) {
                return (
                  <p className="mt-1 max-w-measure text-sm text-text-dim">
                    {noGapMessage(deal.stage)}
                  </p>
                );
              }
              return (
                <ul className="mt-1 space-y-1">
                  {next.map((g) => (
                    <li key={g.field} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium text-text">{g.label}</span>
                      <GapInline
                        kind={g.kind}
                        onConfirm={(v) => void recordVerifiedEmpty(g.field, v)}
                        busy={markBusy === g.field}
                      />
                      <span className="text-text-dim">{g.hint}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            {markError ? (
              /* Beside the mark, never instead of it. */
              <p className="mt-1.5 text-xs text-danger">Not saved — {markError}</p>
            ) : null}
          </div>

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

      {readError ? (
        <ReadFailureBanner readError={readError} noun="account" />
      ) : isSeed ? (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          Template account — the MEDDPICC fields below are blank because they were never
          filled in, not because the deal is new. Sign in and load your Spine to see real
          data.
        </p>
      ) : null}

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
                    <EntityLink
                      entity={{ name: deal.utility, type: 'utility' }}
                      className="inline-flex min-h-tap items-center lg:min-h-0"
                    />
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

          {/* ── What the health number is made of ──
              The ring at the top of this page showed a score and nothing else,
              and the one sentence that explained it — "capped at 6" — was wrong
              on twenty of twenty-one deals, where the cap holds nothing down.
              Six terms with what each earned says it without a sentence. */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Health, term by term</CardTitle>
                <p className="mt-0.5 max-w-measure text-xs text-text-dim">
                  Every term, what it is worth, and what this deal earned.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <HealthComposition deal={deal} />
            </CardBody>
          </Card>

          {/* ── Critical event ── */}
          {/* Rendered in both states. An absent forcing function is the single
              strongest predictor of a no-decision loss, so leaving the section
              out when the field is empty would hide the finding — the deal
              would simply look like it had fewer sections. */}
          <Card>
            <CardHeader>
              <CardTitle>Critical event</CardTitle>
              {deal.critical_event_date ? (
                <span className="font-mono text-xs text-text-dim tabular-nums">
                  {formatDate(deal.critical_event_date)}
                </span>
              ) : null}
            </CardHeader>
            <CardBody>
              {deal.critical_event?.trim() ? (
                <>
                  <p className="text-sm text-text">{deal.critical_event}</p>
                  {!deal.critical_event_date ? (
                    <p className="mt-1 text-xs text-text-dim">
                      No date on record. The event alone still counts — a date sharpens it.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-text-dim">
                  <span className="text-text">None on record.</span> Nothing here makes doing
                  nothing expensive, so nothing explains why this closes on any particular date.
                  This caps health at 6 the same way single-threading does — no-decision is the
                  dominant loss mode, and an absent forcing function is its leading indicator.
                </p>
              )}
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
                  {/* ⚠️ THE GAP IS DRAWN, NOT LEFT BLANK.
                      This rendered `f.hint` as plain dim text for both a gap
                      and an unknown, so "we asked and there is nothing" and
                      "nobody has looked" were one line in one colour, told
                      apart only by a 14px icon. The ruled baseline carries the
                      distinction at row density: solid for a gap that is real,
                      dotted for one nobody has checked. */}
                  <p className="min-w-0 flex-1 truncate text-sm text-text-dim">
                    {typeof f.value === 'string' && f.value ? (
                      f.value
                    ) : typeof f.value === 'boolean' && f.value ? (
                      'Confirmed'
                    ) : (
                      <span className="inline-flex items-baseline gap-2">
                        <GapInline
                          kind={resolveKind(f.state, f.key, verifiedEmpty)}
                          onConfirm={(v) => void recordVerifiedEmpty(f.key, v)}
                          busy={markBusy === f.key}
                        />
                        <span className="text-text-faint">{f.hint}</span>
                      </span>
                    )}
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
                emptyLabel="Single-threaded — health cannot pass 6 while this is true"
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
                  // No count where the count would be a guess. `—` is not a
                  // quantity and does not read as one.
                  ['signals', intelError ? 'Signals (—)' : `Signals (${signals.length})`],
                  ['market', intelError ? 'Market watch (—)' : `Market watch (${marketWatch.length})`],
                  ['map', 'MAP'],
                  ['competitive', 'Competitive'],
                  ['prep', 'Meeting prep'],
                  ['outcome', winLossError ? 'Outcome (—)' : `Outcome (${winLoss.length})`],
                  ['history', intelError ? 'Stage history (—)' : `Stage history (${transitions.length})`],
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
                  {/* Legacy, and labelled as such. The competitive record is
                      the toggle grid on the Competitive tab; this is where
                      whatever was written before that existed still lives, and
                      nothing generated reads it. */}
                  {deal.competition ? (
                    <Field label="Competition (legacy note)" value={deal.competition} />
                  ) : null}
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
                (intelError ? (
                  <GapPanel kind="blocked" subject="signals" reason={intelError} />
                ) : signals.length === 0 ? (
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
                            <TimeAgo value={s.logged_at} />
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
                (intelError ? (
                  <GapPanel kind="blocked" subject="market watch entries" reason={intelError} />
                ) : marketWatch.length === 0 ? (
                  <Empty text="No market watch entries mapped to this account yet." />
                ) : (
                  <ul className="space-y-3">
                    {marketWatch.map((m) => (
                      <li key={m.id} className="border-b border-rule-faint pb-3 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <ProvenanceChip tier={m.source_tier} />
                          <Badge tone="neutral">{m.category}</Badge>
                          <span className="text-xs text-text-faint">
                            <TimeAgo value={m.swept_at} />
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
                (intelError ? (
                  <GapPanel kind="blocked" subject="stage history" reason={intelError} />
                ) : transitions.length === 0 ? (
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
                  company={deal.company}
                  dealCode={deal.deal_id}
                  criticalEvent={deal.critical_event}
                  criticalEventDate={deal.critical_event_date}
                  initial={mapPlan ?? starterPlan()}
                  businessCaseExists={Boolean(
                    deal.artifacts?.some((a) => a.type === 'business-case'),
                  )}
                />
              )}

              {tab === 'competitive' && (
                <>
                  <UtilityPanel deal={deal} utility={utility} />
                  <div className="mt-5" />
                  {competitiveError ? (
                    /* The card buttons live in this panel. Rendering the grid
                       from an empty array would put "Generate no-decision card"
                       under a competitive position nobody can vouch for. */
                    <GapPanel
                      kind="blocked"
                      subject="this deal's competitive position"
                      reason={competitiveError}
                    />
                  ) : (
                    <CompetitivePanel
                      deal={deal}
                      competitors={competitors}
                      busy={ai.streaming}
                      onGenerate={runCard}
                    />
                  )}
                </>
              )}

              {tab === 'prep' && (
                <MeetingPrepPanel
                  deal={deal}
                  busy={ai.streaming}
                  onGenerate={runMeetingPrep}
                />
              )}

              {tab === 'outcome' &&
                (winLossError ? (
                  <GapPanel kind="blocked" subject="outcomes" reason={winLossError} />
                ) : (
                  <WinLossList entries={winLoss} />
                ))}

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
                {card
                  ? cardTitle({ company: deal.company }, card.kind, card.label)
                  : taskLabel(activeTask) ?? 'Output'}
              </p>
              <AiOutput
                text={ai.text}
                streaming={ai.streaming}
                error={ai.error}
                provider={ai.provider}
                model={ai.model}
                onStop={ai.stop}
              />

              {/* Offered only once streaming has finished. A download button
                  over a half-streamed document produces a real file containing
                  half a document, which is worse than no button. */}
              {ai.text && !ai.streaming && !ai.error ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={exporting}
                    onClick={() =>
                      card
                        ? exportDocx(
                            activeTask ?? 'output',
                            `${card.kind === 'no-decision' ? 'No-decision case' : 'Pricing defense'} vs ${card.label}`,
                            ai.text,
                            cardFilename({ company: deal.company }, card.kind, card.label, card.date),
                          )
                        : exportDocx(
                            activeTask ?? 'output',
                            taskLabel(activeTask),
                            ai.text,
                          )
                    }
                  >
                    <Download size={14} /> {exporting ? 'Rendering…' : 'Export DOCX'}
                  </Button>
                  {/* The third built-but-unreachable surface in this build,
                      after the stage field and log_win_loss. The route serves
                      PDF and takes a page size; nothing called it. A working
                      server side with no caller is indistinguishable from a
                      missing feature to everyone except the person who wrote
                      it. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={exporting}
                    onClick={() =>
                      card
                        ? exportDocx(
                            activeTask ?? 'output',
                            `${card.kind === 'no-decision' ? 'No-decision case' : 'Pricing defense'} vs ${card.label}`,
                            ai.text,
                            cardFilename({ company: deal.company }, card.kind, card.label, card.date)
                              .replace(/\.docx$/, '.pdf'),
                            'pdf',
                          )
                        : exportDocx(
                            activeTask ?? 'output',
                            taskLabel(activeTask),
                            ai.text,
                            undefined,
                            'pdf',
                          )
                    }
                  >
                    <FileDown size={14} /> {exporting ? 'Rendering…' : 'Export PDF'}
                  </Button>
                  {exportError ? (
                    <span role="status" className="text-xs text-danger">
                      {exportError}
                    </span>
                  ) : null}
                </div>
              ) : null}
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

          {/* Advancing, not closing. Offered on EVERY deal including terminal
              ones — a closed deal that comes back is a real thing, and the
              control names what reopening leaves inconsistent rather than
              refusing the move. */}
          <div className="pt-2 [&>button]:w-full [&>button]:justify-start">
            <StageControl deal={deal} />
          </div>

          {/* Closes the deal AND records the buyer's words in one write. Not
              offered on a deal that is already terminal. */}
          {!TERMINAL_STAGES.includes(deal.stage as DealStage) ? (
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                onClick={() => setClosing(true)}
              >
                <Quote size={14} /> Log outcome
              </Button>
            </div>
          ) : null}

          <p className="pt-2 text-xs text-text-faint">
            Briefs, plans, MAPs, and qualification run on the PowerDeal methodology —
            Claude only, never a cheaper model.
          </p>
        </aside>
      </div>

      {closing && (
        <LogOutcome
          dealId={deal.id}
          company={deal.company}
          onClose={() => setClosing(false)}
        />
      )}

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
