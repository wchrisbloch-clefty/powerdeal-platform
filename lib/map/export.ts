import type { MapPlan } from './schedule';
import {
  championSignal,
  championSignalLabel,
  energizeDate,
  inDateOrder,
  ownerOf,
  planAnnotations,
  toIso,
} from './schedule';
import { forAudience } from '@/lib/annotations';

/**
 * MAP → markdown, for the DOCX renderer.
 *
 * Export mode exists to be walked through on a call, which is why the
 * milestones are a table rather than a list. The reader is scanning for their
 * own name and their own date; a paragraph per milestone makes them hunt.
 *
 * Every fact in here is COMPUTED — the energize date, the ordering, the owner
 * fallback, the consistency flags. This module only chooses the language
 * wrapped around them. The first midstream export got that boundary wrong and
 * shipped two different energize dates in one document.
 *
 * Pure — no I/O, no `server-only`. Both the export route and the live panel
 * import it, and the live panel is a client component.
 */
export function mapToMarkdown(
  plan: MapPlan,
  opts: {
    company: string;
    dealId: string;
    today?: string;
    /** The forcing function. Absence is stated, never omitted — see below. */
    criticalEvent?: string | null;
    criticalEventDate?: string | null;
  },
): string {
  const today = opts.today ?? toIso(Date.now());
  // Deny by default. This renderer produces a document that leaves the
  // building, so it sees only annotations explicitly marked external — it does
  // not know or care which flags exist. A new internal flag added upstream
  // cannot reach this page by accident.
  const notes = forAudience(planAnnotations(plan, today), 'external');
  // Single source. The header and the Energize row are now the same number by
  // construction rather than by coincidence.
  const energize = energizeDate(plan);
  const lines: string[] = [];

  lines.push(`## Mutual action plan — ${opts.company}`);
  lines.push('');
  lines.push(
    `Target energize: **${energize ?? 'not set'}**  ·  ${opts.dealId}  ·  as of ${today}`,
  );
  lines.push('');

  for (const note of notes) {
    lines.push(`**${note.title}:** ${note.detail}`);
    lines.push('');
  }

  // ── The forcing function ──
  //
  // Rendered whether or not it exists. A MAP with no critical event is a
  // schedule, not a forcing function, and omitting the section would hide
  // exactly that — the reader would see a tidy plan and no reason it has to
  // happen on these dates rather than a year later.
  //
  // Same principle as "not yet identified" on an unowned milestone: the empty
  // state is diagnostic information, and a missing section reads as "not
  // applicable" when it means "nobody has established why this is urgent".
  lines.push('### Why these dates');
  lines.push('');
  if (opts.criticalEvent?.trim()) {
    const when = opts.criticalEventDate
      ? ` Lands ${opts.criticalEventDate}`
      : ' No date on record for it yet';
    lines.push(`**${opts.criticalEvent.trim()}.**${when}, and the schedule below works back from it.`);
  } else {
    lines.push(
      '**No critical event on record.** Nothing in this plan forces a decision by a particular date — the dates below are a sequence, not a deadline. Establishing what makes doing nothing expensive, and when, is the single highest-value thing that can be added to this plan.',
    );
  }
  lines.push('');

  lines.push('| Milestone | Owner | Date | Status | Depends on |');
  lines.push('|---|---|---|---|---|');
  for (const m of inDateOrder(plan.milestones)) {
    lines.push(
      `| ${m.label} | ${ownerOf(m)} | ${m.date ?? 'not set'} | ${m.status} | ${
        m.dependsOn.length > 0
          ? m.dependsOn
              .map((id) => plan.milestones.find((x) => x.id === id)?.label ?? id)
              .join(', ')
          : '—'
      } |`,
    );
  }
  lines.push('');

  // Stated in the document because the reader is being asked to accept dates
  // that will move. Saying so up front is what makes the next slip a
  // conversation rather than a surprise.
  lines.push('### How dates move');
  lines.push('');
  lines.push(
    'Milestones are linked, and the table is ordered by date rather than by dependency — the Depends on column carries the sequence. When a milestone slips, anything depending on it moves only if it would otherwise start before its predecessor finishes; milestones with slack absorb the slip and keep their dates. Completed milestones never move.',
  );
  lines.push('');

  const signal = championSignal(plan);
  if (signal !== 'not-shared') {
    lines.push(`_${championSignalLabel(signal)}_`);
    lines.push('');
  }

  lines.push(`_Last updated ${plan.updatedAt.slice(0, 10)}._`);

  return lines.join('\n');
}
