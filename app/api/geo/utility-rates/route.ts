import { NextResponse } from 'next/server';
import { fetchRatesWithTrend, eiaConfigured } from '@/lib/geo/eia-api';

export const revalidate = 86400;

/** GET /api/geo/utility-rates — industrial $/kWh by state, with YoY. */
export async function GET() {
  if (!eiaConfigured()) {
    return NextResponse.json(
      {
        error: 'EIA_API_KEY is not configured.',
        hint: 'Free key at https://www.eia.gov/opendata/register.php',
        rates: [],
      },
      { status: 503 },
    );
  }

  const rates = await fetchRatesWithTrend();
  return NextResponse.json(
    { rates, source: 'EIA Open Data v2 — retail sales, industrial sector' },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' } },
  );
}
