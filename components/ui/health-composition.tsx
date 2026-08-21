import type { Deal } from '@/lib/types';
import { healthComposition } from '@/lib/health-composition';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT THE NUMBER IS MADE OF.
 * ═══════════════════════════════════════════════════════════════
 *
 * A health score is six terms and two caps, and until this existed the surface
 * showed the result and one sentence about a cap. That sentence was wrong on
 * twenty of twenty-one deals — "capped at 6" printed on a deal scoring 1.5,
 * where the cap holds nothing down.
 *
 * ⚠️ THE FIX FOR THE CAP MESSAGE IS THIS TABLE. Once every term is listed with
 * what it is worth and what it earned, nobody needs to be told which constraint
 * binds — five rows reading 0.0 say it. The cap line then only carries the case
 * where the cap really is the ceiling.
 *
 * ⚠️ AND IT MAKES THE FLAT PIPELINE VISIBLE, which is the point. Twenty deals
 * living on the momentum term alone — 1.5 for having been touched recently, and
 * nothing else earned — read as twenty identical rows here, because that is
 * what they are.
 */
export default function HealthComposition({
  deal,
  className,
}: {
  deal: Partial<Deal>;
  className?: string;
}) {
  const c = healthComposition(deal);

  return (
    <div className={cn('space-y-2', className)}>
      <ul className="space-y-1">
        {c.terms.map((t) => {
          const earned = Math.round(t.earned * 10) / 10;
          return (
            <li key={t.key} className="flex items-baseline gap-2 text-2xs">
              {/* The bar is the fastest read: how much of this term was taken. */}
              <span className="h-1.5 w-10 shrink-0 rounded-sm bg-bg-overlay" aria-hidden>
                <span
                  className="block h-1.5 rounded-sm bg-accent"
                  style={{ width: `${(t.earned / t.worth) * 100}%` }}
                />
              </span>
              <span className={cn('min-w-0 flex-1', earned > 0 ? 'text-text' : 'text-text-faint')}>
                {t.label}
              </span>
              <span
                className={cn(
                  'shrink-0 font-mono tabular-nums',
                  earned > 0 ? 'text-text' : 'text-text-faint',
                )}
              >
                {earned.toFixed(1)}
                <span className="text-text-faint"> / {t.worth.toFixed(1)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-baseline justify-between border-t border-rule-faint pt-1.5 text-2xs">
        <span className="text-text-dim">
          {c.uncapped === c.final ? 'Total' : 'Total before caps'}
        </span>
        <span className="font-mono tabular-nums text-text">{c.uncapped.toFixed(1)}</span>
      </div>

      {c.caps.map((cap) => (
        <p
          key={cap.key}
          className={cn(
            'max-w-measure text-2xs',
            /* ⚠️ ONLY A BINDING CAP GETS WARNING WEIGHT. Colouring an inert
               condition the same as an active constraint is what sent readers
               to find a second contact for no gain. */
            cap.binding ? 'text-warning' : 'text-text-faint',
          )}
        >
          <span className="font-mono uppercase tracking-label">{cap.label}</span>{' '}
          {cap.binding ? (
            <>
              is holding this at {c.final.toFixed(1)}, down from {c.uncapped.toFixed(1)} —{' '}
              {cap.why}.
            </>
          ) : (
            <>
              is absent, and is <span className="text-text-dim">not</span> what is holding this
              back today: it scores {c.final.toFixed(1)} before any cap applies.
            </>
          )}
        </p>
      ))}

      {c.nextBest && c.bindingCaps.length === 0 ? (
        <p className="max-w-measure text-2xs text-text-dim">
          The largest thing missing is{' '}
          <span className="text-text">{c.nextBest.inline}</span>
          {c.nextBest.toEarn ? <> — {c.nextBest.toEarn}</> : null}.
        </p>
      ) : null}
    </div>
  );
}
