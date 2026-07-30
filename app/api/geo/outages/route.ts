import { NextResponse } from 'next/server';
import { fetchOutages, outagesGeoJson, poweroutageConfigured } from '@/lib/geo/poweroutage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/geo/outages — live outages as GeoJSON.
 *
 * Short cache only: an outage layer that is an hour stale is worse than
 * useless, because it implies a grid problem that may already be resolved.
 */
export async function GET() {
  if (!poweroutageConfigured()) {
    return NextResponse.json(
      { error: 'POWEROUTAGE_API_KEY is not configured.' },
      { status: 503 },
    );
  }

  const records = await fetchOutages();
  return NextResponse.json(outagesGeoJson(records), {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
