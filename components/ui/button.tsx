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
    'bg-accent text-accent-fg border-accent-mark hover:bg-accent-dim hover:border-accent-dim',
  secondary:
    'bg-bg-raised text-text border-rule hover:bg-bg-overlay',
  ghost:
    'bg-transparent text-text-dim border-transparent hover:bg-bg-raised hover:text-text',
  danger:
    'bg-transparent text-danger border-rule hover:bg-danger-bg',
};

/**
 * Heights carry a 44px floor below `xl`, then relax to their designed size on
 * desktop. A control that is comfortable with a mouse is a miss with a thumb,
 * and this is the button every surface uses.
 */
const SIZES: Record<Size, string> = {
  sm: 'min-h-tap xl:min-h-0 h-tap xl:h-8 px-2.5 text-sm gap-1.5',
  md: 'min-h-tap xl:min-h-0 h-tap xl:h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
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
