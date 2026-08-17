import type { Metadata, Viewport } from 'next';
import { Newsreader, Atkinson_Hyperlegible, IBM_Plex_Mono } from 'next/font/google';
import { APP_NAME, APP_TAGLINE, BRAND, THEME_STORAGE_KEY } from '@/lib/brand';
import SwRegister from '@/components/chrome/sw-register';
import './globals.css';

/**
 * ⚠️ 700 IS NOT OPTIONAL, AND ITS ABSENCE WAS INVISIBLE.
 *
 * This list was ['400','500','600'], so the built CSS emitted three
 * @font-face rules for Newsreader and none at 700. The Dashboard metric tiles
 * ask for `font-bold` — 700 — which matched the 600 face and then had the
 * remaining weight SYNTHESISED by the browser: smeared stems on the largest
 * type in the product, on the surface whose whole job is numbers.
 *
 * The comment above those tiles described "36px/700" the entire time. A
 * comment asserting something about the build that was never true, in the same
 * family as the four that named Vercel SSO as the security boundary.
 *
 * Newsreader is a variable font whose wght axis runs 200–800. The weight was
 * already inside the file that was already being downloaded. Nothing here
 * costs a byte; it just stops the browser inventing a weight.
 */
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-newsreader',
  weight: ['400', '500', '600', '700'],
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-atkinson',
  weight: ['400', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Know the market. Advance the deal. Win fast. AI-augmented BD for behind-the-meter SOFC power sales.',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.paper },
    { media: '(prefers-color-scheme: dark)', color: BRAND.ink },
  ],
};

/**
 * Theme bootstrap. Runs before first paint so a dark-mode reader never sees a
 * white flash. Kept as a raw string because it must execute synchronously in
 * <head> — a React effect is already too late.
 */
const THEME_BOOTSTRAP = `
(function(){
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${atkinson.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
