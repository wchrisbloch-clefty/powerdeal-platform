'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { Deal, RateBenchmark } from '@/lib/types';
import type { RateWithTrend } from '@/lib/geo/eia-api';
import { STATE_CENTROIDS } from '@/lib/geo/states';
import { rateColor, RATE_LEGEND } from '@/lib/geo/layers';
import { pct, cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/card';

export default function PricingPanel({
  rates,
  deals,
  benchmarks,
  configured,
}: {
  rates: RateWithTrend[];
  deals: Deal[];
  benchmarks: RateBenchmark[];
  configured: boolean;
}) {
  const [sortBy, setSortBy] = useState<'rate' | 'yoy'>('rate');

  const sorted = useMemo(() => {
    const rows = rates.filter((r) => r.state !== 'US');
    return [...rows].sort((a, b) =>
      sortBy === 'rate'
        ? b.rate - a.rate
        : (b.yoyChangePct ?? -Infinity) - (a.yoyChangePct ?? -Infinity),
    );
  }, [rates, sortBy]);

  const dealStates = useMemo(
    () => new Set(deals.map((d) => d.state?.toUpperCase()).filter(Boolean)),
    [deals],
  );

  if (!configured) {
    return (
      <div className="space-y-5">
        <Header />
        <EmptyState
          kind="unchecked"
          title="EIA_API_KEY not configured"
          body="Rate data comes from the EIA Open Data API — free, no usage limits worth worrying about. Register at eia.gov/opendata/register.php, add EIA_API_KEY to your environment, and this page fills in with industrial rates for all 50 states plus year-over-year movement."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header />

      {/* ── Rate map ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>National industrial rate map</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Darker is more expensive — and a more expensive grid is a stronger case.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          {/* A 50-tile grid rather than a true choropleth: it ranks and
              compares just as well, loads instantly, and reads on a phone. */}
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {sorted.map((r) => {
              const inPipeline = dealStates.has(r.state);
              return (
                <div
                  key={r.state}
                  title={`${STATE_CENTROIDS[r.state]?.name ?? r.state}: $${r.rate.toFixed(3)}/kWh${
                    r.yoyChangePct !== null ? ` (${pct(r.yoyChangePct)} YoY)` : ''
                  }`}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded',
                    inPipeline && 'ring-2 ring-accent ring-offset-1 ring-offset-bg-raised',
                  )}
                  style={{ background: rateColor(r.rate) }}
                >
                  <span className="font-mono text-2xs font-medium text-white mix-blend-luminosity">
                    {r.state}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
            {RATE_LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-2xs text-text-dim">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 text-2xs text-text-dim">
              <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-accent" />
              Has a pipeline account
            </span>
          </div>
        </CardBody>
      </Card>

      {/* ── Per-account benchmark table ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rate benchmark by account territory</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              State-level industrial average for each account&apos;s utility territory.
            </p>
          </div>
        </CardHeader>
        {benchmarks.length === 0 ? (
          <CardBody>
            <p className="text-sm text-text-dim">
              No account has both a state and a utility recorded yet.
            </p>
          </CardBody>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule bg-bg-raised">
                  {['Utility', 'State', 'Industrial rate', 'YoY', 'Accounts'].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 text-left font-mono text-2xs uppercase tracking-label text-text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr key={`${b.utility}-${b.state}`} className="border-b border-rule-faint last:border-0">
                    <td className="px-3 py-2 font-medium text-text">{b.utility}</td>
                    <td className="px-3 py-2 text-text-dim">{b.state}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-text">
                      {b.rate_usd_kwh !== null ? `$${b.rate_usd_kwh.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <TrendCell value={b.yoy_change_pct} />
                    </td>
                    <td className="px-3 py-2">
                      {b.affected_deals.map((d, i) => (
                        <span key={d.id}>
                          {i > 0 ? ', ' : ''}
                          <Link
                            href={`/app/pipeline/${d.id}`}
                            className="text-text-dim underline decoration-rule underline-offset-2 hover:text-text hover:decoration-accent"
                          >
                            {d.company}
                          </Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CardBody className="border-t border-rule pt-3">
          <p className="text-xs text-text-faint">
            Rates are the EIA state-level industrial average, not the account&apos;s
            actual tariff. Use them to rank territories and time a conversation — never
            quote one as the customer&apos;s rate.
          </p>
        </CardBody>
      </Card>

      {/* ── Full state table ── */}
      <Card>
        <CardHeader>
          <CardTitle>All states</CardTitle>
          <div className="flex gap-1.5">
            {(['rate', 'yoy'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs transition-colors',
                  sortBy === k
                    ? 'bg-bg-overlay font-medium text-text'
                    : 'text-text-dim hover:text-text',
                )}
              >
                {k === 'rate' ? 'By rate' : 'By YoY'}
              </button>
            ))}
          </div>
        </CardHeader>
        <div className="scrollbar-thin max-h-panel-tall overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {sorted.map((r) => {
                const accounts = deals.filter((d) => d.state?.toUpperCase() === r.state);
                return (
                  <tr key={r.state} className="border-b border-rule-faint last:border-0">
                    <td className="w-10 px-3 py-1.5 font-mono text-xs text-text-faint">
                      {r.state}
                    </td>
                    <td className="px-3 py-1.5 text-text-dim">
                      {STATE_CENTROIDS[r.state]?.name ?? r.state}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text">
                      ${r.rate.toFixed(3)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <TrendCell value={r.yoyChangePct} />
                    </td>
                    <td className="w-16 px-3 py-1.5 text-right text-xs">
                      {accounts.length > 0 ? (
                        <span className="text-accent-dim">{accounts.length}</span>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * ⚠️ A SECTION HEADING, NOT A PAGE TITLE. This rendered <PageHeader>, which was
 * right when this panel had its own route — and app/app/pricing-intel/page.tsx
 * is now a bare redirect into the Intelligence tab. The move left the page
 * title behind, so the tab showed two <h1>s: "Intelligence" from the page and
 * this one directly under it.
 *
 * Only visible once the render check visited the tabs. The default tab is
 * Headlines, so eight of the nine had never been loaded.
 */
function Header() {
  return (
    <div>
      <p className="eyebrow">Cost of grid power</p>
      <h2 className="mt-1 font-display text-xl text-text">Pricing Intelligence</h2>
    </div>
  );
}

/**
 * A rising rate is an opportunity in this business, so "up" gets the accent
 * rather than a danger color. Encoding it red would invert the meaning.
 */
function TrendCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-text-faint">—</span>;

  const Icon = value > 0.5 ? ArrowUp : value < -0.5 ? ArrowDown : Minus;
  const tone =
    value > 5 ? 'text-accent-dim font-medium' : value > 0.5 ? 'text-text' : 'text-text-dim';

  return (
    <span className={cn('inline-flex items-center gap-1 font-mono tabular-nums', tone)}>
      <Icon size={11} strokeWidth={2.5} />
      {pct(value)}
    </span>
  );
}
