import Link from 'next/link';
import type { EntityDef, EntityType } from '@/lib/engine/entities';
import { entityHref } from '@/lib/engine/entities';
import { cn } from '@/lib/utils';

/**
 * An entity name, rendered as a link to its page.
 *
 * The point of having one component for this: clicking "SDG&E" on a feed card,
 * on a deal record, in the market watch log or in Trending must all land on the
 * same page. Any surface that hand-rolls its own href will drift the moment the
 * route changes, and the reader will find two SDG&E pages that disagree.
 */

const TYPE_LABELS: Record<EntityType, string> = {
  utility: 'Utility',
  regulator: 'Regulator / ISO',
  company: 'Company',
  topic: 'Topic',
};

export function entityTypeLabel(type: EntityType): string {
  return TYPE_LABELS[type];
}

export default function EntityLink({
  entity,
  className,
  children,
}: {
  entity: Pick<EntityDef, 'name' | 'type'>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={entityHref(entity)}
      title={`${entity.name} — ${TYPE_LABELS[entity.type]}`}
      className={cn(
        'text-text underline decoration-rule underline-offset-2 transition-colors hover:decoration-accent',
        className,
      )}
    >
      {children ?? entity.name}
    </Link>
  );
}

/** The compact pill form, for a row of entities under a feed card. */
export function EntityChip({
  entity,
  className,
}: {
  entity: Pick<EntityDef, 'name' | 'type'>;
  className?: string;
}) {
  return (
    <Link
      href={entityHref(entity)}
      title={`${entity.name} — ${TYPE_LABELS[entity.type]}`}
      className={cn(
        'inline-flex items-center rounded-full border border-rule bg-bg px-2 py-0.5',
        'text-2xs text-text-dim transition-colors hover:border-accent-border hover:text-text',
        className,
      )}
    >
      {entity.name}
    </Link>
  );
}
