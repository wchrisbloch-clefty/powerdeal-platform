'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Wordmark } from '@/components/ui/bloom-logo';
import Button from '@/components/ui/button';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';
  const urlError = params.get('error');

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
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

    setStatus('sending');
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 inline-block">
        <Wordmark />
      </Link>

      <div className="rounded-card border border-rule bg-bg-raised p-6">
        {status === 'sent' ? (
          <>
            <div className="mb-3 h-0.5 w-10 rounded-full bg-accent" />
            <h1 className="font-display text-xl text-text">Check your email</h1>
            <p className="mt-2 text-sm text-text-dim">
              We sent a sign-in link to <span className="text-text">{email}</span>. It
              expires in an hour.
            </p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-4 text-sm text-accent-dim underline underline-offset-2"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl text-text">Sign in to PowerDeal</h1>
            <p className="mt-1.5 text-sm text-text-dim">
              No password. We email you a one-time link.
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
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={cn(
                    'h-10 w-full rounded-md border border-rule bg-bg px-3 text-sm text-text',
                    'placeholder:text-text-faint focus:border-accent-border focus:outline-none',
                  )}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={status === 'sending' || !configured}
              >
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
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
          </>
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

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
