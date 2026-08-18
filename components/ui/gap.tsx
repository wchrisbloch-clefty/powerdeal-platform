import { cn } from '@/lib/utils';
import {
  PRESENTATION,
  describeGap,
  isGap,
  type GapKind,
} from '@/lib/design/gaps';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE RULED SLOT.
 * ═══════════════════════════════════════════════════════════════
 *
 * A gap is drawn as a line where the value would sit — a ledger with the rule
 * ruled and the entry not yet made.
 *
 * ══ WHY THIS SHAPE AND NOT THE USUAL ONES ══
 *
 * A dashed box says "drop something here", which is a file-upload affordance
 * and wrong. An illustration says "isn't this charming", which is decoration on
 * the surface the reader is on precisely because something is wrong. Grey mush
 * says nothing at all, which is the blank card this replaces.
 *
 * A ruled slot says "this belongs here and is not filled in". That is a
 * different sentence and a truer one, and it is the sentence this whole product
 * is built on: a stated gap beats an invented number.
 *
 * ══ THE RULE STYLE IS THE ENCODING ══
 *
 *   solid    a line is ruled and waiting        — missing
 *   dotted   nobody has ruled the line yet      — unchecked
 *   solid + em dash   deliberately nothing      — unavailable
 *   solid, danger     the read failed           — blocked
 *
 * Colour is never the only channel: the mark text differs for every kind, so
 * the tone is redundant rather than load-bearing.
 *
 * ⚠️ `--color-gap-rule`, NOT `--color-rule`. Here the line IS the content, so
 * it is a non-text indicator and clears 3:1. `--color-rule` is 1.27:1 on paper
 * — correct for separating content, and a line nobody can see when it is the
 * content itself.
 */

const TONE_RULE: Record<'gap' | 'danger' | 'quiet', string> = {
  gap: 'border-gap-rule',
  danger: 'border-danger',
  quiet: 'border-rule',
};

const TONE_MARK: Record<'gap' | 'danger' | 'quiet', string> = {
  gap: 'text-text-dim',
  danger: 'text-danger',
  quiet: 'text-text-faint',
};

/**
 * A field-level gap: one attribute of one record, in a list of attributes.
 *
 * Used where a value would otherwise render as an empty cell or an em dash with
 * no explanation of which kind of nothing it is.
 */
export function GapSlot({
  kind,
  label,
  action,
  reason,
  className,
}: {
  kind: GapKind;
  /** The field. "Champion", "Critical event", "Decision criteria". */
  label: string;
  /** What would fill it. Supplied by the caller — only the caller knows. */
  action?: string;
  /** For `blocked`: what the read said. */
  reason?: string;
  className?: string;
}) {
  if (!isGap(kind)) return null;
  const p = PRESENTATION[kind];
  const copy = describeGap(kind, label, action, reason);

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-2xs uppercase tracking-label text-text-faint">{label}</p>

      {/* The slot itself. A baseline with the mark sitting on it. */}
      <div
        className={cn(
          'mt-rhythm-tight flex items-end justify-between gap-2 border-b pb-1',
          TONE_RULE[p.tone],
          p.rule === 'dotted' ? 'border-dotted' : 'border-solid',
        )}
      >
        <span className={cn('text-sm', TONE_MARK[p.tone])}>{p.mark}</span>
      </div>

      {copy.body ? (
        <p className="mt-1 max-w-measure-narrow text-xs text-text-faint">{copy.body}</p>
      ) : null}
    </div>
  );
}

/**
 * The compact form: a mark sitting on a ruled baseline, inline in a dense row.
 *
 * ⚠️ THE FULL SLOT IS TOO TALL FOR AN EIGHT-ROW CARD. The MEDDPICC card is
 * eight pillars deep and was already flattened to one line per pillar once,
 * because two stacked blocks per row made it scroll. Dropping a three-part slot
 * into each row would rebuild exactly that.
 *
 * So the signature survives at row density as the thing that carries it: the
 * ruled baseline. Same rule, same tokens, same encoding — the explanatory
 * sentence is the part that goes, and it goes because eight of them stacked is
 * not an explanation, it is a wall.
 */
export function GapInline({
  kind,
  onConfirm,
  busy,
  className,
}: {
  kind: GapKind;
  /**
   * ⚠️ THE MARK IS THE CONTROL, and that placement is the design.
   *
   * "Not checked" on twenty-one deals is a false statement about whether the
   * operator looked. A settings toggle or an edit form would fix it somewhere
   * else; making the wrong words the button fixes the wrong statement exactly
   * where the wrong statement is.
   *
   * Supplied only where a write can land. Without it the mark renders as text,
   * which is what the pipeline table and any read-only surface want.
   */
  onConfirm?: (nextVerified: boolean) => void;
  busy?: boolean;
  className?: string;
}) {
  if (!isGap(kind)) return null;
  const p = PRESENTATION[kind];

  const shell = cn(
    'inline-flex border-b pb-px text-sm',
    TONE_RULE[p.tone],
    TONE_MARK[p.tone],
    p.rule === 'dotted' ? 'border-dotted' : 'border-solid',
    className,
  );

  // Only the two states the operator can move between are switchable. A
  // `blocked` or `unavailable` mark is not the reader's to change, and a
  // control that does nothing is worse than none.
  const switchable = kind === 'unchecked' || kind === 'missing';
  if (!onConfirm || !switchable) return <span className={shell}>{p.mark}</span>;

  const verified = kind === 'missing';
  return (
    <button
      type="button"
      onClick={() => onConfirm(!verified)}
      disabled={busy}
      // Nothing gates. The control is optional, reversible, and its absence
      // leaves the field exactly as it is.
      title={
        verified
          ? 'You recorded this as checked and empty. Click to return it to unchecked.'
          : 'Checked it and there is genuinely nothing? Record that.'
      }
      className={cn(shell, 'min-h-tap items-end text-left hover:text-text disabled:opacity-50 lg:min-h-0')}
    >
      {p.mark}
    </button>
  );
}

/**
 * A collection-level gap: a whole panel, list or chart with nothing in it.
 *
 * ⚠️ REPLACES THE OLD `EmptyState`, WHICH HAD ONE APPEARANCE FOR EVERY REASON.
 * It took a title and a body and centred them, so "the read failed", "you have
 * none yet" and "this does not apply" were the same object with different
 * words in it — and the words were written at each call site, which is how
 * three of them ended up saying "no results" about a failed query.
 */
export function GapPanel({
  kind,
  subject,
  action,
  reason,
  cta,
  className,
}: {
  kind: GapKind;
  /** The plural thing that is absent — "deals at risk", "swept items". */
  subject: string;
  action?: string;
  reason?: string;
  /** A button or link. Only ever offered for gaps the reader can act on. */
  cta?: React.ReactNode;
  className?: string;
}) {
  const p = PRESENTATION[kind];
  const copy = describeGap(kind, subject, action, reason);

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-rhythm-tight px-rhythm-block py-rhythm-page',
        className,
      )}
    >
      {/* The rule runs the full width, above the sentence — the same ledger
          line as the field slot, at panel scale. */}
      <div
        className={cn(
          'w-full border-b',
          TONE_RULE[p.tone],
          p.rule === 'dotted' ? 'border-dotted' : 'border-solid',
        )}
      />
      <p className={cn('font-display text-lg', p.tone === 'danger' ? 'text-danger' : 'text-text')}>
        {copy.title}
      </p>
      {copy.body ? (
        <p className="max-w-measure text-sm text-text-dim">{copy.body}</p>
      ) : null}
      {/*
        ⚠️ NO CALL TO ACTION ON A GAP NOBODY CAN ACT ON. A "Try again" button
        under `unavailable` invites the reader to fix something that is
        correct, and under `blocked` it usually just fails again — the
        resolution there is on the operator's side, which is what the reason
        line is for.
      */}
      {cta && (kind === 'missing' || kind === 'unchecked') ? (
        <div className="mt-rhythm-tight">{cta}</div>
      ) : null}
    </div>
  );
}
