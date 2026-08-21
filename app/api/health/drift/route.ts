import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

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
      error: 'SUPABASE_SERVICE_ROLE_KEY is not set — stored scores cannot be read.',
    });
  }

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
      error:
        `health_drift RPC failed: ${error.message}. ` +
        `Apply supabase/migrations/20260822_health_recompute.sql.`,
    });
  }

  const rows = (data ?? []) as DriftRow[];

  return NextResponse.json({
    ok: rows.length === 0,
    checked: true,
    drifted: rows.length,
    // Capped for the surface; the count above is the whole truth.
    rows: rows.slice(0, 25),
    truncated: Math.max(0, rows.length - 25),
    error: null,
  });
}
