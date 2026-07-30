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
   * THE AUTH GATE.
   *
   * middleware.ts only checks whether a session cookie exists — it cannot
   * validate one, because it must not import @supabase/ssr (see the comment
   * at the top of that file). This is where the token is actually verified:
   * getUser() revalidates the JWT against the auth server, so a forged or
   * expired cookie gets past middleware and is rejected here.
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
