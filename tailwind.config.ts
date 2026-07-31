import type { Config } from 'tailwindcss';

/**
 * GLOBAL RULE 2: no hardcoded colors. Every color below maps to a CSS custom
 * property declared in styles/tokens.css. Adding a literal hex here is a bug —
 * it breaks the light/dark theme swap and the per-vertical accent override.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        'bg-raised': 'var(--color-bg-raised)',
        'bg-overlay': 'var(--color-bg-overlay)',
        text: 'var(--color-text)',
        'text-dim': 'var(--color-text-dim)',
        'text-faint': 'var(--color-text-faint)',
        accent: 'var(--color-accent)',
        'accent-dim': 'var(--color-accent-dim)',
        'accent-bg': 'var(--color-accent-bg)',
        'accent-border': 'var(--color-accent-border)',
        'accent-fg': 'var(--color-accent-fg)',
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
        rule: 'var(--color-rule)',
        'rule-faint': 'var(--color-rule-faint)',
        'health-high': 'var(--health-high)',
        'health-mid': 'var(--health-mid)',
        'health-low': 'var(--health-low)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      maxWidth: {
        shell: 'var(--shell-max)',
      },
      // Role-named, bound to styles/tokens.css. A component should never carry
      // a raw px value — the scale is the design system's to change.
      // Redefines Tailwind's OWN scale rather than inventing names — those
      // are already in tailwind-merge's default theme, so they cannot collide
      // with colour utilities. `2xs` is the only new name and is declared in
      // cn(). See the warning at the top of styles/tokens.css.
      fontSize: {
        '2xs': 'var(--text-2xs)',
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        '3xl': 'var(--text-3xl)',
      },
      lineHeight: {
        tight: 'var(--leading-tight)',
        snug: 'var(--leading-snug)',
        normal: 'var(--leading-normal)',
      },
      letterSpacing: {
        label: 'var(--tracking-label)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        // Legacy alias — `rounded-card` predates the radius scale and is used
        // across every surface; it now resolves to the same token as `md`.
        card: 'var(--radius-md)',
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
      },
      height: {
        row: 'var(--row-h-comfortable)',
        'row-compact': 'var(--row-h-compact)',
        'row-spacious': 'var(--row-h-spacious)',
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        tap: 'var(--tap-target)',
        'tap-sm': 'var(--tap-target-sm)',
        'col-tiny': 'var(--col-tiny)',
        'col-xs': 'var(--col-xs)',
        'col-sm': 'var(--col-sm)',
        'col-md': 'var(--col-md)',
        'col-lg': 'var(--col-lg)',
        'col-xl': 'var(--col-xl)',
        'col-2xl': 'var(--col-2xl)',
        'col-name-min': 'var(--col-name-min)',
        'col-text-min': 'var(--col-text-min)',
        'col-wide-min': 'var(--col-wide-min)',
        'col-widest-min': 'var(--col-widest-min)',
        'col-clamp': 'var(--col-clamp)',
        'panel-tall': 'var(--panel-tall)',
      },
    },
  },
  plugins: [],
};

export default config;
