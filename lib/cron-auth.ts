import type { NextRequest } from 'next/server';

/**
 * Cron authorization gate (CB Hub pattern).
 *
 * Accepts either an `x-cron-secret` header (pg_cron / Supabase edge) or
 * Vercel Cron's `Authorization: Bearer` form.
 *
 * Returns false when CRON_SECRET is unset — an unset secret must never mean
 * "allow everyone". Cron routes fall back to requiring a user session, which
 * is a safe default.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('x-cron-secret');
  if (header && timingSafeEqual(header, secret)) return true;

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return timingSafeEqual(auth.slice(7), secret);
  }

  return false;
}

/** Constant-time compare — a length-independent early return leaks the secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
