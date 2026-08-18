import { cn } from '@/lib/utils';
import { stageClass } from '@/lib/deals';

type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

/**
 * ⚠️ THESE THREE WERE ARBITRARY VALUES — `bg-[rgba(191,143,0,0.12)]` and two
 * like it. Tailwind compiles them, so they look like utilities and behave like
 * literals, and the token system cannot see them at all.
 *
 * Both consequences were live. They did not switch with the theme, so a
 * warning badge carried its light-theme wash on the dark ground everywhere one
 * appeared. And the danger value was rgba(192,57,43,0.10) against a
 * `--color-danger-bg` of 0.08 — one surface with two values, differing by an
 * amount nobody chose.
 */
const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-overlay text-text-dim border-rule',
  accent: 'bg-accent-bg text-accent-dim border-accent-border',
  warning: 'border-transparent text-warning bg-warning-bg',
  danger: 'border-transparent text-danger bg-danger-bg',
  success: 'border-transparent text-success bg-success-bg',
};

export default function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        /**
         * ⚠️ `shrink-0` WITH NO CAP PUSHED THE PAGE SIDEWAYS.
         *
         * A risk flag reading "Standby / departing-load charge unquantified"
         * renders 347px wide, and `shrink-0` means it will not give any of it
         * back — so on a 390px phone the deal page scrolled horizontally, 433px
         * of document in 390px of viewport.
         *
         * `shrink-0` is still right: badges in a row must not compress into
         * each other. What was missing is that a badge WIDER THAN ITS
         * CONTAINER has to wrap instead, which `max-w-full` plus normal
         * wrapping gives it. The label is the information here, so it wraps
         * rather than truncating.
         *
         * Invisible for the whole build because the deal detail page was not
         * in the render check's surface list — nine surfaces reported clean
         * while a tenth scrolled sideways.
         */
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded border px-1.5 py-0.5',
        'font-mono text-2xs uppercase tracking-label',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Deal stage pill — color encodes funnel position. */
export function StagePill({ stage, className }: { stage: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5',
        'text-2xs font-medium',
        stageClass(stage),
        className,
      )}
    >
      {stage}
    </span>
  );
}
