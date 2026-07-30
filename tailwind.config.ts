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
        danger: 'var(--color-danger)',
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
      spacing: {
        sidebar: 'var(--sidebar-width)',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
