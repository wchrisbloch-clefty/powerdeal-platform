import 'server-only';
import { fetchNationalAverage, fetchHenryHub, eiaConfigured } from './geo/eia-api';
import { primacyCounts } from './geo/epa-api';
import type { TickerData } from '@/components/modules/ticker';

/**
 * Assemble the context ticker.
 *
 * Every value is either real or null — there is no estimation path. ERCOT and
 * PJM real-time prices are deliberately null: neither ISO exposes a keyless
 * public endpoint, and inventing a number that a rep might quote on a call is
 * the worst possible failure here.
 */
export async function getTickerData(): Promise<TickerData> {
  const notes: Record<string, string> = {
    'ercot-spot':
      'ERCOT real-time pricing needs an ERCOT API registration — not wired up.',
    'pjm-spot': 'PJM Data Miner requires a subscription key — not wired up.',
  };

  if (!eiaConfigured()) {
    notes['henry-hub'] = 'Set EIA_API_KEY to enable (free at eia.gov/opendata).';
    notes['nat-avg-rate'] = 'Set EIA_API_KEY to enable (free at eia.gov/opendata).';
    notes['rate-yoy'] = 'Set EIA_API_KEY to enable (free at eia.gov/opendata).';

    return {
      henryHub: null,
      usAvgRate: null,
      rateYoy: null,
      classViPermits: primacyCounts().granted,
      ercotRt: null,
      pjmRt: null,
      notes,
    };
  }

  const [avg, hh] = await Promise.all([
    fetchNationalAverage().catch(() => null),
    fetchHenryHub().catch(() => null),
  ]);

  if (!avg) notes['nat-avg-rate'] = 'EIA returned no industrial rate data.';
  if (!hh) notes['henry-hub'] = 'EIA returned no Henry Hub series.';

  return {
    henryHub: hh?.value ?? null,
    usAvgRate: avg?.rate ?? null,
    rateYoy: avg?.yoyChangePct ?? null,
    // Counts states with Class VI primacy, not individual permits — EPA has
    // no structured permit-count endpoint. The ticker label says "Permits";
    // the tooltip corrects it.
    classViPermits: primacyCounts().granted,
    ercotRt: null,
    pjmRt: null,
    notes: {
      ...notes,
      'class-vi': 'States with Class VI primacy granted (EPA publishes no permit-count API).',
    },
  };
}
