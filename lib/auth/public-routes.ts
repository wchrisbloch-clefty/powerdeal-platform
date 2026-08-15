/**
 * ═══════════════════════════════════════════════════════════════
 * THE ONLY THINGS THAT ANSWER WITHOUT A SESSION.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ DENY BY DEFAULT. Middleware protects EVERY path and consults this list to
 * make an exception. A new route is protected the moment it exists, because it
 * is protected by omission rather than by remembering to add it — the opposite
 * of an allowlist you have to maintain, where forgetting means exposure.
 *
 * That direction is the whole design. `/api/feed/health` was public because
 * nobody added a check to it, not because anyone decided it should be.
 *
 * Every entry below is a decision with a reason. Adding one is a security
 * change and tests/auth.test.ts holds the list to exactly this shape, so
 * growing it fails the build until someone updates the assertion too.
 */

export interface PublicRoute {
  /** Matched with startsWith against the pathname. */
  prefix: string;
  why: string;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    prefix: '/login',
    why: 'The gate itself. A login page behind the login is a locked room with the key inside.',
  },
  {
    prefix: '/api/auth/login',
    why: 'Accepts the password and issues the cookie. Rate-limited; it cannot read any data.',
  },
];

/**
 * Paths served before the application, which have no session to check.
 *
 * These are Next.js internals and browser conventions — build output, the
 * favicon, the crawler files. None reaches a route handler and none can read a
 * deal, so requiring a cookie for them would only break the login page's own
 * stylesheet.
 *
 * ⚠️ `/_next/static` and `/_next/image` ONLY, never `/_next` wholesale.
 * `/_next/data` serves route payloads — real application data — and a broad
 * prefix here would hand it out unauthenticated while looking like a
 * static-asset exemption.
 */
export const INFRASTRUCTURE_PREFIXES = [
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/apple-touch-icon',
  '/manifest.webmanifest',
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
}

export function isInfrastructurePath(pathname: string): boolean {
  return INFRASTRUCTURE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Routes that authenticate on CRON_SECRET instead of a session.
 *
 * Six scheduled jobs depend on this: three Vercel crons sending
 * `Authorization: Bearer`, and three Supabase pg_cron jobs sending
 * `x-cron-secret`. Neither has a browser or a cookie.
 *
 * ⚠️ THIS IS NOT AN EXEMPTION. Middleware still demands the secret — it simply
 * accepts a different credential for these paths. A request to one of them
 * WITHOUT a valid secret and WITHOUT a session is refused exactly like any
 * other. The route handler's own `isCronAuthorized` check stays in place too;
 * two independent checks of the same credential is the point, not redundancy
 * to clean up.
 */
export const CRON_ROUTES = [
  '/api/cron/',
  '/api/feed/sweep',
];

export function isCronPath(pathname: string): boolean {
  return CRON_ROUTES.some((p) => pathname.startsWith(p));
}
