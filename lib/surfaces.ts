import type { KnownSurface } from './usage';

/**
 * EVERY SURFACE THAT EXISTS — including the ones nobody opens.
 *
 * The usage report needs this list because the most useful finding of the
 * week is which surfaces were never opened at all, and a list derived from
 * what WAS visited cannot contain them. Deriving it from usage would make an
 * unopened surface simply not appear, which is the same defect as an agent
 * that was never scheduled not showing up in the job table.
 *
 * PURE and icon-free, so a server route can import it. `NAV_ITEMS` lives in a
 * client component beside its lucide icons and cannot be read from the server;
 * this is the same set without the rendering. tests/usage.test.ts holds the
 * two in agreement in BOTH directions — a nav item missing here would go
 * uncounted, and an entry here that is not a real destination would report a
 * permanent, uninteresting zero.
 */
export const KNOWN_SURFACES: KnownSurface[] = [
  { path: '/app', label: 'Dashboard' },
  { path: '/app/pipeline', label: 'Pipeline' },
  { path: '/app/maps', label: 'Maps' },
  { path: '/app/economics', label: 'Economics' },
  { path: '/app/forge', label: 'Forge' },
  { path: '/app/chat', label: 'Chat' },
  { path: '/app/learn', label: 'Learn' },
  { path: '/app/settings', label: 'Settings' },

  /**
   * Intelligence is recorded PER TAB, not as one destination.
   *
   * Nine views behind one URL would report as a single heavily-used surface
   * and answer nothing — "Intelligence: 2h" cannot distinguish a week spent in
   * Headlines from a week spent in CCUS, and which of the nine actually earned
   * its place is precisely the question the week is being run to answer.
   */
  { path: '/app/intelligence?tab=headlines', label: 'Intelligence · Headlines' },
  { path: '/app/intelligence?tab=feed', label: 'Intelligence · Feed' },
  { path: '/app/intelligence?tab=market-watch', label: 'Intelligence · Market Watch' },
  { path: '/app/intelligence?tab=trending', label: 'Intelligence · Trending' },
  { path: '/app/intelligence?tab=signals', label: 'Intelligence · Signals' },
  { path: '/app/intelligence?tab=ccus', label: 'Intelligence · CCUS' },
  { path: '/app/intelligence?tab=pricing', label: 'Intelligence · Pricing' },
  { path: '/app/intelligence?tab=video', label: 'Intelligence · Video' },
  { path: '/app/intelligence?tab=research', label: 'Intelligence · Research' },
];

/**
 * Normalise a browser path to a surface key.
 *
 * Only the `tab` parameter survives, and only on Intelligence. Everything else
 * — a deal id, a filter, a scroll anchor — is dropped, because a hundred
 * one-visit rows for `/app/pipeline?deal=DC-001` is not a report, it is the
 * raw log with extra steps.
 */
export function surfaceKey(pathname: string, search?: string): string {
  if (pathname === '/app/intelligence') {
    const params = new URLSearchParams(search ?? '');
    const tab = params.get('tab') ?? 'headlines';
    return `/app/intelligence?tab=${tab}`;
  }
  // A deal detail page is Pipeline. Recording each deal separately answers
  // "which deal did I look at", which the pipeline table already knows.
  if (pathname.startsWith('/app/pipeline/')) return '/app/pipeline';
  return pathname;
}
