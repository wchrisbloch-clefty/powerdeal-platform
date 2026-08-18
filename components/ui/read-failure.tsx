import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * "THESE ARE NOT YOUR DEALS."
 * ═══════════════════════════════════════════════════════════════
 *
 * The banner a surface shows when it is rendering SEED data because the
 * database REFUSED the query — as opposed to because nothing is configured.
 *
 * ══ WHY IT IS A COMPONENT AND NOT THREE COPIES ══
 *
 * The Dashboard hand-rolled this in March and got it right. Pipeline and the
 * deal page never got it at all: both destructured `{ data, isSeed }` and
 * dropped the third field on the floor, so both kept printing the
 * unconfigured-deployment sentence over data the database had refused to
 * confirm. One surface being honest is not the same as the platform being
 * honest, and the gap lasted as long as it did precisely because the true
 * sentence lived at a call site rather than in a component.
 *
 * ⚠️ THE SEED PIPELINE IS 21 ROWS AND SO IS THE REAL ONE, with overlapping
 * company names. There is no glance at this data that reveals which it is. The
 * banner is the ONLY channel, which is why it is danger-toned, sits above the
 * content rather than under it, and leads with the flat statement before the
 * diagnosis.
 *
 * ══ NOT A GapPanel ══
 *
 * GapPanel replaces content that is absent. This sits ABOVE content that is
 * present and wrong. A reader who sees a ruled slot knows there is nothing
 * there; a reader who sees 21 rows needs telling.
 */
export default function ReadFailureBanner({
  readError,
  noun = 'deals',
  className,
}: {
  /** Null on every healthy path — the component renders nothing. */
  readError: string | null | undefined;
  /** What the rows are. "deals", "this account's record". */
  noun?: string;
  className?: string;
}) {
  if (!readError) return null;

  return (
    <p
      role="status"
      className={cn(
        'rounded-card border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger',
        className,
      )}
    >
      <span className="font-medium">
        {noun === 'deals' ? 'These are NOT your deals.' : `This is NOT your ${noun}.`}
      </span>{' '}
      The database refused the query, so what is shown is template data standing in
      for {noun === 'deals' ? 'a pipeline' : 'a record'} that could not be read.{' '}
      {readError}
    </p>
  );
}
