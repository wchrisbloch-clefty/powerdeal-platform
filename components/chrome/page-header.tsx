import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * ONE HEADER, NINE SURFACES.
 * ═══════════════════════════════════════════════════════════════
 *
 * The same eight lines of markup — an eyebrow, an `h1` at `text-2xl`, a
 * `mt-1` — were hand-copied into six files. Copying is not the defect;
 * DRIFTING is, and it had:
 *
 *   · Learn's page title was `text-lg`. Card-title size, three steps below
 *     every other page, on a surface the design brief calls out as needing
 *     to read as the most spacious in the platform.
 *   · Economics had no eyebrow at all, so its title sat with no category
 *     above it while its eight siblings had one.
 *   · Chat had no page header of any kind.
 *
 * Nobody chose any of that. It is what happens when a pattern lives in six
 * places: five stay in step and the sixth is written on a different day.
 *
 * ══ IT CARRIES THE LEAD, NOT JUST THE TITLE ══
 *
 * The brief asks that it be obvious in one glance what matters most on every
 * page. A title alone cannot do that — every page has one and they all look
 * the same. `lead` is the single sentence or figure that says what state THIS
 * surface is in right now, and `action` is the one thing to do about it.
 *
 * Both optional, and deliberately singular. A header with three actions has
 * no primary action.
 */
export default function PageHeader({
  eyebrow,
  title,
  lead,
  action,
  className,
}: {
  /** The category this surface belongs to. Small caps, above the title. */
  eyebrow: string;
  title: string;
  /**
   * What state this surface is in — a seed banner, a count, a read failure.
   * Capped at the reading measure: it is a sentence, not a label.
   */
  lead?: React.ReactNode;
  /** ONE action. Two would mean neither is primary. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-rhythm-block', className)}>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        {/*
          ⚠️ `text-2xl` IS THE PAGE-TITLE STEP, and it is set here rather than
          at each call site so it cannot be `text-lg` on one surface again.
          The step carries its own leading and tracking — see the fontSize
          triples in tailwind.config.ts.
        */}
        <h1 className="mt-1 font-display text-2xl text-text">{title}</h1>
        {lead ? <div className="mt-rhythm-tight max-w-measure">{lead}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
