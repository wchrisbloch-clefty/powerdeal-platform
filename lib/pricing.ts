import type { Deal, RateBenchmark } from '@/lib/types';
import type { RateWithTrend } from '@/lib/geo/eia-api';

/**
 * Group accounts by utility territory and attach the state-level industrial
 * rate. EIA reports by state, not by utility, so every row is the state
 * average for that utility's state — the table copy says so.
 *
 * Lifted out of the old /app/pricing-intel page when Pricing became a tab
 * inside Intelligence: a route module can only export handlers and config, so
 * shared logic has to live outside it.
 */
export function buildBenchmarks(deals: Deal[], rates: RateWithTrend[]): RateBenchmark[] {
  const byState = new Map(rates.map((r) => [r.state, r]));
  const groups = new Map<string, RateBenchmark>();

  for (const deal of deals) {
    if (!deal.utility || !deal.state) continue;

    const state = deal.state.toUpperCase();
    const key = `${deal.utility}::${state}`;
    const existing = groups.get(key);

    if (existing) {
      existing.affected_deals.push({
        id: deal.id,
        deal_id: deal.deal_id,
        company: deal.company,
      });
      continue;
    }

    const rate = byState.get(state);
    groups.set(key, {
      utility: deal.utility,
      state,
      rate_usd_kwh: rate?.rate ?? null,
      yoy_change_pct: rate?.yoyChangePct ?? null,
      // Rate-case filings need a source that publishes them as structured
      // data. Left null rather than guessed.
      active_rate_case: null,
      affected_deals: [{ id: deal.id, deal_id: deal.deal_id, company: deal.company }],
    });
  }

  return [...groups.values()].sort(
    (a, b) => (b.rate_usd_kwh ?? 0) - (a.rate_usd_kwh ?? 0),
  );
}
