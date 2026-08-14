import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { parseSchemaManifest, summarise, type LiveTable } from '@/lib/schema-drift';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schema/drift — what schema.sql declares vs. what the database has.
 *
 * The only class of defect where declaration and reality can silently disagree
 * and nothing in the repo can tell. `feed_items.url_hash` was declared, absent,
 * and written on every sweep for the entire life of the feature.
 *
 * NON-GATING. It reports. It never blocks a deploy, a request, a deal or an
 * artifact — and it returns 200 even when it finds blocking drift, because the
 * HTTP status describes whether the CHECK ran, not whether the schema is
 * clean. A monitor that 500s on a finding is a monitor that looks broken
 * exactly when it is working.
 *
 * Read-only: information_schema and pg_constraint, nothing else.
 */
export async function GET() {
  const manifest = parseSchemaManifest(
    readFileSync(join(process.cwd(), 'supabase', 'schema.sql'), 'utf-8'),
  );

  const client = getAdminClient();
  if (!client) {
    return NextResponse.json(
      summarise(manifest, null, 'SUPABASE_SERVICE_ROLE_KEY is not set — the live schema cannot be read.'),
    );
  }

  const { data, error } = await client.rpc('schema_snapshot');
  if (error) {
    // Distinguish "could not look" from "looked and found nothing" — the
    // health-surface rule. A missing RPC is a setup gap, not a clean bill.
    return NextResponse.json(
      summarise(manifest, null, `schema_snapshot RPC failed: ${error.message}. Apply supabase/migrations/20260814_schema_snapshot.sql.`),
    );
  }

  return NextResponse.json(summarise(manifest, (data ?? []) as LiveTable[], null));
}
