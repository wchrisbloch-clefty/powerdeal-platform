import type { MapPlan } from './schedule';
import { championSignalLabel, championSignal, overdue, toIso } from './schedule';

/**
 * MAP → markdown, for the DOCX renderer.
 *
 * Export mode exists to be walked through on a call, which is why the
 * milestones are a table rather than a list. The reader is scanning for their
 * own name and their own date; a paragraph per milestone makes them hunt.
 *
 * Pure — no I/O, no `server-only`. Both the export route and the live panel
 * import it, and the live panel is a client component.
 */
export function mapToMarkdown(
  plan: MapPlan,
  opts: { company: string; dealId: string; today?: string },
): string {
  const today = opts.today ?? toIso(Date.now());
  const late = overdue(plan, today);
  const lines: string[] = [];

  lines.push(`## Mutual action plan — ${opts.company}`);
  lines.push('');
  lines.push(
    `Target energize: **${plan.targetEnergizeDate ?? 'not set'}**  ·  ${opts.dealId}  ·  as of ${today}`,
  );
  lines.push('');

  if (late.length > 0) {
    lines.push(
      `**${late.length} milestone${late.length === 1 ? '' : 's'} past due:** ${late
        .map((m) => m.label)
        .join(', ')}.`,
    );
    lines.push('');
  }

  lines.push('| Milestone | Owner | Date | Status | Depends on |');
  lines.push('|---|---|---|---|---|');
  for (const m of plan.milestones) {
    lines.push(
      `| ${m.label} | ${m.owner ?? '—'} | ${m.date ?? '—'} | ${m.status} | ${
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
    'Milestones are linked. When one slips, anything depending on it moves only if it would otherwise start before its predecessor finishes — milestones with slack absorb the slip and keep their dates. Completed milestones never move.',
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
