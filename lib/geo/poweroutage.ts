import { fetchWithTimeout } from '@/lib/utils';
import { centroidFor, STATE_CENTROIDS } from './states';

/**
 * PowerOutage.us client — live grid stress.
 *
 * This is the grid-fighter proof layer: a customer watching their territory go
 * dark is a customer who will take the reliability conversation. With no key
 * the layer is hidden from the map controls entirely rather than shown empty.
 */

export interface OutageRecord {
  state: string;
  stateName: string;
  outageCount: number;
  customerCount: number;
  /** Share of tracked customers currently out, 0..1. */
  outageFraction: number;
  lat: number;
  lng: number;
}

export function poweroutageConfigured(): boolean {
  return Boolean(process.env.POWEROUTAGE_API_KEY);
}

interface PoStateRow {
  StateName?: string;
  state_name?: string;
  CountyName?: string;
  OutageCount?: number | string;
  outage_count?: number | string;
  CustomerCount?: number | string;
  customer_count?: number | string;
}

/** PowerOutage.us keys by state name; we key by code everywhere else. */
const STATE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CENTROIDS).map(([code, point]) => [
    point.name.toLowerCase(),
    code,
  ]),
);

function num(value: number | string | undefined): number {
  if (value === undefined) return 0;
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Current outages by state. Returns [] when unconfigured or on any failure —
 * a dead third party must never break the map.
 */
export async function fetchOutages(): Promise<OutageRecord[]> {
  const key = process.env.POWEROUTAGE_API_KEY;
  if (!key) return [];

  try {
    const res = await fetchWithTimeout(
      'https://poweroutage.us/api/web/states',
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
          'X-API-Key': key,
        },
      },
      12000,
    );

    if (!res.ok) {
      console.warn(`[poweroutage] ${res.status}`);
      return [];
    }

    const rows = (await res.json()) as PoStateRow[] | { data?: PoStateRow[] };
    const list = Array.isArray(rows) ? rows : (rows.data ?? []);

    return list.flatMap((row): OutageRecord[] => {
      const name = (row.StateName ?? row.state_name ?? '').trim();
      const code = STATE_BY_NAME[name.toLowerCase()];
      const point = centroidFor(code);
      if (!code || !point) return [];

      const outageCount = num(row.OutageCount ?? row.outage_count);
      const customerCount = num(row.CustomerCount ?? row.customer_count);

      return [
        {
          state: code,
          stateName: point.name,
          outageCount,
          customerCount,
          outageFraction: customerCount > 0 ? outageCount / customerCount : 0,
          lat: point.lat,
          lng: point.lng,
        },
      ];
    });
  } catch (err) {
    console.warn('[poweroutage] fetch failed:', (err as Error).message);
    return [];
  }
}

export function outagesGeoJson(records: OutageRecord[]) {
  return {
    type: 'FeatureCollection' as const,
    features: records
      .filter((r) => r.outageCount > 0)
      .map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          state: r.state,
          stateName: r.stateName,
          outageCount: r.outageCount,
          customerCount: r.customerCount,
          outageFraction: r.outageFraction,
        },
      })),
  };
}

/** States with a materially elevated outage share — the call-today list. */
export function stressedStates(records: OutageRecord[], threshold = 0.01): string[] {
  return records
    .filter((r) => r.outageFraction >= threshold)
    .sort((a, b) => b.outageFraction - a.outageFraction)
    .map((r) => r.state);
}
