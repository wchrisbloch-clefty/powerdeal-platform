'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search, LogOut } from 'lucide-react';
import ThemeToggle from './theme-toggle';
import { Wordmark } from '@/components/ui/bloom-logo';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export default function TopBar({ email }: { email?: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Search is pipeline-scoped — the deal list is the thing worth finding.
    router.push(`/app/pipeline?q=${encodeURIComponent(q)}`);
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const initial = email?.trim()?.[0]?.toUpperCase() ?? '·';

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

        {email ? (
          <>
            <span
              title={email}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                'border border-rule bg-bg-raised font-mono text-xs text-text-dim',
              )}
            >
              {initial}
            </span>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule text-text-dim transition-colors hover:bg-bg-raised hover:text-text"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
