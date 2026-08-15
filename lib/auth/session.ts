/**
 * ═══════════════════════════════════════════════════════════════
 * THE SECOND LAYER.
 * ═══════════════════════════════════════════════════════════════
 *
 * A hosting toggle was the only thing between 21 named defense, midstream and
 * industrial accounts — with contacts, competitive postures and next moves —
 * and the open internet. Vercel's Standard Protection covers deployment URLs
 * and not the production alias, and Password Protection is Pro-gated, so on
 * Hobby the platform offers nothing. The application had no auth of its own.
 *
 * That was always the wrong architecture. An app whose only boundary is a
 * setting in someone else's dashboard has a boundary it does not control and
 * cannot test.
 *
 * ══ WHAT THIS IS, AND DELIBERATELY IS NOT ══
 *
 * One user, one shared password, one signed cookie. It is NOT a user system:
 * no accounts, no registration, no password reset, no roles, no database
 * table. It touches neither RLS nor the schema — every policy is exactly as it
 * was, and this sits in front of the whole application rather than inside it.
 *
 * ══ EDGE RUNTIME ══
 *
 * Middleware runs on the Edge runtime, where `node:crypto` does not exist. All
 * of this uses Web Crypto (`crypto.subtle`), which is available in both Edge
 * and Node, so the same functions verify in middleware and sign in a route
 * handler. One implementation, two runtimes — a second copy for Node would be
 * a second copy to get subtly wrong.
 *
 * ══ EVERY COMPARISON IS CONSTANT-TIME ══
 *
 * Both the password check and the signature check. An early return on the
 * first differing byte leaks the secret one character at a time to anyone
 * willing to measure.
 */

export const SESSION_COOKIE = 'pd_session';

/**
 * Seven days. Long enough that a working week does not mean re-entering it
 * daily; short enough that a cookie lifted off a machine expires on its own.
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constant-time string compare.
 *
 * ⚠️ THE LENGTH CHECK IS ITSELF A LEAK, and it is accepted deliberately: it
 * reveals only the LENGTH of the secret, and avoiding it needs a fixed-size
 * digest comparison. Both inputs here are already fixed-length digests by the
 * time they reach the signature path, so the only place a length differs is
 * the password path, where an attacker learning the length has learned very
 * little compared to what a byte-by-byte early return gives them.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * The cookie value: `<expiry-ms>.<hmac>`.
 *
 * The expiry is INSIDE the signed payload, not only in the Set-Cookie header.
 * A `Max-Age` is a request to the browser and nothing more — anyone can replay
 * a cookie past it. Signing the expiry means the server enforces it.
 *
 * There is no session id and nothing stored server-side, because there is
 * nothing to store: one user, and revocation is done by rotating the password,
 * which invalidates every outstanding cookie at once.
 */
export async function issueSession(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${await hmac(secret, String(expiresAt))}`;
}

export type SessionVerdict = 'valid' | 'expired' | 'bad-signature' | 'malformed' | 'no-secret';

/**
 * Verify a cookie.
 *
 * ⚠️ RETURNS A NAMED VERDICT, NOT A BOOLEAN. `expired` and `bad-signature`
 * lead to different responses — the first should send the reader to the login
 * form, the second is worth knowing about — and a boolean collapses them into
 * "not allowed", which is exactly the kind of one-way collapse this codebase
 * keeps finding. Everything except `valid` denies.
 */
export async function verifySession(
  secret: string | undefined,
  cookie: string | undefined | null,
  now = Date.now(),
): Promise<SessionVerdict> {
  // ⚠️ FAILS CLOSED. No password configured means nobody gets in — NOT that
  // the gate is skipped. An auth layer that disables itself when
  // misconfigured is not an auth layer.
  if (!secret) return 'no-secret';
  if (!cookie) return 'malformed';

  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return 'malformed';

  const expiresRaw = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !signature) return 'malformed';

  // Signature FIRST, then expiry. Checking expiry first would answer a
  // question about an unauthenticated payload — the value is attacker-supplied
  // until the HMAC says otherwise.
  const expected = await hmac(secret, expiresRaw);
  if (!constantTimeEqual(signature, expected)) return 'bad-signature';

  return expiresAt > now ? 'valid' : 'expired';
}

/** True only for a cookie that verifies and has not expired. */
export async function isAuthenticated(
  secret: string | undefined,
  cookie: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  return (await verifySession(secret, cookie, now)) === 'valid';
}

/** Does the submitted password match? Constant-time, fails closed. */
export function passwordMatches(secret: string | undefined, submitted: string): boolean {
  if (!secret) return false;
  return constantTimeEqual(submitted, secret);
}
