'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, BarChart3, RadioTower, Map,
  FileText, MessageSquare, SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Wordmark } from '@/components/ui/bloom-logo';
import { POWERDEAL_VERSION } from '@/lib/brand';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom tab bar (5 slots). */
  primary?: boolean;
}

/**
 * Destinations only.
 *
 * This was ten items, four of which were not destinations but views of the same
 * intelligence — Social, CCUS and Pricing are now tabs inside Intelligence, and
 * Sources moved out of Settings to join them. A nav item should answer "where
 * am I going", not "how do I want this filtered"; filters belong at the top of
 * the destination they filter.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: Home, primary: true },
  { href: '/app/pipeline', label: 'Pipeline', icon: BarChart3, primary: true },
  { href: '/app/intelligence', label: 'Intelligence', icon: RadioTower, primary: true },
  { href: '/app/maps', label: 'Maps', icon: Map, primary: true },
  { href: '/app/forge', label: 'Forge', icon: FileText },
  { href: '/app/chat', label: 'Chat', icon: MessageSquare, primary: true },
];

/**
 * Pinned to the bottom and de-emphasized. Settings is somewhere you go once to
 * configure and then rarely again — giving it equal weight in the main list
 * spends the reader's attention on it every single time they navigate.
 */
export const SETTINGS_ITEM: NavItem = {
  href: '/app/settings',
  label: 'Settings',
  icon: SlidersHorizontal,
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

/** Desktop left sidebar. Hidden below `md`, where the tab bar takes over. */
export function Sidebar() {
  const isActive = useIsActive();

  return (
    <nav
      className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-rule bg-bg md:flex"
      aria-label="Main"
    >
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center border-b border-rule px-4">
        <Link href="/app" className="flex min-h-tap items-center rounded xl:min-h-0">
          <Wordmark />
        </Link>
      </div>

      <ul className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'mb-0.5 flex min-h-tap items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors xl:min-h-0',
                  active
                    ? 'bg-bg-raised font-medium text-text'
                    : 'text-text-dim hover:bg-bg-raised hover:text-text',
                )}
              >
                {/* The active marker is the one accent element in the nav. */}
                <span
                  aria-hidden
                  className={cn(
                    'h-4 w-0.5 rounded-full',
                    active ? 'bg-accent' : 'bg-transparent',
                  )}
                />
                <Icon size={16} strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-rule px-2 pb-1 pt-2">
        <Link
          href={SETTINGS_ITEM.href}
          aria-current={isActive(SETTINGS_ITEM.href) ? 'page' : undefined}
          className={cn(
            'flex min-h-tap items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors xl:min-h-0',
            isActive(SETTINGS_ITEM.href)
              ? 'bg-bg-raised font-medium text-text'
              : 'text-text-faint hover:bg-bg-raised hover:text-text-dim',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-4 w-0.5 rounded-full',
              isActive(SETTINGS_ITEM.href) ? 'bg-accent' : 'bg-transparent',
            )}
          />
          <SETTINGS_ITEM.icon size={16} strokeWidth={1.75} />
          {SETTINGS_ITEM.label}
        </Link>
      </div>

      <div className="shrink-0 border-t border-rule px-4 py-3">
        <p className="font-mono text-micro uppercase tracking-wider text-text-faint">
          Brain v{POWERDEAL_VERSION}
        </p>
      </div>
    </nav>
  );
}

/** Mobile bottom tab bar — 5 primary destinations. */
export function TabBar() {
  const isActive = useIsActive();
  const tabs = NAV_ITEMS.filter((i) => i.primary);

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-bg md:hidden',
        'pb-[env(safe-area-inset-bottom)]',
      )}
      aria-label="Main"
    >
      {tabs.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-micro',
              active ? 'text-accent' : 'text-text-dim',
            )}
          >
            <Icon size={19} strokeWidth={active ? 2 : 1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
