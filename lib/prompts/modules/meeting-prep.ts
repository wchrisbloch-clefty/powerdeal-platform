import { SYSTEM_PROMPT } from '../system';
import { loadSkill, skillBlock } from '@/lib/skills/load';
import { INLINE_SOURCE_RULE, RETURN_PATH_RULE } from '@/lib/provenance';
import {
  gateBand, marketIntelRows, meetingType, openerBranches, timeBox,
  undatedIntel, walkOutChecklist,
  type IntelRow, type OpenerBranch, type TimeBox, type WalkOutItem,
} from '@/lib/meeting-prep';
import type { ChatInput } from '@/lib/types';
import { dealBlock, signalsBlock, territoryBlock, type PromptContext } from './shared';

/**
 * MEETING PREP — the generator.
 *
 * The doctrine is `skills/SKILL-meeting-prep.md` and it is embedded VERBATIM.
 * Thirteen persona playbooks and a landmine library are exactly the kind of
 * content that degrades when summarised, and the summary would be a second copy
 * of doctrine living in code — the failure this repo has now hit twice, once
 * with the brain at v3.1.8 and once with the skills that were never here at all.
 *
 * Everything this module ADDS is a fact the model should not be guessing:
 * the clock, which of the walk-out items are already on the record, which
 * opener the record can actually ground, and the intel with its dates. The
 * skill supplies the shape; the Spine supplies the specifics.
 *
 * NO HARD GATE. Missing skill file, missing signals, missing economics, missing
 * meeting length — all generate. Each one is named in the output instead.
 */

function timeBlock(box: TimeBox): string {
  const rows = box.segments
    .map((s) => `  ${String(s.minutes).padStart(3)} min  ${s.label}`)
    .join('\n');

  const lines = [
    box.total > 0
      ? `TIME BUDGET — ${box.total} minutes, allocated:`
      : 'TIME BUDGET — no meeting length supplied:',
    rows,
    '',
    `Core questions that fit: ${box.coreQuestions}. Write exactly that many, not more.`,
    '',
    'Print this allocation at the top of the brief as a running clock, minute',
    'marks included ("0–3 open · 3–13 situation + problem · …"), so the rep can',
    'see at a glance where they are. A brief that budgets nothing produces the',
    'same meeting every time regardless of the slot.',
  ];

  for (const w of box.warnings) lines.push('', `CLOCK WARNING: ${w}`);
  return lines.join('\n');
}

function walkOutBlock(items: WalkOutItem[]): string {
  const lines = items.map((i) => {
    if (i.status === 'known') {
      return `  [ON RECORD] ${i.label}\n      Spine holds: ${i.have}\n      → CONFIRM in one sentence, do not re-ask. Re-asking what is already recorded tells the room nobody listened last time.`;
    }
    return `  [OPEN] ${i.label}\n      Spine fields: ${i.fields.join(', ')} — empty.\n      → This meeting must get it.`;
  });

  return [
    'MUST-WALK-OUT-WITH — resolved against the live Spine record:',
    '',
    ...lines,
    '',
    'Reproduce this list in the brief with the ON RECORD / OPEN split intact. An',
    'undifferentiated checklist sends the rep to spend meeting minutes on things',
    'already answered, and the open items are what the clock above is for.',
  ].join('\n');
}

function openerBlock(branches: OpenerBranch[]): string {
  const lines = branches.map((b) => {
    const parts = [
      `  OPTION ${b.id} — ${b.angle}`,
      `      SELECT WHEN: ${b.selectWhen}`,
    ];
    if (b.grounding) parts.push(`      GROUNDED IN: ${b.grounding}`);
    if (b.gap) parts.push(`      GAP: ${b.gap}`);
    return parts.join('\n');
  });

  return [
    'OPENERS — three branches, each with the condition that selects it:',
    '',
    ...lines,
    '',
    'Write the actual opening words for all three. Carry the SELECT WHEN line',
    'into the brief above each one — three openers with no selection rule move',
    'the decision to the hallway thirty seconds before the meeting, which is',
    'where it gets made badly.',
    '',
    'An option whose GAP is stated still gets written, with the gap printed under',
    'it. Do not fabricate a signal, a filing, a date or a peer move to ground an',
    'opener. An opener built on an invented fact fails in the room, in front of',
    'the person who knows the real number.',
  ].join('\n');
}

function intelBlock(rows: IntelRow[]): string {
  if (rows.length === 0) {
    return [
      'MARKET INTEL: nothing mapped to this account.',
      '',
      'Print the Signal / Use As / Timing table with a single row reading',
      '"No market intel mapped to this account — run market-watch before the',
      'meeting." Do not populate it from general knowledge. A rate filing that',
      'is not in the record is a rate filing nobody has checked, and quoting one',
      'in the room is the fastest way to lose the room.',
    ].join('\n');
  }

  const undated = undatedIntel(rows);
  const table = rows
    .map(
      (r) =>
        `  - ${r.signal}\n      recorded: ${r.recordedOn ?? 'NO DATE ON RECORD'}` +
        ` · tier: ${r.tier}${r.source ? ` · ${r.source}` : ''}` +
        (r.hook ? `\n      existing hook: ${r.hook}` : ''),
    )
    .join('\n');

  const lines = [
    `MARKET INTEL MAPPED TO THIS ACCOUNT (${rows.length}):`,
    table,
    '',
    'Build a three-column table titled "Market Intel" with these columns and no',
    'others:',
    '',
    '  | Signal | Use As | Timing |',
    '',
    '  Signal — the item as stated above, WITH its date, verbatim. Do not',
    '           rewrite the claim and do not add one that is not listed.',
    '  Use As — what this buys in this room: an opener, an implication question,',
    '           a landmine defuse, or the urgency anchor at the close.',
    '  Timing — where in the meeting it goes, against the clock above.',
    '',
    'DATES ARE RECORD DATES. The date on each row is when the item entered our',
    'record — a sweep or a log — NOT when the underlying event happened. Those',
    'are routinely weeks apart. Write it as "in our record as of <date>" and',
    'never as "on <date>, the utility filed…". State the distinction once,',
    'under the table.',
  ];

  if (undated.length > 0) {
    lines.push(
      '',
      `${undated.length} of these rows carry NO DATE. Mark each one "(undated — confirm before using in the room)" in the Signal column. An undated hook invites "when?" and the rep who cannot answer has spent the credibility the opener was meant to buy.`,
    );
  }

  return lines.join('\n');
}

export interface MeetingPrepContext extends PromptContext {
  /** Key from MEETING_TYPES. Absent is allowed — the brief says so. */
  meetingTypeKey?: string;
  /** Free text: who is in the room, as the user typed it. */
  attendees?: string;
  /** Slot length. 0 or absent produces a clock warning, not a refusal. */
  minutes?: number;
  /** ISO date of the meeting, when known. */
  meetingDate?: string;
}

export function buildMeetingPrepPrompt(ctx: MeetingPrepContext): ChatInput {
  const { deal, signals, marketWatch } = ctx;

  const type = meetingType(ctx.meetingTypeKey ?? '');
  const box = timeBox(ctx.minutes ?? 0);
  const intel = marketIntelRows(marketWatch, signals);
  const branches = openerBranches(deal, intel, ctx.meetingTypeKey);
  const checklist = walkOutChecklist(deal);

  return {
    system: SYSTEM_PROMPT,
    user: `Run MEETING PREP for ${deal.company}.

${skillBlock('meeting-prep')}

Follow that skill's eight-block structure and its output format exactly. The
blocks below supply the account specifics; where the skill and these blocks
both speak, these blocks win, because they are read from the live record.

THE MEETING:
  Type      : ${type ? `${type.label} — primary objective: ${type.objective}` : `${ctx.meetingTypeKey ?? 'not specified'} — no router entry. Say so, treat it as an Intro / First Call, and name the assumption in the first line of the brief.`}
  Attendees : ${ctx.attendees?.trim() || 'not supplied — infer likely personas from the meeting type and SAY that you inferred them. Ask for the attendee list in the Open Questions.'}
  Date      : ${ctx.meetingDate?.trim() || 'not supplied'}
  Length    : ${box.total > 0 ? `${box.total} minutes` : 'not supplied'}

STAGE — two axes, do not collapse them:
  Spine stage      : ${deal.stage} (${deal.days_in_stage} days in stage)
  Engineering gate : ${gateBand(deal.stage)}${type ? ` · this meeting type targets ${type.gates}` : ''}
  The Spine ladder is the commercial pursuit; G0–G8 is the engineering view of
  the physical project. They run alongside each other and a deal can sit in
  Negotiation commercially while engineering is still at feasibility. Name the
  Meeting Goal against the SPINE stage, and reference the gate band as the
  engineering checkpoint it is. Do not state a single gate number as if the two
  axes were one.

  MEDDPICC: ${deal.meddpicc_score}/8 · Health: ${deal.health_score}/10 · ${deal.multi_threaded ? 'multi-threaded' : 'SINGLE-THREADED'} · ${deal.decision_mapped ? 'decision mapped' : 'decision process NOT mapped'}

${timeBlock(box)}

${openerBlock(branches)}

${walkOutBlock(checklist)}

${intelBlock(intel)}

FILLERS — five, and they are not optional. Five no-wrong-answer questions the
rep can drop when the room goes quiet or answers in three words. They must be
genuinely easy: about their world, their history at the site, their own view of
what is hard. Not disguised discovery. A filler that is a qualification question
wearing a hat does not release the pressure it exists to release.

${INLINE_SOURCE_RULE}

${RETURN_PATH_RULE}

ACCOUNT RECORD:
${dealBlock(deal)}

TERRITORY:
${territoryBlock(deal)}

RECENT SIGNALS:
${signalsBlock(signals)}
${ctx.extra ? `\n\nADDITIONAL CONTEXT FROM THE USER:\n${ctx.extra}` : ''}`,
    maxTokens: 8000,
  };
}

/**
 * The header emitted BEFORE the model runs when the skill file is unavailable.
 *
 * Same mechanism as the competitive cards' negative header, for the same
 * reason: a caveat the model was asked to write is a caveat that vanishes when
 * generation fails halfway or when the model simply does not comply, and the
 * reader is then holding a document that looks complete. Built in code, emitted
 * first, survives to the DOCX export with no second path to keep in step.
 *
 * Returns undefined when the skill loaded — nothing to warn about.
 */
export function meetingPrepDegradedHeader(): string | undefined {
  const loaded = loadSkill('meeting-prep');
  if (loaded.ready) return undefined;
  return [
    '> **DEGRADED — the Meeting Prep skill file was not available.**',
    `> ${loaded.error}`,
    '> This brief runs on the base methodology in the system prompt. The persona',
    '> playbooks, the methodology matrix and the landmine library are NOT in play.',
    '',
    '',
  ].join('\n');
}
