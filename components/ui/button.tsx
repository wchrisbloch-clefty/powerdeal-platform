import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * RULE 3: `primary` is the only variant that paints Bloom green, and it is
 * the single most important action on the view. If a screen needs two green
 * buttons, one of them is not primary.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white border-accent hover:bg-accent-dim hover:border-accent-dim',
  secondary:
    'bg-bg-raised text-text border-rule hover:bg-bg-overlay',
  ghost:
    'bg-transparent text-text-dim border-transparent hover:bg-bg-raised hover:text-text',
  danger:
    'bg-transparent text-danger border-rule hover:bg-[rgba(192,57,43,0.08)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-medium',
        'transition-colors disabled:pointer-events-none disabled:opacity-45',
        'whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

export default Button;
