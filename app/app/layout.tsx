import { redirect } from 'next/navigation';
import { Sidebar, TabBar } from '@/components/chrome/nav';
import TopBar from '@/components/chrome/top-bar';
import { getUser } from '@/lib/supabase/server';
import { collectEnvWarnings, envStatus } from '@/lib/env-check';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  /**
   * THE AUTH GATE for every /app/* page.
   *
   * There is deliberately NO middleware.ts. Next.js middleware compiles to a
   * Vercel Edge Function, and three consecutive deploys died there with
   * `ReferenceError: __dirname is not defined` thrown at module init — from
   * Next's own middleware runtime, not from application code, and not
   * reproducible in a local build. It 500'd every route including the public
   * landing page.
   *
   * Gating here instead is strictly better anyway: getUser() revalidates the
   * JWT against the auth server, which edge middleware reading a cookie could
   * never do. Behind this sit getAuthedClient() on every read, 401s in the
   * API routes, and RLS in Postgres.
   *
   * Route handlers under /app (e.g. /app/capture) bypass this layout and
   * carry their own check — keep it that way when adding one.
   *
   * GLOBAL RULE 4: with Supabase unconfigured there is no auth to enforce —
   * the product runs on seed data with no login, and gating that would break
   * the zero-key demo path.
   */
  if (envStatus().supabase && !user) {
    redirect('/login?next=/app');
  }

  // Warnings, never errors — the product runs with zero keys (GLOBAL RULE 4).
  // Logged server-side only so the console stays useful during setup.
  const warnings = collectEnvWarnings();
  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[powerdeal] running degraded:\n${warnings.map((w) => `  · ${w}`).join('\n')}`,
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />

      {/* Sidebar is fixed, so the content column owns the left offset. */}
      <div className="md:pl-sidebar">
        <TopBar email={user?.email} />
        <main
          className="scrollbar-thin px-4 pb-24 pt-5 md:px-7 md:pb-10"
          // Bottom padding clears the mobile tab bar.
        >
          <div className="mx-auto w-full max-w-shell">{children}</div>
        </main>
      </div>

      <TabBar />
    </div>
  );
}
