import { fetchWithTimeout } from '@/lib/utils';
import { centroidFor } from './states';

/**
 * EPA data — non-attainment areas and Class VI wells.
 *
 * Non-attainment is the combustion-fighter map: where NAAQS are exceeded, new
 * combustion permitting is hardest and a non-combustion source is worth most.
 *
 * EPA's Green Book is published as HTML/spreadsheet rather than a stable
 * GeoJSON API, so the authoritative area list is checked into the repo below
 * and enriched with live data when a source is configured. Each record carries
 * its own provenance so the UI never implies live data it doesn't have.
 */

export type Pollutant = 'ozone-8hr' | 'pm25' | 'pm10' | 'so2' | 'no2' | 'co' | 'lead';

export interface NonAttainmentArea {
  id: string;
  name: string;
  states: string[];
  pollutant: Pollutant;
  /** EPA classification severity, where the pollutant defines one. */
  classification: string | null;
  lat: number;
  lng: number;
  source: 'green-book-static' | 'epa-live';
}

/**
 * Major non-attainment areas relevant to industrial siting.
 *
 * NOT the complete Green Book list — this is the subset that overlaps heavy
 * industry, and it is a point-marker approximation rather than a true polygon
 * boundary. Treat it as "there is a designation here, go check the Green
 * Book", not as a permitting determination.
 *
 * Verify against https://www.epa.gov/green-book before relying on any entry
 * in a customer-facing document.
 */
const GREEN_BOOK_AREAS: NonAttainmentArea[] = [
  {
    id: 'houston-galveston-brazoria',
    name: 'Houston–Galveston–Brazoria, TX',
    states: ['TX'],
    pollutant: 'ozone-8hr',
    classification: 'Severe',
    lat: 29.76,
    lng: -95.37,
    source: 'green-book-static',
  },
  {
    id: 'dallas-fort-worth',
    name: 'Dallas–Fort Worth, TX',
    states: ['TX'],
    pollutant: 'ozone-8hr',
    classification: 'Severe',
    lat: 32.78,
    lng: -96.8,
    source: 'green-book-static',
  },
  {
    id: 'south-coast-ca',
    name: 'South Coast Air Basin, CA',
    states: ['CA'],
    pollutant: 'ozone-8hr',
    classification: 'Extreme',
    lat: 34.05,
    lng: -117.9,
    source: 'green-book-static',
  },
  {
    id: 'san-joaquin-valley',
    name: 'San Joaquin Valley, CA',
    states: ['CA'],
    pollutant: 'ozone-8hr',
    classification: 'Extreme',
    lat: 36.75,
    lng: -119.77,
    source: 'green-book-static',
  },
  {
    id: 'san-diego',
    name: 'San Diego County, CA',
    states: ['CA'],
    pollutant: 'ozone-8hr',
    classification: 'Severe',
    lat: 32.72,
    lng: -117.16,
    source: 'green-book-static',
  },
  {
    id: 'nyc-nj-ct',
    name: 'New York–N. New Jersey–Long Island',
    states: ['NY', 'NJ', 'CT'],
    pollutant: 'ozone-8hr',
    classification: 'Severe',
    lat: 40.71,
    lng: -74.01,
    source: 'green-book-static',
  },
  {
    id: 'chicago',
    name: 'Chicago–Naperville, IL–IN–WI',
    states: ['IL', 'IN', 'WI'],
    pollutant: 'ozone-8hr',
    classification: 'Moderate',
    lat: 41.88,
    lng: -87.63,
    source: 'green-book-static',
  },
  {
    id: 'philadelphia',
    name: 'Philadelphia–Wilmington–Atlantic City',
    states: ['PA', 'NJ', 'DE', 'MD'],
    pollutant: 'ozone-8hr',
    classification: 'Moderate',
    lat: 39.95,
    lng: -75.17,
    source: 'green-book-static',
  },
  {
    id: 'baton-rouge',
    name: 'Baton Rouge, LA',
    states: ['LA'],
    pollutant: 'ozone-8hr',
    classification: 'Marginal',
    lat: 30.45,
    lng: -91.19,
    source: 'green-book-static',
  },
  {
    id: 'denver-north-front-range',
    name: 'Denver Metro / North Front Range, CO',
    states: ['CO'],
    pollutant: 'ozone-8hr',
    classification: 'Severe',
    lat: 39.74,
    lng: -104.99,
    source: 'green-book-static',
  },
  {
    id: 'salt-lake-city-pm25',
    name: 'Salt Lake City, UT',
    states: ['UT'],
    pollutant: 'pm25',
    classification: 'Serious',
    lat: 40.76,
    lng: -111.89,
    source: 'green-book-static',
  },
  {
    id: 'pittsburgh-pm25',
    name: 'Pittsburgh–Beaver Valley, PA',
    states: ['PA'],
    pollutant: 'pm25',
    classification: 'Moderate',
    lat: 40.44,
    lng: -79.996,
    source: 'green-book-static',
  },
];

export function listNonAttainment(): NonAttainmentArea[] {
  return GREEN_BOOK_AREAS;
}

/** Non-attainment areas touching a state — used to flag a deal's siting risk. */
export function nonAttainmentForState(state?: string | null): NonAttainmentArea[] {
  if (!state) return [];
  const code = state.trim().toUpperCase();
  return GREEN_BOOK_AREAS.filter((a) => a.states.includes(code));
}

export function nonAttainmentGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: GREEN_BOOK_AREAS.map((area) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [area.lng, area.lat] },
      properties: {
        id: area.id,
        name: area.name,
        pollutant: area.pollutant,
        classification: area.classification,
        states: area.states.join(', '),
        source: area.source,
      },
    })),
  };
}

// ── Class VI wells / state primacy ──────────────────────────────

export type PrimacyStatus = 'granted' | 'pending' | 'federal';

export interface PrimacyRecord {
  status: PrimacyStatus;
  authority: string;
  /** Year primacy was granted, or expected decision year when pending. */
  date?: string;
  expected?: string;
}

/**
 * UIC Class VI primacy by state.
 *
 * Static because primacy changes a few times a year, not daily. Verify against
 * epa.gov/uic before using in a customer document — a wrong primacy claim
 * misstates the permitting path and timeline.
 */
export const PRIMACY_STATUS: Record<string, PrimacyRecord> = {
  ND: { status: 'granted', authority: 'ND Industrial Commission', date: '2018' },
  WY: { status: 'granted', authority: 'Wyoming DEQ', date: '2020' },
  LA: { status: 'granted', authority: 'Louisiana DENR', date: '2024' },
  WV: { status: 'granted', authority: 'West Virginia DEP', date: '2025' },
  AZ: { status: 'granted', authority: 'Arizona DEQ', date: '2025' },
  TX: { status: 'pending', authority: 'Railroad Commission of Texas', expected: '2026' },
  CO: { status: 'pending', authority: 'Colorado ECMC', expected: '2026' },
};

export function primacyFor(state?: string | null): PrimacyRecord {
  if (!state) {
    return { status: 'federal', authority: 'US EPA Region (direct implementation)' };
  }
  return (
    PRIMACY_STATUS[state.trim().toUpperCase()] ?? {
      status: 'federal',
      authority: 'US EPA Region (direct implementation)',
    }
  );
}

export function primacyCounts(): Record<PrimacyStatus, number> {
  const counts: Record<PrimacyStatus, number> = { granted: 0, pending: 0, federal: 0 };
  for (const rec of Object.values(PRIMACY_STATUS)) counts[rec.status]++;
  counts.federal = 51 - counts.granted - counts.pending;
  return counts;
}

/**
 * Class VI well GeoJSON.
 *
 * EPA publishes the permit tracker as an HTML table, not an API. Until a
 * structured source is wired up we plot one marker per primacy state so the
 * layer communicates *where authority sits* rather than fabricating well
 * coordinates we do not have.
 */
export function classVIGeoJson() {
  const features = Object.entries(PRIMACY_STATUS).flatMap(([state, rec]) => {
    const point = centroidFor(state);
    if (!point) return [];
    return [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
        properties: {
          state,
          stateName: point.name,
          status: rec.status,
          authority: rec.authority,
          date: rec.date ?? rec.expected ?? null,
          note: 'Primacy marker — not an individual well location.',
        },
      },
    ];
  });

  return { type: 'FeatureCollection' as const, features };
}

/**
 * Best-effort live fetch of EPA's Class VI page.
 *
 * Returns null on any failure, which is the normal case — the page is HTML and
 * its structure is not guaranteed. Callers fall back to the static data above.
 */
export async function fetchClassVILive(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      'https://www.epa.gov/uic/class-vi-wells-permitted-epa',
      { headers: { 'User-Agent': 'PowerDealBot/1.0' } },
      10000,
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
