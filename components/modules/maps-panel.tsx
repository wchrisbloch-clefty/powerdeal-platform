'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Layers, X } from 'lucide-react';
import type { Deal } from '@/lib/types';
import type { RateWithTrend } from '@/lib/geo/eia-api';
import { MAP_LAYERS, LAYER_GROUPS, RATE_LEGEND, layersByCategory } from '@/lib/geo/layers';
import { VERTICALS } from '@/lib/types';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import PageHeader from '@/components/chrome/page-header';

// Leaflet reads `window` at import time — never server-render it.
const MapView = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-card bg-bg-raised">
      <p className="text-sm text-text-dim">Loading map…</p>
    </div>
  ),
});

export default function MapsPanel({
  deals,
  rates,
  outagesAvailable,
}: {
  deals: Deal[];
  rates: RateWithTrend[];
  outagesAvailable: boolean;
}) {
  const [activeLayers, setActiveLayers] = useState<string[]>([
    MAP_LAYERS.nonAttainment.id,
  ]);
  const [showPipeline, setShowPipeline] = useState(true);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [vertical, setVertical] = useState('all');
  const [minHealth, setMinHealth] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layerErrors, setLayerErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(
    () =>
      deals.filter(
        (d) =>
          (vertical === 'all' || d.vertical === vertical) &&
          d.health_score >= minHealth,
      ),
    [deals, vertical, minHealth],
  );

  const onLayerError = useCallback((layerId: string, message: string) => {
    setLayerErrors((prev) => ({ ...prev, [layerId]: message }));
    setActiveLayers((prev) => prev.filter((id) => id !== layerId));
  }, []);

  function toggleLayer(id: string) {
    setLayerErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveLayers((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Infrastructure" title="Maps"
        action={
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            onClick={() => setPanelOpen(true)}
          >
            <Layers size={14} /> Layers
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[236px_1fr]">
        {/* ── Controls: sidebar on desktop, bottom sheet on mobile ── */}
        <aside
          className={cn(
            'space-y-4',
            'md:block',
            panelOpen
              ? 'fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-card border border-rule bg-bg p-4'
              : 'hidden',
          )}
        >
          {panelOpen && (
            <div className="flex items-center justify-between md:hidden">
              <p className="font-display text-base text-text">Layers</p>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-text-dim hover:bg-bg-raised"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <Section title="Overlays">
            <Toggle label="My pipeline" checked={showPipeline} onChange={setShowPipeline} />
            <Toggle
              label="Heat map"
              hint="Average deal health by state"
              checked={showHeatMap}
              onChange={setShowHeatMap}
            />
            <Toggle
              label="Pricing"
              hint={
                rates.length > 0
                  ? 'Industrial rate by state'
                  : 'Needs EIA_API_KEY'
              }
              checked={showPricing}
              onChange={setShowPricing}
              disabled={rates.length === 0}
            />
          </Section>

          {LAYER_GROUPS.map((grp) => {
            const layers = layersByCategory(grp.category).filter(
              // Hide the outage layer entirely when unconfigured — a toggle
              // that can only ever show nothing is worse than no toggle.
              (l) => l.id !== MAP_LAYERS.powerOutages.id || outagesAvailable,
            );
            if (layers.length === 0) return null;

            return (
              <Section key={grp.category} title={grp.label}>
                {layers.map((layer) => (
                  <div key={layer.id}>
                    <Toggle
                      label={layer.label}
                      hint={layer.note}
                      checked={activeLayers.includes(layer.id)}
                      onChange={() => toggleLayer(layer.id)}
                      swatch={layer.color}
                    />
                    {layerErrors[layer.id] ? (
                      <p className="ml-6 mt-0.5 text-2xs text-danger">
                        Failed to load: {layerErrors[layer.id]}
                      </p>
                    ) : null}
                  </div>
                ))}
              </Section>
            );
          })}

          <Section title="Filter">
            <label className="block">
              <span className="eyebrow mb-1 block">Vertical</span>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="h-tap xl:h-8 w-full rounded-md border border-rule bg-bg-raised px-2 text-xs text-text-dim"
              >
                <option value="all">All verticals</option>
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>

            <label className="mt-2.5 block">
              <span className="eyebrow mb-1 block">Min health: {minHealth}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={minHealth}
                onChange={(e) => setMinHealth(Number(e.target.value))}
                className="h-tap w-full accent-[color:var(--color-accent-mark)] lg:h-6"
              />
            </label>

            <p className="mt-2 text-2xs text-text-faint">
              {filtered.length} of {deals.length} accounts shown
            </p>
          </Section>

          {showPricing && rates.length > 0 && (
            <Section title="Rate legend">
              <ul className="space-y-1">
                {RATE_LEGEND.map((l) => (
                  <li key={l.label} className="flex items-center gap-2 text-2xs text-text-dim">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: l.color }}
                    />
                    {l.label}/kWh
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-2xs text-text-faint">
                Darker = more expensive = stronger grid-fighter case.
              </p>
            </Section>
          )}
        </aside>

        {/* ── Map ── */}
        <div className="h-[62vh] overflow-hidden rounded-card border border-rule md:h-[76vh]">
          <MapView
            deals={filtered}
            activeLayers={activeLayers}
            showPipeline={showPipeline}
            showHeatMap={showHeatMap}
            showPricing={showPricing}
            rates={rates}
            onLayerError={onLayerError}
          />
        </div>
      </div>

      <p className="text-xs text-text-faint">
        Accounts are plotted at their state centroid, not their site address —
        markers indicate territory, not a location.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-rule bg-bg-raised p-3">
      <p className="eyebrow mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  swatch,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  swatch?: string;
}) {
  return (
    <label
      title={hint}
      className={cn(
        // The tap target is this LABEL, not the 20px box inside it — clicking
        // anywhere here toggles. Below lg it has to clear the 44px floor.
        'flex min-h-tap cursor-pointer items-start gap-2 text-xs lg:min-h-0',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--color-accent-mark)] xl:h-3.5 xl:w-3.5"
      />
      {swatch ? (
        <span
          aria-hidden
          className="mt-1 h-2 w-2 shrink-0 rounded-sm"
          style={{ background: swatch }}
        />
      ) : null}
      <span className="text-text-dim">{label}</span>
    </label>
  );
}
