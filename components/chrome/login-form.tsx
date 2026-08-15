'use client';

import { use, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Wordmark } from '@/components/ui/bloom-logo';
import { cn } from '@/lib/utils';

/**
 * One field, one shared password.
 *
 * Not a user system and not styled like one: no "create account", no "forgot
 * password", no email. Affordances for things that do not exist are worse than
 * their absence.
 */
export default function LoginForm({
  configured,
  nextParam,
}: {
  configured: boolean;
  nextParam: Promise<{ next?: string }>;
}) {
  const { next } = use(nextParam);
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ PATH ONLY, NEVER AN ABSOLUTE URL. `?next=https://evil.test` would make
   * this an open redirect — a phishing primitive handed out by the login page
   * of all places. A value that is not a single leading slash is discarded,
   * and `//host` is rejected too because browsers read it as protocol-relative.
   */
  const destination =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || state === 'working') return;
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (body.ok) {
        // A full navigation, not a client push: the cookie has to be attached
        // to the next document request for the middleware to see it.
        window.location.href = destination;
        return;
      }
      setState('failed');
      setError(body.error ?? 'Incorrect password.');
      setPassword('');
    } catch (err) {
      setState('failed');
      setError((err as Error).message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center"><Wordmark /></div>

        {!configured ? (
          <p className="mt-6 rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
            <span className="font-medium">APP_PASSWORD is not set on this deployment.</span>{' '}
            Every request is refused, including a correct password — the gate fails closed
            rather than disabling itself. Set it in the Vercel environment and redeploy.
          </p>
        ) : null}

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="pd-password" className="eyebrow">Password</label>
          <div className="relative mt-1.5">
            <Lock
              size={15}
              strokeWidth={1.75}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              id="pd-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className={cn(
                'h-tap w-full rounded-md border border-rule bg-bg-raised pl-8 pr-3 text-sm text-text',
                'placeholder:text-text-faint focus:border-accent-border focus:outline-none',
                'focus-visible:ring-2 focus-visible:ring-accent',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={!password || state === 'working'}
            className={cn(
              'mt-3 inline-flex h-tap w-full items-center justify-center gap-2 rounded-md',
              'border border-rule bg-bg-raised text-sm text-text disabled:opacity-40',
              'hover:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            )}
          >
            {state === 'working' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            Sign in
          </button>

          {error ? (
            /* aria-live so a screen reader announces the failure — a visual-only
               error on the one form a keyboard user must clear is a dead end. */
            <p role="alert" aria-live="polite" className="mt-2 text-2xs text-danger">
              {error}
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-2xs text-text-faint">
          One operator, one shared password. This is the application&rsquo;s own gate —
          it does not depend on a hosting setting.
        </p>
      </div>
    </main>
  );
}
