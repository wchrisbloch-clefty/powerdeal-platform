import { fetchWithTimeout } from '@/lib/utils';

/**
 * EIA Open Data v2 client — industrial (C&I) retail electricity rates by state.
 *
 * Free key at eia.gov/opendata. With no key every consumer degrades to "—"
 * rather than failing (GLOBAL RULE 4).
 */

const EIA_BASE = 'https://api.eia.gov/v2';

export interface StateRate {
  state: string;
  /** $/kWh. EIA reports cents/kWh; we convert. */
  rate: number;
  period: string;
}

export interface RateWithTrend extends StateRate {
  yoyChangePct: number | null;
  priorRate: number | null;
}

export function eiaConfigured(): boolean {
  return Boolean(process.env.EIA_API_KEY);
}

interface EiaRow {
  period: string;
  stateid?: string;
  stateId?: string;
  price?: number | string;
  sectorName?: string;
}

interface EiaEnvelope {
  response?: { data?: EiaRow[] };
  error?: string;
}

/**
 * Monthly industrial retail price by state, most recent first.
 *
 * `months` controls how far back to pull — 14 gives the latest month plus the
 * same month a year earlier, which is what the YoY calculation needs.
 */
export async function fetchIndustrialRates(months = 14): Promise<StateRate[]> {
  const key = process.env.EIA_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    api_key: key,
    frequency: 'monthly',
    'data[0]': 'price',
    'facets[sectorid][0]': 'IND',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    offset: '0',
    length: String(Math.max(months * 55, 500)),
  });

  try {
    const res = await fetchWithTimeout(
      `${EIA_BASE}/electricity/retail-sales/data/?${params}`,
      { headers: { Accept: 'application/json' } },
      15000,
    );
    if (!res.ok) {
      console.warn(`[eia] retail-sales ${res.status}`);
      return [];
    }

    const json = (await res.json()) as EiaEnvelope;
    const rows = json.response?.data ?? [];

    return rows.flatMap((row): StateRate[] => {
      const state = (row.stateid ?? row.stateId ?? '').toUpperCase();
      const priceCents =
        typeof row.price === 'string' ? Number.parseFloat(row.price) : row.price;
      if (!state || state.length !== 2 || priceCents === undefined) return [];
      if (Number.isNaN(priceCents)) return [];
      // EIA reports cents/kWh.
      return [{ state, rate: priceCents / 100, period: row.period }];
    });
  } catch (err) {
    console.warn('[eia] fetch failed:', (err as Error).message);
    return [];
  }
}

/**
 * Latest rate per state with year-over-year change.
 *
 * YoY compares the latest period against the same month a year earlier, not
 * against the previous month — industrial rates are strongly seasonal, and a
 * month-over-month delta would read as a rate move when it is just summer.
 */
export async function fetchRatesWithTrend(): Promise<RateWithTrend[]> {
  const rows = await fetchIndustrialRates();
  if (rows.length === 0) return [];

  const byState = new Map<string, StateRate[]>();
  for (const row of rows) {
    const list = byState.get(row.state) ?? [];
    list.push(row);
    byState.set(row.state, list);
  }

  const out: RateWithTrend[] = [];

  for (const [state, list] of byState) {
    list.sort((a, b) => b.period.localeCompare(a.period));
    const latest = list[0];
    if (!latest) continue;

    const [yearStr, monthStr] = latest.period.split('-');
    const priorPeriod = `${Number(yearStr) - 1}-${monthStr}`;
    const prior = list.find((r) => r.period === priorPeriod);

    out.push({
      ...latest,
      priorRate: prior?.rate ?? null,
      yoyChangePct:
        prior && prior.rate > 0
          ? ((latest.rate - prior.rate) / prior.rate) * 100
          : null,
    });
  }

  return out.sort((a, b) => b.rate - a.rate);
}

/** National average C&I rate — the ticker's headline number. */
export async function fetchNationalAverage(): Promise<RateWithTrend | null> {
  const rates = await fetchRatesWithTrend();
  const us = rates.find((r) => r.state === 'US');
  if (us) return us;

  const states = rates.filter((r) => r.state !== 'US');
  if (states.length === 0) return null;

  const mean = states.reduce((sum, r) => sum + r.rate, 0) / states.length;
  const withYoy = states.filter((r) => r.yoyChangePct !== null);
  const meanYoy =
    withYoy.length > 0
      ? withYoy.reduce((sum, r) => sum + (r.yoyChangePct ?? 0), 0) / withYoy.length
      : null;

  return {
    state: 'US',
    rate: mean,
    period: states[0]?.period ?? '',
    priorRate: null,
    yoyChangePct: meanYoy,
  };
}

/** Henry Hub spot price ($/MMBtu) for the context ticker. */
export async function fetchHenryHub(): Promise<{ value: number; period: string } | null> {
  const key = process.env.EIA_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    api_key: key,
    frequency: 'daily',
    'data[0]': 'value',
    'facets[series][0]': 'RNGWHHD',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '1',
  });

  try {
    const res = await fetchWithTimeout(
      `${EIA_BASE}/natural-gas/pri/fut/data/?${params}`,
      { headers: { Accept: 'application/json' } },
      12000,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      response?: { data?: { period: string; value?: number | string }[] };
    };
    const row = json.response?.data?.[0];
    if (!row?.value) return null;

    const value =
      typeof row.value === 'string' ? Number.parseFloat(row.value) : row.value;
    return Number.isNaN(value) ? null : { value, period: row.period };
  } catch {
    return null;
  }
}
