'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, BarChart3, RadioTower, Map,
  FileText, MessageSquare, SlidersHorizontal, Calculator, GraduationCap,
  MoreHorizontal, X, Search, LogOut,
} from 'lucide-react';
import ThemeToggle from './theme-toggle';
import type { LucideIcon } from 'lucide-react';
import { Wordmark } from '@/components/ui/bloom-logo';
import { POWERDEAL_VERSION } from '@/lib/brand';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Shown in the mobile bottom tab bar. Four slots; the fifth is More.
   *
   * ⚠️ PROVISIONAL. Nobody has data on which four these should be, and this
   * set is a guess — Maps carried `primary` before and is demoted here on a
   * hunch. `/api/usage` records opens and dwell per surface, and after the
   * usage week this list gets re-derived from real counts rather than
   * re-argued. That is the same standard applied to the Video and Research
   * tabs: defer to data where data is coming.
   */
  primary?: boolean;
}

/**
 * Destinations only.
 *
 * A nav item answers "where am I going", not "how do I want this filtered".
 * Filters belong at the top of the destination they filter — which is why
 * Intelligence's tabs live in its page body rather than as a second chrome
 * row, and why Sources moved to Settings: a configuration screen sitting in a
 * row of reading surfaces is a category error, not a usage question.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: Home, primary: true },
  { href: '/app/pipeline', label: 'Pipeline', icon: BarChart3, primary: true },
  { href: '/app/intelligence', label: 'Intelligence', icon: RadioTower, primary: true },
  { href: '/app/chat', label: 'Chat', icon: MessageSquare, primary: true },
  { href: '/app/maps', label: 'Maps', icon: Map },
  { href: '/app/economics', label: 'Economics', icon: Calculator },
  { href: '/app/forge', label: 'Forge', icon: FileText },
  // Deliberately not primary. Learn is somewhere you go on purpose, in a gap
  // between meetings — top-level weight would spend attention on it during the
  // hours that are for working deals.
  { href: '/app/learn', label: 'Learn', icon: GraduationCap },
];

/**
 * Settings sits apart from the eight, in both bars.
 *
 * Somewhere you go once to configure and then rarely again. Equal weight in
 * the main row spends the reader's attention on it every single navigation.
 */
export const SETTINGS_ITEM: NavItem = {
  href: '/app/settings',
  label: 'Settings',
  icon: SlidersHorizontal,
};

/** What the More sheet holds: everything not in the bottom four, plus Settings. */
export function overflowItems(): NavItem[] {
  return [...NAV_ITEMS.filter((i) => !i.primary), SETTINGS_ITEM];
}

/**
 * Sign out. Clears the cookie and returns to the gate.
 *
 * A full navigation rather than a router push: the cleared cookie has to be
 * absent from the NEXT document request for middleware to refuse it.
 */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/login', { method: 'DELETE' });
  window.location.href = '/login';
}

/** What the bottom bar holds. Four, and the count is asserted. */
export function primaryItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.primary);
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

/**
 * ══ ACTIVE STATE READS TWO WAYS, ON PURPOSE ══
 *
 * A 2px accent border AND a brighter, heavier label. Border alone fails for
 * anyone who cannot separate the hue from the rule beside it; weight alone is
 * too quiet to find at a glance across eight items.
 *
 * `focus-visible` is its own ring rather than borrowing the active treatment —
 * keyboard focus on a non-active item must not look like the current page.
 */
const NAV_BASE =
  'inline-flex items-center justify-center transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mark focus-visible:ring-offset-1 focus-visible:ring-offset-bg';

const NAV_ACTIVE = 'text-text font-medium';
const NAV_IDLE = 'text-text-dim hover:text-text';

/**
 * Top bar — md and up.
 *
 * All eight visible at both breakpoints, no overflow menu. Between md and lg
 * the icon stacks over the label so eight fit inside 768px; at lg they sit
 * side by side. It never wraps and never scrolls sideways: hidden content with
 * no affordance is the layout where people lose their place, which is the same
 * reason Intelligence's tabs wrap rather than scroll.
 */
export function NavBar() {
  const isActive = useIsActive();
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/app/pipeline?q=${encodeURIComponent(q)}`);
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 hidden border-b border-rule bg-bg md:block',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      <div className="mx-auto flex w-full max-w-shell items-stretch gap-3 px-4 md:px-7">
        <Link
          href="/app"
          className={cn(
            'flex shrink-0 items-center rounded pr-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mark',
          )}
          aria-label="PowerDeal — dashboard"
        >
          <Wordmark />
        </Link>

        {/**
          * ⚠️ THE LIST OVERFLOWED THIS CONTAINER AND THE CONTROLS PAINTED OVER
          * IT. `min-w-0 flex-1` let the <nav> shrink to whatever was left; the
          * <ul> inside it did not shrink, because eight items at
          * `min-w-nav-item` is a hard 512px. So the list ran past its own box
          * and the trailing cluster drew on top of the last item.
          *
          * Learn was unreachable at every width from 768 to 1023 — covered by
          * the search control, on every surface in the app. Measured, not
          * inferred: Learn occupied 609–673 while the cluster began at ~594.
          *
          * The arithmetic in tokens.css said it fit: "eight at
          * --nav-item-min-w is 512px of 768px, leaving room for the wordmark".
          * It counted the wordmark (111px) and never counted the control
          * cluster (200px). 111 + 512 + 200 = 823 into 712px of content width.
          * It never fit at any md width; the comment asserted otherwise from
          * the day it was written.
          *
          * `overflow-x-auto` makes the overflow VISIBLE AND NAVIGABLE instead
          * of silent. Nothing is stacked, and all eight stay reachable — which
          * is what the assertion always claimed and could not check.
          *
          * ⚠️ `scrollbar-thin`, NOT `no-scrollbar`. The first version of this
          * fix hid the scrollbar, which left Learn clipped with no affordance —
          * the exact failure the original comment on this component warned
          * about ("hidden content with no affordance is the layout where people
          * lose their place"), reintroduced by the fix for a different failure.
          * The render check caught it, because a clipped item still fails a
          * hit-test at its own coordinates.
          *
          * At lg the items go inline, the row fits, and the container reverts
          * to visible so nothing clips.
          */}
        <nav aria-label="Main" className="scrollbar-thin min-w-0 flex-1 overflow-x-auto lg:overflow-visible">
          <ul className="flex h-topbar-stacked items-stretch lg:h-topbar">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      NAV_BASE,
                      // Stacked at md, inline at lg. `min-w-nav-item` is the
                      // touch target at the stacked breakpoint and is what
                      // makes eight fit inside an iPad portrait viewport.
                      'min-w-nav-item flex-col gap-0.5 px-1.5 text-2xs',
                      'lg:min-w-0 lg:flex-row lg:gap-2 lg:px-3 lg:text-sm',
                      // The border is on the ELEMENT, not a pseudo-element, so
                      // it participates in layout identically whether active or
                      // not — a border that appears on activation shifts every
                      // sibling by 2px.
                      'border-b-nav-active',
                      active ? 'border-accent-mark' : 'border-transparent',
                      active ? NAV_ACTIVE : NAV_IDLE,
                    )}
                  >
                    <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            ⚠️ SEARCH AND NAV NOW SHARE ONE ROW, AND THAT IS THE POINT.
            The search bar used to be its own chrome row under the sidebar.
            With nav at the top, keeping it separate would stack two chrome
            rows on desktop — the same collision Intelligence's tabs created,
            one level up.

            The input needs ~200px and eight inline items need ~720px; with the
            wordmark and controls that clears 1280 but not 1024. So the INPUT
            appears at xl and a search BUTTON stands in below it. The button is
            not a degraded input: search is pipeline-scoped already
            (`/app/pipeline?q=`), so it routes to the surface that owns the
            filter rather than pretending to be a global search.
          */}
          <form onSubmit={onSearch} className="relative hidden xl:block">
            <Search
              size={15}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              aria-label="Search accounts"
              className={cn(
                'h-tap-sm w-48 rounded-md border border-rule bg-bg-raised pl-8 pr-3 text-sm',
                'text-text placeholder:text-text-faint',
                'focus:border-accent-border focus:outline-none',
              )}
            />
          </form>

          <Link
            href="/app/pipeline"
            aria-label="Search accounts"
            className={cn(
              NAV_BASE,
              'h-tap w-tap rounded-md text-text-faint hover:text-text-dim lg:h-tap-sm lg:w-tap-sm xl:hidden',
            )}
          >
            <Search size={17} strokeWidth={1.75} aria-hidden />
          </Link>

          <ThemeToggle />

          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            className={cn(
              NAV_BASE,
              'h-tap w-tap rounded-md text-text-faint hover:text-text-dim lg:h-tap-sm lg:w-tap-sm',
            )}
          >
            <LogOut size={17} strokeWidth={1.75} aria-hidden />
          </button>

          <Link
            href={SETTINGS_ITEM.href}
            aria-current={isActive(SETTINGS_ITEM.href) ? 'page' : undefined}
            aria-label={SETTINGS_ITEM.label}
            className={cn(
              NAV_BASE,
              'h-tap w-tap rounded-md lg:h-tap-sm lg:w-tap-sm',
              isActive(SETTINGS_ITEM.href) ? 'text-text' : 'text-text-faint hover:text-text-dim',
            )}
          >
            <SETTINGS_ITEM.icon size={17} strokeWidth={1.75} aria-hidden />
          </Link>
          <p className="hidden font-mono text-2xs uppercase tracking-label text-text-faint xl:block">
            v{POWERDEAL_VERSION}
          </p>
        </div>
      </div>
    </header>
  );
}

/**
 * Bottom tab bar — below md.
 *
 * ⚠️ NOT A TOP BAR, AND THE ARITHMETIC SETTLES IT. Eight items at the 44pt
 * minimum is 352px of target before any padding, against a 375px phone. It
 * does not fit. Separately, the top of a 6.7" phone is not reachable
 * one-handed, and both platforms put primary navigation at the bottom.
 *
 * Four primary plus More. Every one of the eight is still reachable — four
 * directly, four through the sheet — which is what the breakpoint assertion
 * in tests/nav.test.ts checks.
 */
export function TabBar() {
  const isActive = useIsActive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tabs = primaryItems();
  const overflow = overflowItems();

  // Navigating closes the sheet. Without this it survives the route change and
  // covers the page the reader just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes it, because a full-width sheet with no keyboard exit is a
  // trap for anyone not using touch.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const overflowActive = overflow.some((i) => isActive(i.href));

  return (
    <>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-bg/80 md:hidden"
          />
          <div
            role="dialog"
            aria-label="More destinations"
            className={cn(
              'fixed inset-x-0 bottom-0 z-40 rounded-t-card border-t border-rule bg-bg-raised md:hidden',
              // Padding, not margin: the fill reaches the home indicator while
              // the targets sit above it.
              'pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]',
            )}
          >
            <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
              <p className="eyebrow">More</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className={cn(NAV_BASE, 'h-tap w-tap rounded-md text-text-faint hover:text-text')}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <ul className="p-2">
              <li>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className={cn(
                    NAV_BASE,
                    'min-h-tap w-full justify-start gap-2.5 rounded-md px-3 text-sm',
                    NAV_IDLE,
                  )}
                >
                  <LogOut size={17} strokeWidth={1.75} aria-hidden />
                  Sign out
                </button>
              </li>
              {overflow.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        NAV_BASE,
                        'min-h-tap w-full justify-start gap-2.5 rounded-md px-3 text-sm',
                        active ? cn(NAV_ACTIVE, 'bg-bg-overlay') : NAV_IDLE,
                      )}
                    >
                      <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}

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
                NAV_BASE,
                'min-h-tap flex-1 flex-col gap-0.5 py-2 text-2xs',
                active ? NAV_ACTIVE : NAV_IDLE,
              )}
            >
              <Icon size={19} strokeWidth={active ? 2 : 1.75} aria-hidden />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            NAV_BASE,
            'min-h-tap flex-1 flex-col gap-0.5 py-2 text-2xs',
            // The More tab reads as active when the current page lives inside
            // it. Otherwise a reader on /app/learn sees no active tab at all
            // and concludes the bar is broken.
            open || overflowActive ? NAV_ACTIVE : NAV_IDLE,
          )}
        >
          <MoreHorizontal size={19} strokeWidth={open || overflowActive ? 2 : 1.75} aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
