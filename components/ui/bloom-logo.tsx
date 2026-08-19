import { cn } from '@/lib/utils';

/**
 * PowerDeal mark. An abstract stacked-cell glyph — SOFC stacks are layered
 * plates, so the mark is three ascending bars, the tallest carrying the
 * accent. Deliberately not Bloom Energy's own logo; this is PowerDeal's mark
 * in Bloom's color.
 */
export default function BloomLogo({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="3" y="14" width="5" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="9.5" y="9" width="5" height="12" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="16" y="3" width="5" height="18" rx="1" fill="var(--color-accent)" />
    </svg>
  );
}

/**
 * Full lockup for the nav header and landing hero.
 *
 * ⚠️ `collapse` DROPS THE WORDMARK TEXT BETWEEN 768 AND 1023, AND IT IS A
 * LAYOUT FIX WITH A MEASUREMENT BEHIND IT.
 *
 * At 834px the main nav had 443px of container holding 522px of items, so
 * "Learn" — the last of the eight — sat 61px outside its own box at rest, on
 * every surface in the app. Reachable by scrolling, and not readable without
 * it, which is a different failure from the one the reachability check was
 * built to catch and is why it passed.
 *
 * The 79px has to come from somewhere. The three candidates were: shrink
 * `--nav-item-min-w` (443 / 8 = 55px, below what "Intelligence" needs at
 * text-2xs, so labels start truncating instead), drop a destination (not a
 * layout decision), or reclaim it from the chrome either side. The wordmark
 * text is ~87px of the ~111px lockup and is the only element on that row
 * carrying no function — the mark alone still identifies the app, and it is
 * still the link to the dashboard.
 *
 * Full lockup returns at lg, where the row fits with room to spare.
 */
export function Wordmark({
  className,
  collapse,
}: {
  className?: string;
  /** Hide the text from md to just below lg, where the nav needs the width. */
  collapse?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-text', className)}>
      <BloomLogo size={20} />
      <span
        className={cn(
          'font-display text-lg font-medium',
          // Visible below md (the phone header has no nav row to compete with)
          // and again at lg. Hidden only in the band where the nav overflows.
          collapse && 'md:hidden lg:inline',
        )}
      >
        PowerDeal
      </span>
    </span>
  );
}
