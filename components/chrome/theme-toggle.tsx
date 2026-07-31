'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_STORAGE_KEY } from '@/lib/brand';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

export default function ThemeToggle({ className }: { className?: string }) {
  // Start null so the button renders inert until we've read the DOM — the
  // real value was set by the pre-paint bootstrap in app/layout.tsx.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — the theme still applies this session.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className={cn(
        'inline-flex h-tap w-tap xl:h-9 xl:w-9 items-center justify-center rounded-md border border-rule',
        'text-text-dim transition-colors hover:bg-bg-raised hover:text-text',
        className,
      )}
    >
      {theme === 'dark' ? (
        <Sun size={16} strokeWidth={1.75} />
      ) : (
        <Moon size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}
