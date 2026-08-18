'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, CircleCheck, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import {
  MEETING_TYPES, gateBand, timeBox, walkOutChecklist,
} from '@/lib/meeting-prep';
import type { Deal } from '@/lib/types';

/**
 * MEETING PREP — the four inputs, and what the record already answers.
 *
 * The panel exists because a generator nothing calls is the defect this build
 * already shipped once: `PATCH /api/deals/[id]` accepted a stage for months and
 * no component ever sent one.
 *
 * FOUR INPUTS, THREE OF THEM OPTIONAL. Meeting type routes to a persona
 * playbook, so it is the one worth asking for; attendees, date and length all
 * generate without an answer and name their own absence in the brief. Nothing
 * is required, on the same rule as the competitive grid — a form that costs
 * four fields before it returns anything is a form used once.
 *
 * THE PREVIEW IS NOT DECORATION. The clock and the walk-out split are computed
 * from the same pure module the prompt uses, so what the rep sees here is what
 * the brief will say. Showing the ON RECORD items before generating is also the
 * cheapest possible correction: if the Spine thinks a champion is named and no
 * champion is named, that is visible now rather than in the room.
 */

/** Common slot lengths. Anything else can be typed. */
const PRESETS = [30, 45, 60, 90];

export default function MeetingPrepPanel({
  deal,
  onGenerate,
  busy = false,
}: {
  deal: Deal;
  onGenerate: (input: {
    meetingTypeKey?: string;
    attendees?: string;
    meetingMinutes?: number;
    meetingDate?: string;
  }) => void;
  busy?: boolean;
}) {
  const [typeKey, setTypeKey] = useState('');
  const [attendees, setAttendees] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [date, setDate] = useState('');

  const box = useMemo(() => timeBox(minutes), [minutes]);
  const checklist = useMemo(() => walkOutChecklist(deal), [deal]);
  const open = checklist.filter((i) => i.status === 'open');

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Meeting type</p>
          <p className="text-2xs text-text-faint">Routes the persona playbook</p>
        </div>
        <select
          value={typeKey}
          onChange={(e) => setTypeKey(e.target.value)}
          aria-label="Meeting type"
          className="mt-2 min-h-tap lg:min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent-mark focus:outline-none"
        >
          <option value="">Not specified — treated as an intro call</option>
          {MEETING_TYPES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label} · {m.gates}
            </option>
          ))}
        </select>
        {typeKey ? (
          <p className="mt-1 text-2xs text-text-faint">
            {MEETING_TYPES.find((m) => m.key === typeKey)?.objective}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="mp-attendees" className="eyebrow mb-1 block">
            Who is in the room
          </label>
          <input
            id="mp-attendees"
            type="text"
            value={attendees}
            placeholder="Ana Liu (CFO), Dev Rao (Facilities)"
            onChange={(e) => setAttendees(e.target.value)}
            className="min-h-tap lg:min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-mark focus:outline-none"
          />
          <p className="mt-0.5 text-2xs text-text-faint">
            Blank is fine — personas get inferred from the meeting type and the brief
            says it inferred them.
          </p>
        </div>

        <div>
          <label htmlFor="mp-date" className="eyebrow mb-1 block">
            Date
          </label>
          <input
            id="mp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-tap lg:min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent-mark focus:outline-none"
          />
        </div>
      </div>

      {/* ── The clock ── */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">How long you have</p>
          <p className="text-2xs text-text-faint">Changes the document, not the tone</p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={cn(
                'min-h-tap lg:min-h-tap-sm rounded-sm border px-2.5 text-xs transition-colors duration-fast',
                minutes === m
                  ? 'border-accent-mark bg-accent-bg text-accent-dim'
                  : 'border-rule text-text-dim hover:text-text',
              )}
            >
              {m} min
            </button>
          ))}
          <input
            type="number"
            min={0}
            max={600}
            value={minutes}
            aria-label="Meeting length in minutes"
            onChange={(e) => setMinutes(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
            className="min-h-tap lg:min-h-tap-sm w-20 rounded-sm border border-rule bg-bg px-2 text-xs text-text focus:border-accent-mark focus:outline-none"
          />
        </div>

        <ul className="mt-2 divide-y divide-rule-faint rounded-card border border-rule">
          {box.segments.map((s) => (
            <li key={s.key} className="flex items-baseline gap-3 px-3 py-1.5">
              <span className="w-14 shrink-0 text-right font-mono text-2xs text-text-dim">
                {s.minutes} min
              </span>
              <span className="text-xs text-text">{s.label}</span>
            </li>
          ))}
        </ul>

        <p className="mt-1.5 text-2xs text-text-faint">
          {box.coreQuestions} core question{box.coreQuestions === 1 ? '' : 's'} fit at ~3
          minutes each with the answer.
        </p>

        {/* Warnings before generating, not after. The rep can still change the
            slot; a warning printed inside a finished brief cannot. */}
        {box.warnings.map((w) => (
          <p
            key={w}
            className="mt-1.5 rounded-sm border border-rule bg-bg-raised px-2.5 py-1.5 text-2xs text-text-dim"
          >
            {w}
          </p>
        ))}
      </div>

      {/* ── What the record already answers ── */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Walk out with</p>
          <p className="text-2xs text-text-faint">
            {open.length} of {checklist.length} still open
          </p>
        </div>
        <ul className="mt-2 space-y-1">
          {checklist.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-xs">
              {i.status === 'known' ? (
                <CircleCheck size={13} className="mt-0.5 shrink-0 text-accent" />
              ) : (
                <CircleDashed size={13} className="mt-0.5 shrink-0 text-text-faint" />
              )}
              <span className={i.status === 'known' ? 'text-text-dim' : 'text-text'}>
                {i.label}
                {i.have ? (
                  <span className="text-text-faint"> — on record: {i.have}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-2xs text-text-faint">
          Ticked items get confirmed in one sentence, not re-asked. Re-asking what the
          Spine already holds tells the room nobody listened last time.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() =>
            onGenerate({
              meetingTypeKey: typeKey || undefined,
              attendees: attendees.trim() || undefined,
              meetingMinutes: minutes,
              meetingDate: date || undefined,
            })
          }
        >
          <CalendarClock size={13} />
          {busy ? 'Generating…' : 'Build the brief'}
        </Button>
        <span className="text-2xs text-text-faint">
          {deal.stage} · engineering gate {gateBand(deal.stage)}
        </span>
      </div>
    </div>
  );
}
