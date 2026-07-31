'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wordmark } from '@/components/ui/bloom-logo';
import Button from '@/components/ui/button';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';
  const urlError = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(urlError);

  const configured = isSupabaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setStatus('error');
      setMessage('Supabase is not configured in this deployment.');
      return;
    }

    setStatus('signing-in');
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus('error');
      /**
       * Supabase returns the same generic message whether the address is
       * unknown or the password is wrong — correctly, since distinguishing
       * them leaks which accounts exist. But this deployment previously used
       * magic links, and an account created that way has no password at all,
       * which produces this exact error and no way to guess why. Naming that
       * case is the difference between a one-click fix and a dead end.
       */
      setMessage(
        error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect. If this account was created with a ' +
              'magic link it has no password yet — set one in Supabase under ' +
              'Authentication → Users, or use "Forgot password".'
          : error.message,
      );
      return;
    }

    /**
     * First-login seed, previously done in the magic-link callback. Password
     * sign-in never touches that route, so it happens here instead.
     *
     * Idempotent and best-effort by design: an empty pipeline is recoverable,
     * a blocked sign-in is not. Same tradeoff the callback made.
     */
    try {
      const { data } = await supabase.rpc('seed_new_user');
      if (typeof data === 'number' && data > 0) {
        router.replace(`${next}?welcome=${data}`);
        router.refresh();
        return;
      }
    } catch {
      // Non-fatal — fall through to the normal redirect.
    }

    // refresh() so server components re-render against the new session cookie.
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 inline-block">
        <Wordmark />
      </Link>

      <div className="rounded-card border border-rule bg-bg-raised p-6">
        <h1 className="font-display text-xl text-text">Sign in to PowerDeal</h1>
        <p className="mt-1.5 text-sm text-text-dim">
          Email and password.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="eyebrow mb-1.5 block">
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow mb-1.5 block">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={status === 'signing-in' || !configured}
          >
            {status === 'signing-in' ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {!configured && (
          <p className="mt-3 rounded-md border border-rule bg-bg px-3 py-2 text-xs text-text-dim">
            Supabase is not configured, so sign-in is unavailable. The app still runs
            on template data —{' '}
            <Link href="/app" className="text-accent-dim underline underline-offset-2">
              open it directly
            </Link>
            .
          </p>
        )}

        {message && (
          <p className="mt-3 text-xs text-danger" role="alert">
            {message}
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-text-faint">
        <Link href="/" className="hover:text-text-dim">
          ← Back to powerdeal
        </Link>
      </p>
    </div>
  );
}

const inputClass = cn(
  'h-10 w-full rounded-md border border-rule bg-bg px-3 text-sm text-text',
  'placeholder:text-text-faint focus:border-accent-border focus:outline-none',
);

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
