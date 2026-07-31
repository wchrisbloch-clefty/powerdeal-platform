import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase code-exchange callback.
 *
 * Sign-in no longer comes through here — /login uses signInWithPassword and
 * seeds the account itself. This is kept for PASSWORD RECOVERY, which still
 * arrives as a one-time code in an emailed link and would otherwise have
 * nowhere to land. Deleting it would leave a forgotten password unrecoverable
 * without the Supabase dashboard.
 *
 * Seeding stays because recovery can be the first successful sign-in on an
 * account. It is idempotent, and failure is non-fatal — an empty pipeline is
 * recoverable, a blocked sign-in is not.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/app';
  const error = searchParams.get('error_description') ?? searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Sign-in link is missing its code.')}`,
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Supabase is not configured.')}`,
    );
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  // First-login seed: creates user_settings and copies the template pipeline.
  // Idempotent, so running it on every sign-in is safe.
  try {
    const { data, error: seedError } = await supabase.rpc('seed_new_user');
    if (seedError) {
      console.warn('[auth] seed_new_user failed:', seedError.message);
    } else if (typeof data === 'number' && data > 0) {
      // Signal the onboarding card on the destination page.
      return NextResponse.redirect(`${origin}${next}?welcome=${data}`);
    }
  } catch (err) {
    console.warn('[auth] seed_new_user threw:', err);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
