import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  issueSession,
  passwordMatches,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * POST /api/auth/login — exchange the shared password for a signed cookie.
 *
 * ⚠️ THE ONLY ROUTE THAT ANSWERS WITHOUT A SESSION, AND IT READS NOTHING.
 * No Supabase client, no deal, no setting. The worst an attacker can do with
 * unlimited access to it is guess the password, which is what the delay below
 * is for.
 *
 * The response NEVER says whether the password was close, how long it should
 * be, or whether one is configured at all in the wrong-password case — a
 * failure that distinguishes "no password set" from "wrong password" tells an
 * attacker which deployment is worth attacking.
 */

/**
 * A fixed delay on every failure.
 *
 * Not rate limiting — that needs shared state this deployment does not have,
 * and a per-instance counter on serverless is a counter that resets whenever
 * the platform feels like it. A flat 400ms turns an online guessing attack
 * from thousands of attempts a second into two, which for a human-chosen
 * password is the difference that matters. It is applied on EVERY failure
 * including a malformed body, so the timing carries no signal about which
 * kind of failure it was.
 */
const FAILURE_DELAY_MS = 400;

async function refuse(): Promise<NextResponse> {
  await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
  return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.APP_PASSWORD;

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return refuse();
  }

  // `passwordMatches` fails closed when APP_PASSWORD is unset, and the reply
  // is identical to a wrong password. The LOGIN PAGE says the deployment is
  // unconfigured — that message is for the operator looking at their own
  // screen, not for anyone probing the endpoint.
  if (!passwordMatches(secret, password)) return refuse();

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await issueSession(secret!),
    httpOnly: true,   // unreadable from JavaScript, so XSS cannot lift it
    secure: true,     // never sent over plain HTTP
    sameSite: 'lax',  // not attached to cross-site POSTs
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * DELETE — sign out.
 *
 * Clears the cookie by expiring it. There is no server-side session to
 * destroy: revocation for everyone at once is done by rotating APP_PASSWORD,
 * which invalidates every outstanding signature.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE, value: '', httpOnly: true, secure: true,
    sameSite: 'lax', path: '/', maxAge: 0,
  });
  return response;
}
