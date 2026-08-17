'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Deal } from '@/lib/types';
import { MAP_LAYERS, healthColor, markerRadius, rateColor } from '@/lib/geo/layers';
import { centroidFor, jitter } from '@/lib/geo/states';
import { formatMw } from '@/lib/utils';
import type { RateWithTrend } from '@/lib/geo/eia-api';

/**
 * Leaflet wrapper. Loaded via next/dynamic with ssr:false — Leaflet touches
 * `window` at import time and cannot render on the server.
 */

export interface MapViewProps {
  deals: Deal[];
  activeLayers: string[];
  showPipeline: boolean;
  showHeatMap: boolean;
  showPricing: boolean;
  rates: RateWithTrend[];
  onLayerError: (layerId: string, message: string) => void;
}

export default function MapView({
  deals,
  activeLayers,
  showPipeline,
  showHeatMap,
  showPricing,
  rates,
  onLayerError,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<Map<string, L.Layer>>(new Map());
  const pipelineRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // ── Init ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [38.5, -96],
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // CARTO basemaps are free for this volume and stay visually quiet, so the
    // data layers and pipeline markers carry the attention.
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    mapRef.current = map;
    setReady(true);

    // Capture the ref's current value: by cleanup time `overlaysRef.current`
    // may point at a different Map instance.
    const overlays = overlaysRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      overlays.clear();
    };
  }, []);

  // ── Data layers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove layers that were turned off.
    for (const [id, layer] of overlaysRef.current) {
      if (!activeLayers.includes(id)) {
        map.removeLayer(layer);
        overlaysRef.current.delete(id);
      }
    }

    let cancelled = false;

    for (const id of activeLayers) {
      if (overlaysRef.current.has(id)) continue;

      const def = Object.values(MAP_LAYERS).find((l) => l.id === id);
      if (!def?.url) continue;

      // Placeholder so a slow fetch doesn't queue duplicate requests.
      const group = L.layerGroup().addTo(map);
      overlaysRef.current.set(id, group);

      fetch(def.url)
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json();
        })
        .then((geojson: GeoJSON.GeoJsonObject) => {
          if (cancelled || !mapRef.current) return;
          const layer = L.geoJSON(geojson, {
            style: {
              color: def.color,
              weight: def.weight ?? 1,
              opacity: def.opacity ?? 0.8,
              fillOpacity: def.fillOpacity ?? 0,
            },
            pointToLayer: (_f, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: def.color,
                fillColor: def.color,
                fillOpacity: 0.65,
                weight: 1,
              }),
            onEachFeature: (feature, lyr) => {
              const props = feature.properties as Record<string, unknown> | null;
              if (!props) return;
              const html = Object.entries(props)
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .slice(0, 8)
                .map(
                  ([k, v]) =>
                    `<div style="font-size:11px"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`,
                )
                .join('');
              if (html) lyr.bindPopup(html);
            },
          });
          group.addLayer(layer);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          onLayerError(id, err.message);
          const stale = overlaysRef.current.get(id);
          if (stale && mapRef.current) {
            mapRef.current.removeLayer(stale);
            overlaysRef.current.delete(id);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [activeLayers, ready, onLayerError]);

  // ── Pipeline markers, heat map, pricing overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    pipelineRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    pipelineRef.current = group;

    // Pricing choropleth: one translucent disc per state, sized generously so
    // it reads as a region rather than a point. A real choropleth needs state
    // polygons; this communicates the same ranking without a 2 MB payload.
    if (showPricing) {
      for (const rate of rates) {
        const point = centroidFor(rate.state);
        if (!point) continue;
        L.circleMarker([point.lat, point.lng], {
          radius: 26,
          color: 'transparent',
          fillColor: rateColor(rate.rate),
          fillOpacity: 0.45,
          interactive: true,
        })
          .bindPopup(
            `<div style="font-size:12px">
               <strong>${escapeHtml(point.name)}</strong><br/>
               Industrial rate: $${rate.rate.toFixed(3)}/kWh<br/>
               ${
                 rate.yoyChangePct !== null
                   ? `YoY: ${rate.yoyChangePct > 0 ? '+' : ''}${rate.yoyChangePct.toFixed(1)}%<br/>`
                   : ''
               }
               ${escapeHtml(
                 deals
                   .filter((d) => d.state === rate.state)
                   .map((d) => d.company)
                   .join(', ') || 'No accounts in this state',
               )}
             </div>`,
          )
          .addTo(group);
      }
    }

    // Heat map: average deal health per state.
    if (showHeatMap) {
      const byState = new Map<string, Deal[]>();
      for (const d of deals) {
        if (!d.state) continue;
        byState.set(d.state, [...(byState.get(d.state) ?? []), d]);
      }
      for (const [state, group_] of byState) {
        const point = centroidFor(state);
        if (!point) continue;
        const avg = group_.reduce((s, d) => s + d.health_score, 0) / group_.length;
        const mw = group_.reduce((s, d) => s + (d.size_mw ?? 0), 0);
        L.circleMarker([point.lat, point.lng], {
          radius: Math.max(16, Math.min(44, 14 + Math.sqrt(mw || group_.length * 4) * 2)),
          color: 'transparent',
          fillColor: healthColor(avg),
          fillOpacity: 0.3,
        })
          .bindPopup(
            `<div style="font-size:12px">
               <strong>${escapeHtml(point.name)}</strong><br/>
               ${group_.length} account${group_.length === 1 ? '' : 's'}<br/>
               Avg health: ${avg.toFixed(1)}<br/>
               ${mw > 0 ? `${formatMw(mw)} total` : 'No MW recorded'}
             </div>`,
          )
          .addTo(group);
      }
    }

    // Pipeline account markers — the one Bloom-green element on the map.
    if (showPipeline) {
      const byState = new Map<string, Deal[]>();
      for (const d of deals) {
        if (!d.state) continue;
        byState.set(d.state, [...(byState.get(d.state) ?? []), d]);
      }

      for (const [state, stateDeals] of byState) {
        const point = centroidFor(state);
        if (!point) continue;

        stateDeals.forEach((deal, i) => {
          // Spread co-located accounts so they stay individually clickable.
          const pos = jitter(point, i, stateDeals.length);
          L.circleMarker([pos.lat, pos.lng], {
            radius: markerRadius(deal.size_mw),
            color: healthColor(deal.health_score),
            fillColor: healthColor(deal.health_score),
            fillOpacity: 0.75,
            weight: 2,
          })
            .bindPopup(
              /**
               * ⚠️ TWO DEFECTS IN THE LINK, IN ONE ATTRIBUTE.
               *
               * It read `style="color:#3CAD3A"` — the only raw hex left in any
               * component, invisible to the token system because it is inside
               * a string Leaflet injects rather than a className Tailwind
               * compiles. And the value it hardcoded was the brand green as
               * TEXT, at 2.90:1 on the popup's paper — under AA, and the same
               * measurement that took the nav marker off `--color-accent`.
               *
               * `--color-accent-dim` is 4.98:1 and follows the theme, which a
               * literal cannot: this popup rendered light-theme green over a
               * dark-theme map.
               */
              `<div style="font-size:var(--text-xs);min-width:180px">
                 <strong>${escapeHtml(deal.company)}</strong><br/>
                 <span style="color:var(--color-text-dim)">${escapeHtml(deal.deal_id)} · ${escapeHtml(deal.stage)}</span><br/>
                 Health: ${deal.health_score.toFixed(1)} / 10<br/>
                 ${deal.utility ? `Utility: ${escapeHtml(deal.utility)}<br/>` : ''}
                 ${deal.size_mw ? `${formatMw(deal.size_mw)}<br/>` : ''}
                 ${deal.next_move ? `<em>${escapeHtml(deal.next_move)}</em><br/>` : ''}
                 <a href="/app/pipeline/${deal.id}" style="color:var(--color-accent-dim)">Open deal →</a>
               </div>`,
            )
            .addTo(group);
        });
      }
    }

    return () => {
      group.remove();
    };
  }, [deals, showPipeline, showHeatMap, showPricing, rates, ready]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-card"
      style={{ background: 'var(--color-bg-raised)' }}
      role="application"
      aria-label="Infrastructure map"
    />
  );
}

/** Popups are built as HTML strings; every interpolated value must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
