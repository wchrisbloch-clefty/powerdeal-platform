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

/** Full lockup for the nav header and landing hero. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-text', className)}>
      <BloomLogo size={20} />
      <span className="font-display text-lede font-medium tracking-tight">
        PowerDeal
      </span>
    </span>
  );
}
