import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routing middleware.
 *
 * ⚠️ THIS FILE MUST IMPORT NOTHING BUT `next/server`.
 *
 * Middleware compiles to a Vercel Edge Function. Two separate deploys died here:
 *   1. `@/lib/supabase/middleware` — the `@/*` alias is not resolved in the
 *      edge bundle ("referencing unsupported modules").
 *   2. `@supabase/ssr` — its CJS entry got bundled with a `__dirname`
 *      reference, throwing `ReferenceError: __dirname is not defined` at
 *      module init, which 500s EVERY route including the landing page.
 *
 * So this file no longer talks to Supabase at all. It makes a cheap routing
 * decision from cookie presence and nothing else.
 *
 * THIS IS NOT THE AUTH GATE. It cannot be — it never validates a token. The
 * real gate is server-side, where it can actually verify:
 *   · app/app/layout.tsx        → getUser(), redirects when unauthenticated
 *   · lib/data.ts               → getAuthedClient() on every read
 *   · app/api/**                → 401 without a verified user
 *   · Postgres RLS              → the backstop under all of it
 *
 * A forged cookie gets past this file and is then rejected by every one of
 * those. All this saves is a wasted round trip to a page that would bounce.
 *
 * Session refresh moved to lib/supabase/server.ts createClient(), whose
 * setAll() handler writes refreshed cookies during server rendering.
 */

/** Public routes — no session cookie needed. */
const PUBLIC_PATHS = ['/', '/pricing', '/login', '/auth/callback'];

/**
 * Supabase stores its session as `sb-<project-ref>-auth-token`, sometimes
 * split across `.0`/`.1` chunks when the JWT is large.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  // API routes authorize themselves — a session check returning 401 JSON, or
  // a cron secret. Bouncing them to an HTML login page would break the
  // scheduled sweeps, which authenticate with x-cron-secret and no cookie.
  if (pathname.startsWith('/api/')) return true;

  return (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    /\.(svg|png|ico|webmanifest|js|css|txt|xml)$/.test(pathname)
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // GLOBAL RULE 4: with Supabase unconfigured there is no sign-in to send
  // anyone to — redirecting here would bounce every /app route to a login
  // page that cannot work, breaking the zero-key demo path. NEXT_PUBLIC_*
  // vars are inlined at build time, so this needs no import.
  const supabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseConfigured) return NextResponse.next();

  if (!hasSessionCookie(request)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
