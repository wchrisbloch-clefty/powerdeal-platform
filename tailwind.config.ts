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
        'accent-mark': 'var(--color-accent-mark)',
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        rule: 'var(--color-rule)',
        'rule-faint': 'var(--color-rule-faint)',
        // The gap slot's rule carries meaning, so it clears 3:1 where
        // --color-rule does not. See the note in tokens.css.
        'gap-rule': 'var(--color-gap-rule)',
        'health-high': 'var(--health-high)',
        'health-mid': 'var(--health-mid)',
        'health-low': 'var(--health-low)',
        /**
         * Chart series — ORDERED. Series one is Bloom green in both themes.
         * There is no chart-5: see lib/design/chart-palette.ts, where the
         * fifth series becomes a hatch over these four because a fifth hue
         * cannot be told from a fourth on a photocopy.
         */
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-stroke': 'var(--chart-stroke)',
        'chart-grid': 'var(--chart-grid)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      /**
       * ⚠️ EVERY STEP IS A TRIPLE, NOT A SIZE.
       *
       * The array form binds line-height and letter-spacing to the size, so
       * `text-xl` applies all three and there is no way to take the size
       * without the rest of the step. That is the whole difference between a
       * type scale and a list of font sizes.
       *
       * It is also how `leading-relaxed` ends up in fifteen files: when the
       * step carries no leading, every author picks one, and Tailwind's
       * defaults are right there and are not tokens. Those utilities are gone
       * and tests/design-tokens.test.ts keeps them gone.
       *
       * Names reuse Tailwind's own scale wherever one exists — they are
       * already in tailwind-merge's default theme, so they cannot collide with
       * colour utilities. The four new names (2xs, display, read, read-lead)
       * are declared in cn(). See the warning at the top of styles/tokens.css.
       */
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: 'var(--leading-2xs)', letterSpacing: 'var(--tracking-2xs)' }],
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-xs)', letterSpacing: 'var(--tracking-xs)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-sm)', letterSpacing: 'var(--tracking-sm)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-base)', letterSpacing: 'var(--tracking-base)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-lg)', letterSpacing: 'var(--tracking-lg)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-xl)', letterSpacing: 'var(--tracking-xl)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-2xl)', letterSpacing: 'var(--tracking-2xl)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-3xl)', letterSpacing: 'var(--tracking-3xl)' }],
        display: ['var(--text-display)', { lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }],
        // Reading scale — long-form prose only.
        read: ['var(--text-read)', { lineHeight: 'var(--leading-read)', letterSpacing: 'var(--tracking-read)' }],
        'read-lead': ['var(--text-read-lead)', { lineHeight: 'var(--leading-read-lead)', letterSpacing: 'var(--tracking-read-lead)' }],
      },
      letterSpacing: {
        label: 'var(--tracking-label)',
      },
      maxWidth: {
        shell: 'var(--shell-max)',
        measure: 'var(--measure)',
        'measure-narrow': 'var(--measure-narrow)',
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
      borderWidth: {
        'nav-active': 'var(--nav-active-border)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
      },
      height: {
        topbar: 'var(--topbar-height)',
        'topbar-stacked': 'var(--topbar-height-stacked)',
        tabbar: 'var(--tabbar-height)',
        row: 'var(--row-h-comfortable)',
        'row-compact': 'var(--row-h-compact)',
        'row-spacious': 'var(--row-h-spacious)',
      },
      spacing: {
        // Vertical rhythm. These CHANGE at md and lg (see the media queries at
        // the foot of styles/tokens.css), so `gap-rhythm-page` opens up on a
        // larger screen without a single responsive variant at the call site.
        'rhythm-page': 'var(--rhythm-page)',
        'rhythm-block': 'var(--rhythm-block)',
        'rhythm-tight': 'var(--rhythm-tight)',
        // Clearance for anything fixed to the bottom of a phone viewport.
        // The mobile tab bar owns that strip; see the note in tokens.css.
        'above-tabbar': 'var(--above-tabbar)',
        topbar: 'var(--topbar-height)',
        'topbar-stacked': 'var(--topbar-height-stacked)',
        'nav-item': 'var(--nav-item-min-w)',
        // The stacked (md–lg) bar's narrower floor. Nine destinations do not
        // fit at the wider one; see the arithmetic in styles/tokens.css.
        'nav-item-stacked': 'var(--nav-item-min-w-stacked)',
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
