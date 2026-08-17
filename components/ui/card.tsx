import { cn } from '@/lib/utils';

/** Bento card — the base surface for every module panel. */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-rule bg-bg-raised',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-rule px-4 py-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('font-display text-base', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3.5', className)} {...props}>
      {children}
    </div>
  );
}

/** Label + value pair used throughout the deal detail view. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {/* Label above value, uppercase micro-label — the definition-list shape.
          The old version gave label and value nearly equal weight and a full
          line of padding each, which is what made a six-field grid take the
          vertical space of a paragraph. */}
      <dt className="text-2xs uppercase tracking-label text-text-dim">{label}</dt>
      <dd className="mt-0.5 truncate text-base text-text" title={hint}>
        {value}
      </dd>
    </div>
  );
}

/** Empty-state block — always says what to DO, not just that there's nothing. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-base text-text">{title}</p>
      <p className="max-w-md text-sm text-text-dim">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
