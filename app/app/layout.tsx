import { Sidebar, TabBar } from '@/components/chrome/nav';
import TopBar from '@/components/chrome/top-bar';
import { getUser } from '@/lib/supabase/server';
import { collectEnvWarnings } from '@/lib/env-check';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

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
