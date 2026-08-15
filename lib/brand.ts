/**
 * Brand constants. These hex values exist here ONLY for contexts that cannot
 * read CSS custom properties — canvas/Leaflet marker fills, generated PPTX/PDF
 * documents, and the PWA manifest theme color.
 *
 * For anything rendered in the DOM, use the Tailwind token classes
 * (bg-accent, text-accent, …) which resolve through styles/tokens.css.
 */
export const BRAND = {
  ink: '#0f1117', // dark theme bg
  paper: '#ffffff', // light theme bg
  accent: '#3CAD3A', // Bloom green
  accentDim: '#2d8a2b',
  charcoal: '#3E3E3E', // Bloom charcoal
} as const;

export const POWERDEAL_VERSION = '3.1.12';
export const APP_NAME = 'PowerDeal';
export const APP_TAGLINE =
  'AI-augmented BD platform for behind-the-meter power sales';

/** localStorage key for the theme preference. Read by the anti-flash bootstrap. */
export const THEME_STORAGE_KEY = 'pd-theme';
