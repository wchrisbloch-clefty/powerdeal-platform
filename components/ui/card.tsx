import { cn } from '@/lib/utils';
import { GapPanel } from './gap';
import type { GapKind } from '@/lib/design/gaps';

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
/**
 * ⚠️ `kind` IS REQUIRED, AND MAKING IT REQUIRED IS THE POINT.
 *
 * This used to take a title and a body and centre them, so "the read failed",
 * "you have none yet" and "this does not apply" were one object with different
 * words in it — and the words were written at each call site. That is how three
 * surfaces ended up saying "no results" about a query that failed.
 *
 * Adding a required prop turns every existing call into a compile error, which
 * is the forcing function: each site has to state which kind of nothing it is
 * rather than inherit a default that will be wrong somewhere.
 *
 * It delegates to GapPanel and adds nothing of its own. Kept only because
 * `title`/`body` overrides are still needed where a surface has a genuinely
 * specific sentence; new code should use GapPanel directly.
 */
export function EmptyState({
  kind,
  title,
  body,
  action,
  reason,
}: {
  kind: GapKind;
  /** Overrides the vocabulary's title. Use sparingly — drift starts here. */
  title?: string;
  body?: string;
  action?: React.ReactNode;
  reason?: string;
}) {
  if (title || body) {
    return (
      <div className="flex flex-col items-start gap-rhythm-tight px-rhythm-block py-rhythm-page">
        <div
          className={cn(
            'w-full border-b',
            kind === 'blocked' ? 'border-danger' : 'border-gap-rule',
            kind === 'unchecked' ? 'border-dotted' : 'border-solid',
          )}
        />
        {title ? <p className="font-display text-lg text-text">{title}</p> : null}
        {body ? <p className="max-w-measure text-sm text-text-dim">{body}</p> : null}
        {action ? <div className="mt-rhythm-tight">{action}</div> : null}
      </div>
    );
  }
  return <GapPanel kind={kind} subject={''} reason={reason} cta={action} />;
}
