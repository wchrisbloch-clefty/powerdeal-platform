/**
 * Cron secret gate for edge functions (CB Hub pattern).
 *
 * Mirrors lib/cron-auth.ts on the Next side. An unset CRON_SECRET denies
 * everything — an unset secret must never mean "open to the internet", and
 * these functions can write to every user's data.
 */
export function isAuthorized(request: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return false;

  const header = request.headers.get('x-cron-secret');
  if (header && timingSafeEqual(header, secret)) return true;

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return timingSafeEqual(auth.slice(7), secret);

  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized. Send x-cron-secret.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

export function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function serverError(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[edge] failed:', message);
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
