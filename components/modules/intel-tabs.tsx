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
  { id: 'sources', label: 'Sources' },
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
      className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1"
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
              'relative inline-flex min-h-tap items-center whitespace-nowrap px-3 py-2 text-sm transition-colors xl:min-h-0',
              isActive
                ? 'font-medium text-text'
                : 'text-text-dim hover:text-text',
            )}
          >
            {tab.label}
            {/* The underline is the only accent — a tab bar that colours every
                label reads as nine equally urgent things. */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full',
                isActive ? 'bg-accent' : 'bg-transparent',
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
