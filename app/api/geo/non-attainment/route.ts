import { NextResponse } from 'next/server';
import { nonAttainmentGeoJson } from '@/lib/geo/epa-api';

// Static dataset — cache hard.
export const revalidate = 86400;

/** GET /api/geo/non-attainment — EPA non-attainment areas as GeoJSON. */
export async function GET() {
  return NextResponse.json(nonAttainmentGeoJson(), {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
