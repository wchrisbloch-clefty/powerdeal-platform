import { BRAND } from '@/lib/brand';

/**
 * Map layer definitions.
 *
 * Layer colors are literal hex rather than CSS tokens because Leaflet paints
 * to canvas/SVG outside the themed DOM. They are semantic data encodings
 * (gas = amber, CO2 = violet, non-attainment = red), not brand chrome — the
 * one place GLOBAL RULE 2 does not reach.
 *
 * `remote: true` layers load GeoJSON from a third party at request time and
 * are cached 24h server-side. Any of those endpoints can move or go behind a
 * key; a layer that fails to load is disabled in the UI with a reason rather
 * than breaking the map.
 */

export type LayerCategory =
  | 'infrastructure'
  | 'power'
  | 'ccus'
  | 'permitting'
  | 'grid';

export interface MapLayer {
  id: string;
  label: string;
  category: LayerCategory;
  /** Direct GeoJSON URL, or an internal /api/geo route that normalizes one. */
  url?: string;
  color: string;
  weight?: number;
  opacity?: number;
  fillOpacity?: number;
  /** Fetched from a third party (vs. served from our own API). */
  remote?: boolean;
  /** Shown in the layer panel so the reader knows the provenance. */
  note?: string;
  /** Off until the reader turns it on — heavy or slow layers. */
  defaultOff?: boolean;
}

export const MAP_LAYERS: Record<string, MapLayer> = {
  // ── Layer 1: Natural gas infrastructure ──
  ngPipelines: {
    id: 'ng-pipelines',
    label: 'Natural Gas Pipelines',
    category: 'infrastructure',
    url: 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=4000',
    color: '#f59e0b',
    weight: 1.5,
    opacity: 0.7,
    remote: true,
    defaultOff: true,
    note: 'HIFLD / ArcGIS. Large layer — expect a slow first load.',
  },

  // ── Layer 2: Electric utility / RTO territories ──
  utilityTerritories: {
    id: 'utility-territories',
    label: 'Utility Service Territories',
    category: 'power',
    url: 'https://opendata.arcgis.com/datasets/f4cd55044b924fed9bc8b64022966097_0.geojson',
    color: '#3b82f6',
    weight: 1,
    fillOpacity: 0.08,
    remote: true,
    defaultOff: true,
    note: 'HIFLD retail service territories.',
  },
  rtoRegions: {
    id: 'rto-regions',
    label: 'RTO / ISO Regions',
    category: 'power',
    url: '/api/geo/rto-regions',
    color: '#3b82f6',
    weight: 2,
    fillOpacity: 0.05,
    note: 'Approximate RTO footprints, served locally.',
  },

  // ── Layer 3: CO2 infrastructure ──
  co2Pipelines: {
    id: 'co2-pipelines',
    label: 'CO₂ Pipelines',
    category: 'ccus',
    url: '/api/geo/co2-pipelines',
    color: '#8b5cf6',
    weight: 2,
    note: 'NATCARB / NETL. Requires a configured source — see README.',
    defaultOff: true,
  },
  classVIWells: {
    id: 'class-vi-wells',
    label: 'Class VI Wells (EPA)',
    category: 'ccus',
    url: '/api/geo/class-vi',
    color: '#ec4899',
    weight: 1,
    note: 'EPA UIC Class VI permit tracker.',
  },

  // ── Layer 4: Non-attainment (the permitting opportunity map) ──
  nonAttainment: {
    id: 'non-attainment',
    label: 'EPA Non-Attainment Zones',
    category: 'permitting',
    url: '/api/geo/non-attainment',
    color: '#ef4444',
    weight: 1,
    fillOpacity: 0.15,
    note: 'Where combustion permitting is hardest — the combustion-fighter map.',
  },

  // ── Layer 5: Live grid stress ──
  powerOutages: {
    id: 'power-outages',
    label: 'Active Outages (Live)',
    category: 'grid',
    url: '/api/geo/outages',
    color: '#f97316',
    weight: 1,
    note: 'PowerOutage.us. Hidden when no key is configured.',
  },
};

export const LAYER_GROUPS: { category: LayerCategory; label: string }[] = [
  { category: 'infrastructure', label: 'Infrastructure' },
  { category: 'power', label: 'Power' },
  { category: 'ccus', label: 'CCUS' },
  { category: 'permitting', label: 'Permitting' },
  { category: 'grid', label: 'Grid' },
];

export function layersByCategory(category: LayerCategory): MapLayer[] {
  return Object.values(MAP_LAYERS).filter((l) => l.category === category);
}

export function layerById(id: string): MapLayer | undefined {
  return Object.values(MAP_LAYERS).find((l) => l.id === id);
}

/** Bloom green marks pipeline accounts — the one accent on the map. */
export const PIPELINE_MARKER_COLOR = BRAND.accent;

/** Health → marker fill. Mirrors --health-* tokens for canvas rendering. */
export function healthColor(score: number): string {
  if (score >= 8) return '#3CAD3A';
  if (score >= 5) return '#bf8f00';
  return '#c0392b';
}

/** Marker radius scaled by deal size, clamped so 1 MW stays clickable. */
export function markerRadius(sizeMw?: number | null): number {
  if (!sizeMw || sizeMw <= 0) return 7;
  return Math.max(7, Math.min(26, 6 + Math.sqrt(sizeMw) * 2.2));
}

/** Choropleth ramp for the utility-rate overlay: darker = more expensive. */
export function rateColor(usdPerKwh: number | null | undefined): string {
  if (usdPerKwh === null || usdPerKwh === undefined) return '#e5e7eb';
  if (usdPerKwh >= 0.28) return '#4a1d96';
  if (usdPerKwh >= 0.22) return '#6d28d9';
  if (usdPerKwh >= 0.16) return '#8b5cf6';
  if (usdPerKwh >= 0.12) return '#a78bfa';
  if (usdPerKwh >= 0.09) return '#c4b5fd';
  return '#ddd6fe';
}

export const RATE_LEGEND = [
  { label: '≥ $0.28', color: '#4a1d96' },
  { label: '$0.22–0.28', color: '#6d28d9' },
  { label: '$0.16–0.22', color: '#8b5cf6' },
  { label: '$0.12–0.16', color: '#a78bfa' },
  { label: '$0.09–0.12', color: '#c4b5fd' },
  { label: '< $0.09', color: '#ddd6fe' },
];
