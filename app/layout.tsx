import type { Metadata, Viewport } from 'next';
import { Newsreader, Atkinson_Hyperlegible, IBM_Plex_Mono } from 'next/font/google';
import { APP_NAME, APP_TAGLINE, BRAND, THEME_STORAGE_KEY } from '@/lib/brand';
import SwRegister from '@/components/chrome/sw-register';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-newsreader',
  weight: ['400', '500', '600'],
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
