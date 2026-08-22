import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { readSentinel, type SchemaSentinel } from '@/lib/schema-revision';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/drift — stored derived scores vs. the functions that name them.
 *
 * ═══════════════════════════════════════════════════════════════
 * THE SCHEMA-DRIFT DEFECT, ONE LAYER IN.
 * ═══════════════════════════════════════════════════════════════
 *
 * Schema drift is a declaration disagreeing with the database. This is a STORED
 * VALUE disagreeing with the function that produced it — and it is worse,
 * because the derivation claims otherwise. A wrong number invites a question;
 * a number labelled "computed" that was never computed does not.
 *
 * Twenty-one deals carried hand-written whole-integer health scores for the
 * life of this build, inflated 100–167%, while `compute_health_score` sat in
 * the schema being read by nothing. The average, the at-risk count, the
 * distribution and the needs-attention ORDERING were all fiction, and the
 * ordering was the worst of it: deals appeared to differ when twenty were
 * identical.
 *
 * ⚠️ IT COMPARES AGAINST THE DATABASE'S OWN FUNCTION AND NEVER A COPY OF IT.
 * `health_drift()` runs `compute_health_score` and `compute_meddpicc_score`
 * inside PostgreSQL. Reimplementing the rule here in TypeScript would make this
 * a third implementation, and a drift check that can itself drift reports on
 * nothing. That is the same reasoning that keeps the case vocabulary parsed
 * from source rather than copied.
 *
 * NON-GATING. Returns 200 whether or not it finds drift: the status describes
 * whether the CHECK ran. A monitor that 500s on a finding looks broken exactly
 * when it is working.
 */

interface DriftRow {
  deal_id: string;
  company: string;
  stored_health: number;
  computed_health: number;
  stored_meddpicc: number;
  computed_meddpicc: number;
}

export async function GET() {
  const client = getAdminClient();
  if (!client) {
    return NextResponse.json({
      ok: false,
      checked: false,
      drifted: null,
      rows: [],
      sentinel: null,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not set — stored scores cannot be read.',
    });
  }

  /**
   * ⚠️ THE SENTINEL IS READ FIRST AND SEPARATELY, because it explains the rest.
   * A database where schema.sql never completed will report score drift too —
   * and "the scores disagree" is a much less useful thing to be told than "the
   * schema was never fully applied, which is why". Reading it here means a
   * half-applied schema surfaces on the health page rather than being found
   * five weeks later from the opposite end.
   */
  const sentinel = await readSchemaSentinel(client);

  const { data, error } = await client.rpc('health_drift');

  /*
    ⚠️ "COULD NOT LOOK" IS NOT "NOTHING TO REPORT", and this endpoint exists
    because those two were confused for weeks. `drifted: null` rather than 0:
    a caller rendering "0 drifted" from a failed RPC would be making exactly
    the claim this check was built to catch.
  */
  if (error) {
    return NextResponse.json({
      ok: false,
      checked: false,
      drifted: null,
      rows: [],
      sentinel,
      error:
        `health_drift RPC failed: ${error.message}. ` +
        `Apply supabase/migrations/20260822_health_recompute.sql.`,
    });
  }

  const rows = (data ?? []) as DriftRow[];

  return NextResponse.json({
    // ⚠️ A NEVER-COMPLETED SCHEMA IS NOT OK EVEN WITH ZERO DRIFT. The scores
    // can agree on a database missing two triggers — they agree because
    // nothing has written since. Folding the sentinel into `ok` is what stops
    // "no drift" reading as "healthy" on a half-applied schema.
    ok: rows.length === 0 && sentinel.state === 'current',
    checked: true,
    sentinel,
    drifted: rows.length,
    // Capped for the surface; the count above is the whole truth.
    rows: rows.slice(0, 25),
    truncated: Math.max(0, rows.length - 25),
    error: null,
  });
}

/**
 * Read `schema_applied_through()` — the function created by the LAST statement
 * of schema.sql.
 *
 * ⚠️ AN ERROR HERE IS THE ANSWER, NOT A FAILURE. The function being absent is
 * exactly what "schema.sql never ran to completion" looks like from outside,
 * and it is the state this database was in for six weeks. So a failed RPC
 * becomes `never-completed` rather than being reported as a broken check —
 * unlike `health_drift`, where a failure genuinely means we could not look.
 */
async function readSchemaSentinel(
  client: NonNullable<ReturnType<typeof getAdminClient>>,
): Promise<SchemaSentinel> {
  const { data, error } = await client.rpc('schema_applied_through');
  if (error || typeof data !== 'number') return readSentinel(null);
  return readSentinel(data);
}
