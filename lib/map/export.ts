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
 * wrapped around them. The first Williams export got that boundary wrong and
 * shipped two different energize dates in one document.
 *
 * Pure — no I/O, no `server-only`. Both the export route and the live panel
 * import it, and the live panel is a client component.
 */
export function mapToMarkdown(
  plan: MapPlan,
  opts: { company: string; dealId: string; today?: string },
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
