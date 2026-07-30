import { NextResponse } from 'next/server';
import { getDeals } from '@/lib/data';
import { toCsv } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Spine column order — matches the pipeline table left-to-right. */
const COLUMNS = [
  'deal_id', 'company', 'vertical', 'relationship_type', 'geo_tier', 'state',
  'utility', 'value_prop', 'beachhead_site', 'stage', 'size_mw', 'size_usd_m',
  'meddpicc_score', 'health_score', 'multi_threaded', 'decision_mapped',
  'days_in_stage', 'next_move', 'next_move_date', 'key_risk',
  'metrics_known', 'economic_buyer', 'decision_criteria', 'decision_process',
  'identified_pain', 'champion', 'competition',
  'landed_site', 'next_target_site', 'expansion_mw_captured',
  'expansion_mw_addressable', 'partner_notes', 'notes',
  'created_at', 'updated_at',
];

/** GET /api/deals/export — the full Spine as CSV. */
export async function GET() {
  const { data: deals } = await getDeals();

  const rows = deals.map((deal) =>
    Object.fromEntries(
      COLUMNS.map((col) => [col, (deal as unknown as Record<string, unknown>)[col]]),
    ),
  );

  const date = new Date().toISOString().slice(0, 10);
  // Excel opens UTF-8 CSV as mojibake without a BOM.
  const csv = `﻿${toCsv(rows, COLUMNS)}`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="powerdeal-pipeline-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
