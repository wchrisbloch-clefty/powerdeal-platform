import { NextResponse } from 'next/server';
import { centroidFor } from '@/lib/geo/states';

export const revalidate = 86400;

/**
 * GET /api/geo/rto-regions — approximate RTO/ISO footprints.
 *
 * Served locally rather than proxied. EIA's atlas endpoint for RTO boundaries
 * is not a stable public GeoJSON URL, and shipping a real boundary file would
 * add megabytes for a layer that exists to answer "which market is this
 * account in?".
 *
 * Each region is a marker at the centroid of its member states, with the
 * member list in the properties. Precise enough for the question; honest
 * about not being a boundary — `approximate: true` is on every feature.
 */

const RTOS: { id: string; name: string; states: string[] }[] = [
  { id: 'ercot', name: 'ERCOT', states: ['TX'] },
  {
    id: 'pjm',
    name: 'PJM Interconnection',
    states: ['PA', 'NJ', 'MD', 'DE', 'VA', 'WV', 'OH', 'DC', 'KY', 'IN', 'MI', 'NC'],
  },
  { id: 'caiso', name: 'CAISO', states: ['CA'] },
  { id: 'iso-ne', name: 'ISO New England', states: ['MA', 'CT', 'RI', 'NH', 'VT', 'ME'] },
  { id: 'nyiso', name: 'NYISO', states: ['NY'] },
  {
    id: 'miso',
    name: 'MISO',
    states: ['MN', 'IA', 'WI', 'IL', 'MO', 'AR', 'LA', 'MS', 'MI', 'IN', 'ND', 'SD', 'MT'],
  },
  { id: 'spp', name: 'Southwest Power Pool', states: ['KS', 'OK', 'NE', 'SD', 'ND', 'NM', 'AR', 'MO'] },
];

export async function GET() {
  const features = RTOS.flatMap((rto) => {
    const points = rto.states
      .map((s) => centroidFor(s))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (points.length === 0) return [];

    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;

    return [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: {
          id: rto.id,
          name: rto.name,
          states: rto.states.join(', '),
          approximate: true,
          note: 'Centroid of member states — not a market boundary.',
        },
      },
    ];
  });

  return NextResponse.json(
    { type: 'FeatureCollection' as const, features },
    { headers: { 'Cache-Control': 'public, s-maxage=86400' } },
  );
}
