import { NextResponse } from 'next/server';
import { classVIGeoJson } from '@/lib/geo/epa-api';

export const revalidate = 86400;

/**
 * GET /api/geo/class-vi — Class VI primacy markers.
 *
 * EPA publishes the permit tracker as an HTML table, not an API. Rather than
 * scrape a page whose structure changes without notice, this returns one
 * marker per primacy state — real, checkable data — and each feature carries
 * a `note` saying it marks authority, not a well location.
 */
export async function GET() {
  return NextResponse.json(classVIGeoJson(), {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
