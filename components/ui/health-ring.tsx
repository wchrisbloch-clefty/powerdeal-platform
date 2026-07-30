import { healthBand } from '@/lib/deals';
import { cn } from '@/lib/utils';

/**
 * Deal health ring. 1-10, drawn as an arc so the score reads as a fill level
 * before the number registers.
 *
 * Stroke uses the --health-* tokens, so the ring re-themes with the app
 * instead of carrying its own palette.
 */
export default function HealthRing({
  score,
  size = 34,
  showValue = true,
  className,
}: {
  score: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(10, score));
  const band = healthBand(clamped);
  const stroke = size < 30 ? 2.5 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (clamped / 10) * circumference;

  const strokeVar =
    band === 'high'
      ? 'var(--health-high)'
      : band === 'mid'
        ? 'var(--health-mid)'
        : 'var(--health-low)';

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      title={`Deal health ${clamped.toFixed(1)} / 10`}
      role="img"
      aria-label={`Deal health ${clamped.toFixed(1)} out of 10`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-rule)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeVar}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      {showValue && (
        <span
          className="absolute font-mono font-medium tabular-nums"
          style={{ fontSize: size < 30 ? 9 : 11, color: strokeVar }}
        >
          {clamped % 1 === 0 ? clamped.toFixed(0) : clamped.toFixed(1)}
        </span>
      )}
    </div>
  );
}
