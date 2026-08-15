import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role data access for the single-user deployment.
 *
 * WHY THIS EXISTS: there is no per-user sign-in. The whole app sits behind one
 * shared password enforced by middleware.ts, so no Supabase session is ever
 * established. RLS on every table keys off auth.uid(), which is null without
 * one, so an anon client returns zero rows from every table. The service role
 * bypasses RLS.
 *
 * ⚠️ THAT PASSWORD IS THE ONLY THING IN FRONT OF THIS CLIENT. Nothing below
 * this line distinguishes the operator from anyone who got past the gate.
 *
 * RLS POLICIES ARE DELIBERATELY LEFT IN PLACE. Nothing here disables them;
 * they simply are not consulted on this path. The moment real auth returns,
 * swapping back to the cookie-bound client restores per-user isolation with
 * no schema migration.
 *
 * ── THE DANGER, AND WHAT GUARDS IT ────────────────────────────────────────
 * Bypassing RLS means the database no longer scopes rows to an owner — this
 * module has to. Every table carries user_id, so a query that forgets
 * `.eq('user_id', ...)` reads or writes ACROSS all users. Today there is one
 * user so the damage is invisible, which is exactly what makes it dangerous:
 * the bug would only surface after a second account exists, by which point
 * the query has been wrong for months.
 *
 * So callers do not build queries freely. ownerSelect() and withOwner() apply
 * the scope, and lib/data.ts goes through them exclusively. If you add a
 * reader or writer, use these — do not reach for getAdminClient() directly
 * unless the operation genuinely spans users, as the cron sweep does.
 *
 * SUPABASE_SERVICE_ROLE_KEY MUST NEVER BE NEXT_PUBLIC_. It is a full bypass
 * of every access control in the database. The `server-only` import above
 * makes a client-component import a build error rather than a leak.
 */

/**
 * The one operator this deployment serves.
 *
 * Hardcoded rather than looked up because there is no session to derive it
 * from. The auth.users row is untouched and still owns every row via
 * user_id — this is the same identity, just asserted instead of proven.
 */
export const POWERDEAL_USER_ID = '96a631ca-f9b3-4b00-a1ad-c23656d8684d';

let cached: SupabaseClient | null | undefined;

/**
 * Raw service-role client. Null when unconfigured, so the zero-key path still
 * degrades to seed data rather than throwing (GLOBAL RULE 4).
 *
 * Prefer ownerSelect/withOwner. Reach for this only when an operation must
 * legitimately cross users.
 */
export function getAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * GLOBAL RULE 1 — the `any` here is deliberate and confined to one alias.
 *
 * Postgrest types its builder off a generated per-table Database type. This
 * project does not generate one, so with a runtime `table: string` the
 * inferred result collapses to GenericStringError[] and every cast in
 * lib/data.ts fails. Making `columns` generic instead sent the compiler into
 * an exponential instantiation that never terminated.
 *
 * The result shape is asserted at each call site in lib/data.ts (`as Deal[]`
 * and friends) exactly as it was before this refactor, when the same queries
 * were built inline against an untyped client — so no type safety is lost
 * relative to what was there.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OwnerQuery = any;

/**
 * A SELECT already filtered to the owner. The only sanctioned way to read —
 * the scope cannot be forgotten because it is applied here.
 *
 * Null when Supabase is unconfigured; callers fall back to seed data.
 */
export function ownerSelect(table: string, columns = '*'): OwnerQuery | null {
  const client = getAdminClient();
  if (!client) return null;
  return client.from(table).select(columns).eq('user_id', POWERDEAL_USER_ID);
}

/**
 * Stamp a row with the owner before insert or update.
 *
 * Spread order matters: user_id goes last so a caller cannot pass a different
 * one, by accident or otherwise.
 */
export function withOwner<T extends Record<string, unknown>>(
  row: T,
): T & { user_id: string } {
  return { ...row, user_id: POWERDEAL_USER_ID };
}
