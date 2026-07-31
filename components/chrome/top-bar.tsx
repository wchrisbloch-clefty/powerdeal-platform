'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import ThemeToggle from './theme-toggle';
import { Wordmark } from '@/components/ui/bloom-logo';
import { cn } from '@/lib/utils';

/**
 * Sign-in was removed — the deployment is single-user behind Vercel SSO — so
 * there is no account chip or sign-out control here any more. Leaving a
 * sign-out button that cleared a session nothing depends on would have been a
 * dead affordance.
 */
export default function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Search is pipeline-scoped — the deal list is the thing worth finding.
    router.push(`/app/pipeline?q=${encodeURIComponent(q)}`);
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-[var(--topbar-height)] items-center gap-3',
        'border-b border-rule bg-bg/95 px-4 backdrop-blur',
      )}
    >
      {/* Wordmark shows on mobile only — the sidebar carries it on desktop. */}
      <Link href="/app" className="md:hidden">
        <Wordmark />
      </Link>

      <form onSubmit={onSearch} className="relative ml-auto w-full max-w-sm md:ml-0">
        <Search
          size={15}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accounts…"
          aria-label="Search accounts"
          className={cn(
            'h-9 w-full rounded-md border border-rule bg-bg-raised pl-8 pr-3 text-sm',
            'text-text placeholder:text-text-faint',
            'focus:border-accent-border focus:outline-none',
          )}
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

      </div>
    </header>
  );
}
