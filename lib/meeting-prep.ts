import type { Deal, DealStage, MarketWatchEntry, Signal } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * MEETING PREP — the parts that are arithmetic, not judgement.
 * ═══════════════════════════════════════════════════════════════
 *
 * The skill file (`skills/SKILL-meeting-prep.md`) holds the doctrine: thirteen
 * persona playbooks, sixteen meeting types, the methodology matrix and the
 * landmine library. None of that is reproduced here — it is handed to the model
 * verbatim, because a paraphrase in TypeScript is a second copy of doctrine and
 * second copies drift.
 *
 * What IS here is everything the model should not be guessing at:
 *
 *   TIME. Ninety minutes and thirty minutes are different meetings, and a model
 *   asked to "keep it tight" produces the same eight blocks with shorter
 *   sentences. The minutes are allocated in code and printed on the brief.
 *
 *   THE WALK-OUT CHECKLIST. The skill says "always includes" five items. Which
 *   of the five are ALREADY on the record is a fact about this deal, and asking
 *   a champion for a name we already hold is how a rep loses a room. Computed
 *   from the live Spine fields, never inferred.
 *
 *   OPENER BRANCH CONDITIONS. Three openers is the skill's instruction; WHICH
 *   ONE to use is a read of the room, and the read has preconditions the record
 *   can answer — is there a dated signal to lead with, is there a champion, is
 *   this first contact. The condition is computed, the words are the model's.
 *
 *   THE GATE TRANSLATION. The skill is written in G0–G8; the Spine ladder is
 *   eleven named commercial stages. Mapping between them is lossy and is
 *   labelled as lossy wherever it is printed.
 *
 * PURE. No fs, no network, no Supabase. The prompt module composes it, the
 * tests exercise it, and both read this implementation.
 */

// ── Meeting types ───────────────────────────────────────────────

export interface MeetingType {
  key: string;
  label: string;
  /** The engineering gate band this meeting is trying to pass, from §5. */
  gates: string;
  personas: string;
  objective: string;
}

/** STEP 2 of the skill — the router, as data, so the caller can offer it. */
export const MEETING_TYPES: readonly MeetingType[] = [
  { key: 'intro', label: 'Intro / First Call', gates: 'G0', personas: 'Energy Mgr, Facilities, BD contact', objective: 'Qualify, earn next meeting' },
  { key: 'lunch-and-learn', label: 'Lunch & Learn', gates: 'G0–G1', personas: 'Mixed: technical + business', objective: 'Teach the no-tradeoff story, expand the stakeholder map' },
  { key: 'technical', label: 'Technical Deep-Dive', gates: 'G1', personas: 'Principal Eng, Electrical Eng, Reliability Eng', objective: 'Site feasibility, load data, integration path' },
  { key: 'commercial', label: 'Commercial / Economic', gates: 'G2', personas: 'Energy Mgr, Finance Dir, VP Operations', objective: 'Land the value case with their numbers' },
  { key: 'executive', label: 'C-Suite / Executive', gates: 'G2–G3', personas: 'CEO, COO, SVP, VP', objective: 'Strategic framing, executive sponsorship' },
  { key: 'cfo', label: 'CFO / Finance', gates: 'G2–G4', personas: 'CFO, VP Finance, Controller, Treasury', objective: 'Capital structure, ROI, risk transfer' },
  { key: 'sustainability', label: 'Sustainability / ESG', gates: 'G2–G3', personas: 'CSO, ESG Dir, Legal', objective: 'REC pathway, Scope 1/2, ESG alignment' },
  { key: 'permitting', label: 'Permitting / Regulatory', gates: 'G3', personas: 'Env. Compliance, EHS Director, Legal, Permit Mgr', objective: 'Permit path, no-combustion advantage, timeline' },
  { key: 'procurement', label: 'Procurement', gates: 'G4–G5', personas: 'VP Procurement, Strategic Sourcing, Supply Chain', objective: 'RFP/sole-source, evaluation criteria, terms' },
  { key: 'engineering', label: 'Engineering Design', gates: 'G5', personas: 'Electrical Eng, Facilities Eng, Controls/SCADA', objective: 'One-line, integration specs, interconnection' },
  { key: 'legal', label: 'Legal / Contracting', gates: 'G4–G6', personas: 'General Counsel, Outside Counsel, Contract Mgr', objective: 'Term sheet, PPA/EaaS, redline strategy' },
  { key: 'negotiation', label: 'Negotiation', gates: 'G4–G6', personas: 'Procurement + Legal + CFO', objective: 'BATNA, concession map, term-by-term' },
  { key: 'security', label: 'Security / Classified', gates: 'G1–G3', personas: 'Security Dir, CISO, FSO, Program Security', objective: 'Vetting, access, classified facility constraints' },
  { key: 'operations', label: 'Program / Operations', gates: 'G1–G3', personas: 'Program Mgr, Plant Mgr, VP Operations', objective: 'Production continuity, integration timeline' },
  { key: 'board', label: 'Board / Investment Comm.', gates: 'G3–G4', personas: 'Board Members, PE Sponsor, Investment Committee', objective: 'Capital approval, risk/return, strategic fit' },
  { key: 'post-sale', label: 'Post-Sale / O&M', gates: 'G8', personas: 'Facilities Mgr, O&M Lead, Plant Ops', objective: 'Performance, expansion, champion reactivation' },
];

const MEETING_BY_KEY = new Map(MEETING_TYPES.map((m) => [m.key, m]));

export function meetingType(key: string): MeetingType | undefined {
  return MEETING_BY_KEY.get(key);
}

/**
 * Meeting types whose room is operational or technical rather than commercial.
 * Used only to decide whether the mission/reliability opener is the natural one.
 */
const OPERATIONAL_MEETINGS = new Set([
  'technical', 'engineering', 'operations', 'security', 'permitting', 'post-sale',
]);

// ── Gate translation ────────────────────────────────────────────

/**
 * Spine stage → engineering gate band.
 *
 * LOSSY, AND SAID SO EVERYWHERE IT IS PRINTED. §5 of the system prompt is
 * explicitly "the engineering view" — G0–G8 tracks the physical project from
 * feasibility to O&M handover, while the Spine ladder tracks the commercial
 * pursuit. They run alongside each other and they are not the same axis: a deal
 * can sit in Negotiation commercially while the engineering work is still at
 * site feasibility.
 *
 * So this returns a BAND, never a point, and the caller prints the Spine stage
 * next to it. Collapsing the two into one number would be inventing a fact.
 */
export function gateBand(stage: DealStage | string): string {
  switch (stage) {
    case 'Prospecting':
    case 'Qualified':
    case 'Intro Call':
    case 'Discovery':
      return 'G0';
    case 'Solution Design':
      return 'G1–G2';
    case 'Economic Proposal':
      return 'G2–G3';
    case 'Negotiation':
      return 'G4';
    case 'Contracting':
      return 'G4–G6';
    case 'Closed-Won':
      return 'G6';
    case 'Post-Sale':
      return 'G8';
    case 'Archived':
      return 'none — the deal is out of the pipeline';
    default:
      return 'unknown';
  }
}

// ── Time-boxing ─────────────────────────────────────────────────

export interface AgendaSegment {
  key: 'opener' | 'situation-problem' | 'implication-payoff' | 'their-questions' | 'close';
  label: string;
  minutes: number;
}

export interface TimeBox {
  total: number;
  segments: AgendaSegment[];
  /** How many core questions actually fit, at ~3 minutes each with the answer. */
  coreQuestions: number;
  /** Named when the clock forces something out of the standard structure. */
  warnings: string[];
}

const SEGMENTS: { key: AgendaSegment['key']; label: string; weight: number }[] = [
  { key: 'opener', label: 'Opener / frame', weight: 0.10 },
  { key: 'situation-problem', label: 'Situation + Problem', weight: 0.32 },
  { key: 'implication-payoff', label: 'Implication + Need-Payoff', weight: 0.28 },
  { key: 'their-questions', label: 'Their questions / our answers', weight: 0.15 },
  { key: 'close', label: 'Close — multi-thread, urgency, next step', weight: 0.15 },
];

/** Minutes the close gets before anything else is allowed to have them. */
const CLOSE_FLOOR = 4;
/** Minutes a core question consumes in the room, question plus answer. */
const MINUTES_PER_QUESTION = 3;

/**
 * Allocate the clock.
 *
 * LARGEST REMAINDER, then a TRANSFER to protect the close. Both chosen so the
 * segments sum to exactly the total by construction rather than by rounding
 * luck — an agenda whose parts add to 31 minutes for a 30-minute meeting is
 * wrong in the way nobody notices until they are eight minutes over and have
 * not asked for the next meeting.
 *
 * The close is the protected segment. Running out of time costs a deal the
 * multi-thread ask and the dated next step, which are two of the five
 * must-walk-out items; running out of time on implication questions costs one
 * question. So minutes are taken from the discretionary end — their questions
 * first, then implication — and never from the close.
 *
 * NO HARD FLOOR ON THE MEETING. A fifteen-minute slot still gets a brief; it
 * gets a brief that says out loud what has been cut.
 */
export function timeBox(totalMinutes: number): TimeBox {
  const total = Math.max(0, Math.round(totalMinutes));
  const warnings: string[] = [];

  if (total === 0) {
    return {
      total: 0,
      segments: SEGMENTS.map((s) => ({ key: s.key, label: s.label, minutes: 0 })),
      coreQuestions: 0,
      warnings: ['No meeting length supplied — the agenda below carries no clock. Ask for the slot length and regenerate.'],
    };
  }

  // Largest remainder: floor every share, then hand the leftover minutes to the
  // segments with the biggest fractional parts, ties broken by declared order.
  const exact = SEGMENTS.map((s) => s.weight * total);
  const minutes = exact.map((v) => Math.floor(v));
  let leftover = total - minutes.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    minutes[order[k].i] += 1;
    leftover -= 1;
  }

  // Protect the close, taking from the discretionary end. Transfers preserve
  // the sum, which is why this is a transfer and not a re-allocation.
  const idx = (key: AgendaSegment['key']) => SEGMENTS.findIndex((s) => s.key === key);
  const closeIdx = idx('close');
  const closeTarget = Math.min(CLOSE_FLOOR, total);
  for (const donor of ['their-questions', 'implication-payoff', 'situation-problem'] as const) {
    if (minutes[closeIdx] >= closeTarget) break;
    const d = idx(donor);
    const take = Math.min(minutes[d], closeTarget - minutes[closeIdx]);
    minutes[d] -= take;
    minutes[closeIdx] += take;
  }

  const segments = SEGMENTS.map((s, i) => ({
    key: s.key,
    label: s.label,
    minutes: minutes[i],
  }));

  const coreMinutes =
    minutes[idx('situation-problem')] + minutes[idx('implication-payoff')];
  const coreQuestions = Math.min(10, Math.floor(coreMinutes / MINUTES_PER_QUESTION));

  if (coreQuestions < 6) {
    warnings.push(
      `Only ${coreQuestions} core question${coreQuestions === 1 ? '' : 's'} fit in ${total} minutes at ~${MINUTES_PER_QUESTION} min each — the skill's 6–10 range does not. Cut Implication questions first; the Situation questions are what stop you re-asking what is already on the record.`,
    );
  }
  if (minutes[idx('their-questions')] === 0) {
    warnings.push(
      'No time budgeted for their questions. Say so at the top of the meeting and offer a follow-up slot, rather than discovering it at minute 28.',
    );
  }

  return { total, segments, coreQuestions, warnings };
}

// ── Walk-out checklist, from live deal state ────────────────────

export interface WalkOutItem {
  key:
    | 'pain-number'
    | 'new-stakeholder'
    | 'decision-driver'
    | 'decision-process'
    | 'next-step'
    | 'economic-buyer'
    | 'critical-event';
  label: string;
  /** `open` — this meeting must get it. `known` — confirm it, do not re-ask. */
  status: 'open' | 'known';
  /** What the Spine already holds, when it holds anything. */
  have: string | null;
  /** The Spine field(s) this reads, named as the Spine names them. */
  fields: string[];
}

function text(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * The five must-walk-out items, resolved against the record — plus the two
 * account-level holes that outrank them when they are open.
 *
 * THE POINT IS `known`. The skill's list is what a good meeting produces; this
 * says which of it we already have. A rep who asks a champion "and who else
 * should be in the room?" when the champion's name is already in the Spine has
 * told the room nobody was listening last time. Known items become confirm-and-
 * move-on, which is what buys the minutes for the open ones.
 *
 * Economic buyer and critical event are appended only when MISSING, because
 * when present they are ordinary record and when absent they are the two
 * strongest predictors of a no-decision loss this build tracks — critical event
 * caps health at 6 on its own.
 */
export function walkOutChecklist(deal: Deal): WalkOutItem[] {
  const items: WalkOutItem[] = [
    {
      key: 'pain-number',
      label: 'The quantified pain number, in their words and their math',
      status: deal.metrics_known && text(deal.identified_pain) ? 'known' : 'open',
      have: text(deal.identified_pain),
      fields: ['metrics_known', 'identified_pain'],
    },
    {
      key: 'new-stakeholder',
      label: 'One new stakeholder name — break the single thread',
      // Multi-threaded is the condition the ask exists to create, so a
      // multi-threaded deal with a named champion is the only `known` state.
      status: deal.multi_threaded && text(deal.champion) ? 'known' : 'open',
      have: text(deal.champion),
      fields: ['champion', 'multi_threaded'],
    },
    {
      key: 'decision-driver',
      label: 'The dominant decision driver for this persona',
      status: text(deal.decision_criteria) ? 'known' : 'open',
      have: text(deal.decision_criteria),
      fields: ['decision_criteria'],
    },
    {
      key: 'decision-process',
      label: 'One component of the decision process — who, what threshold, what step',
      status: deal.decision_mapped && text(deal.decision_process) ? 'known' : 'open',
      have: text(deal.decision_process),
      fields: ['decision_process', 'decision_mapped'],
    },
    {
      key: 'next-step',
      label: 'A named next step with a date',
      // A next move with no date is not a next step. That is the whole defect
      // this item exists to catch, so the date is part of the condition.
      status: text(deal.next_move) && text(deal.next_move_date) ? 'known' : 'open',
      have: text(deal.next_move)
        ? `${deal.next_move}${deal.next_move_date ? ` (${deal.next_move_date})` : ' — NO DATE'}`
        : null,
      fields: ['next_move', 'next_move_date'],
    },
  ];

  if (!text(deal.economic_buyer)) {
    items.push({
      key: 'economic-buyer',
      label: 'The name of the person who signs, and the threshold that sends it higher',
      status: 'open',
      have: null,
      fields: ['economic_buyer'],
    });
  }

  if (!text(deal.critical_event)) {
    items.push({
      key: 'critical-event',
      label: 'A forcing function — the deadline, budget cycle or milestone that makes doing nothing expensive on a date',
      status: 'open',
      have: null,
      fields: ['critical_event', 'critical_event_date'],
    });
  }

  return items;
}

// ── Market intel, dated ─────────────────────────────────────────

export interface IntelRow {
  /** The signal itself, as the record states it. Never rewritten here. */
  signal: string;
  /**
   * When the item entered OUR record — a sweep date or a log date, not the date
   * the underlying event happened. Those are routinely weeks apart and the
   * record does not hold the second one.
   */
  recordedOn: string | null;
  /** The re-engagement line the sweep already produced, when it produced one. */
  hook: string | null;
  tier: string;
  source: string | null;
}

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Market intel for the openers, every row dated.
 *
 * A hook with no date is not usable in a room. "Your utility filed for an
 * increase" invites "when?", and the rep who cannot answer has just spent the
 * credibility the opener was supposed to buy. So the date travels with the
 * signal, and a row that has none is kept and marked rather than dropped —
 * dropping it would hide a gap the rep could close with one search.
 *
 * The date is the RECORD date and is labelled as such. Presenting a sweep date
 * as the date of the underlying event is exactly the class of quiet
 * misstatement the provenance rules exist to prevent.
 */
export function marketIntelRows(
  entries: MarketWatchEntry[] = [],
  signals: Signal[] = [],
  limit = 8,
): IntelRow[] {
  const fromWatch: IntelRow[] = entries.map((e) => ({
    signal: e.headline,
    recordedOn: day(e.swept_at),
    hook: text(e.outreach_hook),
    tier: e.source_tier,
    source: text(e.source_name),
  }));

  const fromSignals: IntelRow[] = signals.map((s) => ({
    signal: text(s.raw_signal) ?? `${s.signal_type} signal (no text logged)`,
    recordedOn: day(s.logged_at),
    hook: text(s.so_what),
    tier: 'logged-signal',
    source: text(s.source_name),
  }));

  // Market watch first: it is swept against this account deliberately, while a
  // logged signal may be an account note that never had an opener in it.
  return [...fromWatch, ...fromSignals].slice(0, limit);
}

export function undatedIntel(rows: IntelRow[]): IntelRow[] {
  return rows.filter((r) => !r.recordedOn);
}

// ── Opener branches ─────────────────────────────────────────────

export interface OpenerBranch {
  id: 'A' | 'B' | 'C';
  angle: string;
  /** The condition that picks this one. Computed from the record. */
  selectWhen: string;
  /** The record item that grounds it, or null when nothing does. */
  grounding: string | null;
  /** What to go get if this branch is the right one but has no grounding. */
  gap: string | null;
}

/**
 * Three openers, each with the condition that selects it.
 *
 * The skill says "2–3 options, pick one based on room read". A brief that
 * prints three openers and no selection rule has moved the decision to the
 * hallway thirty seconds before the meeting, which is where it gets made badly.
 * So each branch carries its condition, and the conditions are answered from
 * the record wherever the record can answer them.
 *
 * Branch A is the Challenger open and it REQUIRES a dated signal. Without one
 * it is still printed — with the gap named — because "we have nothing dated to
 * lead with" is itself a finding, and it is the one that sends the rep to
 * market-watch before the meeting rather than after it.
 */
export function openerBranches(
  deal: Deal,
  intel: IntelRow[],
  meetingKey?: string,
): OpenerBranch[] {
  const dated = intel.filter((r) => r.recordedOn);
  const lead = dated[0] ?? null;
  const operational = meetingKey ? OPERATIONAL_MEETINGS.has(meetingKey) : false;
  const pain = text(deal.identified_pain) ?? text(deal.key_risk);
  const coldRoom = !text(deal.champion) || !deal.multi_threaded;

  return [
    {
      id: 'A',
      angle: 'Data-driven insight about THEIR business — Challenger open',
      selectWhen: lead
        ? `The room is warm enough to be taught something. Lead with: "${lead.signal}" (in the record as of ${lead.recordedOn}).`
        : 'Do NOT lead with this one — nothing dated on the record grounds it. Run market-watch for this account first.',
      grounding: lead ? `${lead.signal} — recorded ${lead.recordedOn}${lead.source ? `, ${lead.source}` : ''}` : null,
      gap: lead
        ? null
        : 'No dated market signal mapped to this account. Run market-watch for this account before the meeting — a Challenger open with an undated claim is worse than a soft open, because it invites "when did that happen?" and spends the credibility it was meant to buy.',
    },
    {
      id: 'B',
      angle: operational
        ? 'Reliability / mission continuity — the operational stake'
        : 'Reliability / mission angle — the operational stake behind the numbers',
      selectWhen: operational
        ? `The room is technical or operational (${meetingType(meetingKey ?? '')?.label ?? 'operational meeting'}), so the stake lands harder than the arithmetic.`
        : `The room turns out to be more operational than billed, or ${deal.vertical} continuity comes up first.`,
      grounding: pain ? `On record: ${pain}` : null,
      gap: pain
        ? null
        : 'No identified pain or key risk on the record — this opener has nothing specific to name, so it will land generic. That gap is itself the first Situation question.',
    },
    {
      id: 'C',
      angle: 'Soft open — no insight claim, ask for their frame first',
      selectWhen: coldRoom
        ? `Cold or unmapped room — ${!text(deal.champion) ? 'no champion on record' : 'single-threaded'}. This is the safe default here.`
        : 'The room reads cautious, arrives late, or the senior person is unexpected. Costs nothing, buys the read.',
      grounding: null,
      // A soft open needs no grounding, which is exactly why it is the fallback.
      gap: null,
    },
  ];
}
