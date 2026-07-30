import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth middleware — refreshes the Supabase session cookie and gates /app/*.
 *
 * SELF-CONTAINED ON PURPOSE. Next.js middleware compiles to a Vercel Edge
 * Function, and the `@/*` path alias is not resolved in that bundle — importing
 * the logic from `@/lib/supabase/middleware` fails the deploy with
 * "referencing unsupported modules". Everything below is edge-safe: no `fs`,
 * no Node built-ins, no path aliases.
 *
 * Keep it that way. If this file needs a helper, inline it here rather than
 * importing from lib/.
 */

/** Routes reachable without a session. */
const PUBLIC_PATHS = ['/', '/pricing', '/login', '/auth/callback'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  // API routes authorize themselves — each one either checks the user session
  // (returning 401 JSON) or a cron secret. Redirecting them here would send an
  // HTML 307 to /login instead, which breaks two things: scheduled sweeps
  // authenticating with x-cron-secret and no cookie, and any fetch() client
  // that expects JSON back.
  if (pathname.startsWith('/api/')) return true;

  return (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    /\.(svg|png|ico|webmanifest|js|css|txt|xml)$/.test(pathname)
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Zero-key path (GLOBAL RULE 4): with Supabase unconfigured the gate opens
  // entirely and the product runs on seed data with no login.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser(), not getSession() — it revalidates the JWT with the auth server
  // rather than trusting a cookie that may be forged or stale.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Signed-in users don't need the login page.
  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/app';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The session cookie must
     * be refreshed on navigations, not on asset fetches.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
