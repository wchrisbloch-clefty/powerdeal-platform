import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The Intelligence hub's tab bar.
 *
 * Tabs are LINKS with a `?tab=` param, not client state. Three reasons, all of
 * them things client-side tabs would have cost:
 *   · Each tab loads only its own data on the server. Client tabs would mean
 *     fetching CCUS events, rate benchmarks and the signal log on every visit
 *     to the Feed.
 *   · A tab is shareable and survives a refresh.
 *   · Back does what it should.
 */

export const INTEL_TABS = [
  // Headlines leads, and is the default. The feed answers "what was
  // published"; this answers "what matters to my pipeline this morning",
  // which is the question somebody actually opens the tab to ask.
  { id: 'headlines', label: 'Headlines' },
  { id: 'feed', label: 'Feed' },
  { id: 'market-watch', label: 'Market Watch' },
  { id: 'trending', label: 'Trending' },
  { id: 'signals', label: 'Signals' },
  { id: 'ccus', label: 'CCUS' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'video', label: 'Video' },
  { id: 'research', label: 'Research' },
] as const;

export type IntelTab = (typeof INTEL_TABS)[number]['id'];

export const DEFAULT_TAB: IntelTab = 'headlines';

export function isIntelTab(value: string | undefined): value is IntelTab {
  return INTEL_TABS.some((t) => t.id === value);
}

export default function IntelTabs({ active }: { active: IntelTab }) {
  return (
    <nav
      /**
       * ══ IT WRAPS. IT NEVER SCROLLS SIDEWAYS. ══
       *
       * With top-level nav moved to a top bar, a horizontally scrolling tab
       * row here would sit directly under it — two stacked scrollers, which is
       * the layout where people lose their place. The reason is specific:
       * sideways-scrolled content is hidden WITH NO AFFORDANCE. You cannot see
       * how many tabs exist or where you are among them.
       *
       * Nine short pills wrap to a second line at around 700px and everything
       * stays visible. It costs ~28px of height at narrow widths, which is
       * cheaper than the thing it prevents. `flex-wrap`, and deliberately no
       * `overflow-x-auto` — tests/nav.test.ts asserts the absence.
       *
       * ══ AND IT IS CONTENT, NOT CHROME ══
       *
       * No bar fill, no full-bleed background, no sticky. It sits on the page
       * ground under the heading so it reads as a control ON this page rather
       * than a second navigation row. The global bar is chrome; this is not.
       */
      className="flex flex-wrap gap-1"
      aria-label="Intelligence sections"
    >
      {INTEL_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.id === DEFAULT_TAB ? '/app/intelligence' : `/app/intelligence?tab=${tab.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-tap items-center whitespace-nowrap rounded-md px-3 text-sm transition-colors sm:min-h-tap lg:min-h-tap-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mark focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
              isActive
                // Filled pill rather than an underline: an underline here would
                // echo the top bar's active treatment and the two levels would
                // read as one.
                ? 'bg-bg-overlay font-medium text-text'
                : 'text-text-dim hover:bg-bg-raised hover:text-text',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
