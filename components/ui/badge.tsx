import { cn } from '@/lib/utils';
import { stageClass } from '@/lib/deals';

type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-overlay text-text-dim border-rule',
  accent: 'bg-accent-bg text-accent-dim border-accent-border',
  warning: 'border-transparent text-warning bg-[rgba(191,143,0,0.12)]',
  danger: 'border-transparent text-danger bg-[rgba(192,57,43,0.10)]',
  success: 'border-transparent text-success bg-[rgba(39,133,63,0.12)]',
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
        'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5',
        'font-mono text-micro uppercase tracking-wider',
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
        'text-tiny font-medium',
        stageClass(stage),
        className,
      )}
    >
      {stage}
    </span>
  );
}
