import { NextResponse } from 'next/server';

export const revalidate = 86400;

/**
 * GET /api/geo/co2-pipelines
 *
 * NATCARB/NETL publishes CO₂ pipeline geometry through EDX, which requires an
 * account and does not expose a stable anonymous GeoJSON URL. Rather than ship
 * a hardcoded approximation of pipeline routes — which someone could reasonably
 * read as real infrastructure siting data — this returns an empty collection
 * and an explanation.
 *
 * To enable: download the NATCARB CO₂ pipeline layer from EDX, convert to
 * GeoJSON, and either serve it from public/geo/ or set CO2_PIPELINES_URL.
 */
export async function GET() {
  const configured = process.env.CO2_PIPELINES_URL;

  if (configured) {
    try {
      const res = await fetch(configured, { next: { revalidate: 86400 } });
      if (res.ok) {
        return NextResponse.json(await res.json(), {
          headers: { 'Cache-Control': 'public, s-maxage=86400' },
        });
      }
    } catch {
      // Fall through to the empty collection below.
    }
  }

  return NextResponse.json({
    type: 'FeatureCollection' as const,
    features: [],
    note:
      'No CO₂ pipeline source configured. NATCARB data requires an NETL EDX account — ' +
      'export it to GeoJSON and set CO2_PIPELINES_URL. Deliberately empty rather than ' +
      'approximated: fabricated pipeline routes would be indistinguishable from real ones.',
  });
}
