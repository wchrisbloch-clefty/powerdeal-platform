import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isAuthenticated, constantTimeEqual } from '@/lib/auth/session';
import { isPublicPath, isInfrastructurePath, isCronPath } from '@/lib/auth/public-routes';

/**
 * ═══════════════════════════════════════════════════════════════
 * EVERY REQUEST, EVERY ROUTE, DENY BY DEFAULT.
 * ═══════════════════════════════════════════════════════════════
 *
 * There was no middleware at all. 44 API routes, 35 of them reaching a
 * service-role client that bypasses every RLS policy, 24 accepting writes, and
 * nothing running before any of them. `/app` had no gate either — the comment
 * in its layout said so plainly: "Vercel SSO is the ONLY thing standing in
 * front of this data."
 *
 * On Hobby, Vercel offers nothing: Standard Protection covers deployment URLs
 * and not the production alias, and Password Protection is Pro-gated. Both
 * `/app` and `/api/feed/health` returned 200 to an unauthenticated curl.
 *
 * ══ THE MATCHER IS EVERYTHING, AND THAT IS DELIBERATE ══
 *
 * `config.matcher` catches every path and the exceptions are made HERE, in
 * code, from a list that is itself asserted. Narrowing the matcher would move
 * the security boundary into a regex that no test reads and that fails open
 * when it is wrong. A route added tomorrow is protected because it exists, not
 * because someone remembered.
 *
 * ══ IT FAILS CLOSED ══
 *
 * No APP_PASSWORD means nobody gets in — including the operator. An auth layer
 * that disables itself when unconfigured is not an auth layer, and "the env
 * var was missing" is exactly how a gate ends up open in production. The login
 * page says so explicitly rather than silently rejecting a correct password.
 *
 * ══ WHAT IT IS NOT ══
 *
 * Not a user system. One shared password, one signed cookie, no accounts, no
 * database table, no change to RLS or the schema. It sits in front of the
 * application; nothing inside it moved.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build output and browser conventions. None of these reaches a route
  // handler, and the login page cannot render without its own stylesheet.
  if (isInfrastructurePath(pathname)) return NextResponse.next();

  // The gate itself.
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = process.env.APP_PASSWORD;

  /**
   * Scheduled jobs present a secret instead of a cookie.
   *
   * Checked INLINE rather than by importing `isCronAuthorized`, because that
   * module is typed against NextRequest in a Node context and this runs on the
   * Edge. The logic is identical and the route handlers still run their own
   * check — the same credential verified twice, in two places, on purpose.
   */
  if (isCronPath(pathname) && cronAuthorized(request)) {
    return NextResponse.next();
  }

  if (await isAuthenticated(secret, request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  /**
   * API routes get 401 JSON. Pages get redirected to the login form.
   *
   * A fetch that receives an HTML login page parses it as JSON and dies with
   * "Unexpected token '<'" — the exact failure the feed-health probe hit when
   * Vercel redirected it into SSO. Do not rebuild that.
   */
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        error: 'Unauthorized.',
        detail: secret
          ? 'This deployment requires a session. Sign in at /login.'
          : 'APP_PASSWORD is not set on this deployment, so every request is refused.',
      },
      { status: 401 },
    );
  }

  const login = new URL('/login', request.url);
  // Where they were going, so the form can return them there. Path only —
  // never an absolute URL, which would make this an open redirect.
  if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

/** Both forms the six scheduled jobs use. Constant-time, fails closed. */
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Supabase pg_cron — three jobs.
  const header = request.headers.get('x-cron-secret');
  if (header && constantTimeEqual(header, secret)) return true;

  // Vercel Cron — three jobs.
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return constantTimeEqual(auth.slice(7), secret);

  return false;
}

export const config = {
  /**
   * ⚠️ EVERYTHING. The exceptions live in lib/auth/public-routes.ts, where a
   * test can read them and a reviewer can see them in a diff.
   *
   * A narrower matcher is the standard pattern and it is the wrong one here:
   * it puts the security boundary in a regex, fails open when the regex is
   * wrong, and cannot be enumerated by a test. This form is slower and
   * legible, and legible is what a boundary has to be.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
