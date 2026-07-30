/**
 * Static state centroids. Plotting pipeline accounts needs no geocoding API —
 * deals carry a state, and a state centroid is enough to place a marker.
 * When a deal gains a real site address, swap in precise coordinates.
 */

export interface StatePoint {
  name: string;
  lat: number;
  lng: number;
}

export const STATE_CENTROIDS: Record<string, StatePoint> = {
  AL: { name: 'Alabama', lat: 32.806, lng: -86.791 },
  AK: { name: 'Alaska', lat: 61.37, lng: -152.404 },
  AZ: { name: 'Arizona', lat: 33.729, lng: -111.431 },
  AR: { name: 'Arkansas', lat: 34.97, lng: -92.373 },
  CA: { name: 'California', lat: 36.116, lng: -119.682 },
  CO: { name: 'Colorado', lat: 39.059, lng: -105.311 },
  CT: { name: 'Connecticut', lat: 41.598, lng: -72.755 },
  DE: { name: 'Delaware', lat: 39.319, lng: -75.507 },
  DC: { name: 'District of Columbia', lat: 38.897, lng: -77.026 },
  FL: { name: 'Florida', lat: 27.766, lng: -81.686 },
  GA: { name: 'Georgia', lat: 33.04, lng: -83.643 },
  HI: { name: 'Hawaii', lat: 21.094, lng: -157.498 },
  ID: { name: 'Idaho', lat: 44.24, lng: -114.478 },
  IL: { name: 'Illinois', lat: 40.349, lng: -88.986 },
  IN: { name: 'Indiana', lat: 39.849, lng: -86.258 },
  IA: { name: 'Iowa', lat: 42.011, lng: -93.21 },
  KS: { name: 'Kansas', lat: 38.526, lng: -96.726 },
  KY: { name: 'Kentucky', lat: 37.668, lng: -84.67 },
  LA: { name: 'Louisiana', lat: 31.169, lng: -91.868 },
  ME: { name: 'Maine', lat: 44.693, lng: -69.381 },
  MD: { name: 'Maryland', lat: 39.064, lng: -76.802 },
  MA: { name: 'Massachusetts', lat: 42.23, lng: -71.53 },
  MI: { name: 'Michigan', lat: 43.326, lng: -84.536 },
  MN: { name: 'Minnesota', lat: 45.694, lng: -93.9 },
  MS: { name: 'Mississippi', lat: 32.741, lng: -89.678 },
  MO: { name: 'Missouri', lat: 38.456, lng: -92.288 },
  MT: { name: 'Montana', lat: 46.921, lng: -110.454 },
  NE: { name: 'Nebraska', lat: 41.125, lng: -98.268 },
  NV: { name: 'Nevada', lat: 38.313, lng: -117.055 },
  NH: { name: 'New Hampshire', lat: 43.452, lng: -71.564 },
  NJ: { name: 'New Jersey', lat: 40.298, lng: -74.521 },
  NM: { name: 'New Mexico', lat: 34.841, lng: -106.248 },
  NY: { name: 'New York', lat: 42.166, lng: -74.948 },
  NC: { name: 'North Carolina', lat: 35.63, lng: -79.806 },
  ND: { name: 'North Dakota', lat: 47.529, lng: -99.784 },
  OH: { name: 'Ohio', lat: 40.388, lng: -82.765 },
  OK: { name: 'Oklahoma', lat: 35.565, lng: -96.929 },
  OR: { name: 'Oregon', lat: 44.572, lng: -122.071 },
  PA: { name: 'Pennsylvania', lat: 40.59, lng: -77.209 },
  RI: { name: 'Rhode Island', lat: 41.68, lng: -71.512 },
  SC: { name: 'South Carolina', lat: 33.856, lng: -80.945 },
  SD: { name: 'South Dakota', lat: 44.299, lng: -99.438 },
  TN: { name: 'Tennessee', lat: 35.747, lng: -86.692 },
  TX: { name: 'Texas', lat: 31.055, lng: -97.563 },
  UT: { name: 'Utah', lat: 40.15, lng: -111.862 },
  VT: { name: 'Vermont', lat: 44.045, lng: -72.71 },
  VA: { name: 'Virginia', lat: 37.769, lng: -78.17 },
  WA: { name: 'Washington', lat: 47.4, lng: -121.49 },
  WV: { name: 'West Virginia', lat: 38.491, lng: -80.954 },
  WI: { name: 'Wisconsin', lat: 44.268, lng: -89.616 },
  WY: { name: 'Wyoming', lat: 42.756, lng: -107.302 },
};

export function centroidFor(state?: string | null): StatePoint | null {
  if (!state) return null;
  return STATE_CENTROIDS[state.trim().toUpperCase()] ?? null;
}

/**
 * Spread co-located markers around their shared centroid so multiple accounts
 * in one state don't stack into a single unclickable pin.
 */
export function jitter(
  point: StatePoint,
  index: number,
  total: number,
): { lat: number; lng: number } {
  if (total <= 1) return { lat: point.lat, lng: point.lng };
  const radius = 0.55;
  const angle = (2 * Math.PI * index) / total;
  return {
    lat: point.lat + radius * Math.sin(angle),
    lng: point.lng + radius * Math.cos(angle),
  };
}

export const STATE_CODES = Object.keys(STATE_CENTROIDS);
