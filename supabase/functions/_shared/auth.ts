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

/**
 * ═══════════════════════════════════════════════════════════════
 * THE CONTRACT TRAVELS IN A HEADER, ON EVERY RESPONSE.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ IT WAS IN THE BODY ONLY, WHICH MADE ONE FUNCTION UNVERIFIABLE.
 *
 * A body field is returned on the SUCCESS path. For ccus-sweep and
 * market-watch that is fine — both are read-mostly and safe to fire. For
 * stall-alert it is not: a 200 means the job RAN, and running it increments
 * days_in_stage on every in-flight deal. So the only way to read that
 * function's version was to age the entire book by a day.
 *
 * "Which version is deployed" is a question about the DEPLOYMENT, not about
 * the work. It should not cost a side effect to ask, and it should be
 * answerable by a request that is refused.
 *
 * So the header goes on 401 and 500 as well. A deliberately wrong secret now
 * reveals the contract without the function doing anything:
 *
 *   curl -sS -D- -o /dev/null -X POST .../stall-alert \
 *     -H 'x-cron-secret: deliberately-wrong'
 *   → HTTP/2 401
 *     x-powerdeal-contract: 2
 *
 * ⚠️ AND THE HEADER LEAKS NOTHING. It is an integer that increments when a
 * response shape changes. It says which version answered, not what the
 * function knows, holds, or is connected to.
 */
export const CONTRACT_HEADER = 'x-powerdeal-contract';

function headers(contract: number): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    [CONTRACT_HEADER]: String(contract),
  };
}

export function unauthorized(contract: number): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized. Send x-cron-secret.' }),
    { status: 401, headers: headers(contract) },
  );
}

export function ok(body: unknown, contract: number): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: headers(contract) });
}

export function serverError(err: unknown, contract: number): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[edge] failed:', message);
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: headers(contract),
  });
}
