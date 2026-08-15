import { NavBar, TabBar } from '@/components/chrome/nav';
import TopBar from '@/components/chrome/top-bar';
import { collectEnvWarnings } from '@/lib/env-check';
import AgentAlertBanner from '@/components/chrome/agent-alert-banner';
import { Suspense } from 'react';
import UsageTracker from '@/components/chrome/usage-tracker';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /**
   * NO GATE IN THIS LAYOUT, AND THAT IS NOT THE SAME AS NO GATE.
   *
   * middleware.ts runs before every request to every path and refuses anything
   * without a valid session cookie. Checking again here would be a second
   * boundary that can disagree with the first, and the one a reader trusts
   * would be whichever they happened to find.
   *
   * ⚠️ The gate is the MIDDLEWARE, not this file and not the hosting platform.
   * This comment used to read "Vercel SSO is the ONLY thing standing in front
   * of this data" — which was true, and the thing it named turned out not to
   * cover the production alias. Both /app and /api returned 200 to an
   * unauthenticated curl. Do not put the boundary back in someone else's
   * dashboard.
   *
   * Below the gate there is still no per-user session: every /app/* page and
   * API route reads through the service role scoped in code to
   * POWERDEAL_USER_ID — see lib/supabase/admin.ts. RLS policies remain on
   * every table, untouched, simply not consulted on this path.
   */

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
      {/* Top-level nav is CHROME: full-bleed, sticky, above the content well.
          Intelligence's own tabs live in its page body and are styled as
          content, so the two never read as stacked nav rows — the layout where
          people lose their place. */}
      <NavBar />
      {/* Mobile only. Below md the bottom tab bar owns navigation, so this
          thin row has search and the theme toggle to itself — the two never
          stack, at either breakpoint. */}
      <TopBar />

      <div>
        <main
          className="scrollbar-thin px-4 pb-24 pt-5 md:px-7 md:pb-10"
          // Bottom padding clears the mobile tab bar.
        >
          <div className="mx-auto w-full max-w-shell">
            {/* Renders only when a scheduled job has failed twice running.
                Sits in the shell so it reaches every screen — an alert on one
                page is an alert the operator can walk past. */}
            <AgentAlertBanner />
            {children}
          </div>
        </main>
      </div>

      <TabBar />

      {/* USAGE CAPTURE FOR THE WEEK. In the shell so it reaches every surface —
          the finding that matters most is which surfaces are never opened, and
          a tracker mounted per-page cannot see the pages it is not on.
          Suspense because useSearchParams opts the tree into client rendering;
          without it every /app route would be forced dynamic. */}
      <Suspense fallback={null}>
        <UsageTracker />
      </Suspense>
    </div>
  );
}
