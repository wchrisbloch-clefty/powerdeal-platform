import { powerdeal } from './verticals/powerdeal';
import type { SourceConfig, VerticalConfig, ModuleId } from './verticals/types';
import type { SourcePrefs } from './types';
import { relayConfig, relayUsable } from './engine/feed-relay';

/**
 * Vertical registry. Adding a vertical is one import + one entry here — every
 * component reads through getActiveVertical() and adapts automatically.
 */
const REGISTRY: Record<string, VerticalConfig> = {
  powerdeal,
};

export const DEFAULT_VERTICAL_ID = 'powerdeal';

export function getVertical(id: string): VerticalConfig {
  return REGISTRY[id] ?? powerdeal;
}

/**
 * The active vertical for this deployment. Single-vertical today; when
 * multi-vertical lands this reads user_settings.vertical_id instead.
 */
export function getActiveVertical(): VerticalConfig {
  const fromEnv = process.env.NEXT_PUBLIC_VERTICAL_ID;
  return getVertical(fromEnv ?? DEFAULT_VERTICAL_ID);
}

export function listVerticals(): VerticalConfig[] {
  return Object.values(REGISTRY);
}

export function hasModule(vertical: VerticalConfig, moduleId: ModuleId): boolean {
  return vertical.modules.includes(moduleId);
}

export function categoryLabel(vertical: VerticalConfig, id: string | null): string {
  if (!id) return 'Uncategorized';
  return vertical.categories.find((c) => c.id === id)?.label ?? id;
}

/**
 * Resolve the effective source list for a reader.
 *
 * Core sources are on unless explicitly muted. Discovery sources are off unless
 * explicitly enabled — they exist to find coverage gaps, not to fill the feed.
 * Custom user sources always append at the end.
 */
export function resolveSources(
  vertical: VerticalConfig,
  prefs?: Partial<SourcePrefs> | null,
): SourceConfig[] {
  const muted = new Set(prefs?.muted ?? []);
  const enabled = new Set(prefs?.enabled ?? []);

  // `blocked` sources are listed in the Sources tab so the gap is legible, but
  // never fetched — polling a known 403 every sweep just adds latency and log
  // noise to a hole we already understand.
  //
  // UNLESS A RELAY IS CONFIGURED. thundersaidenergy.com blocks Vercel's IP
  // ranges, not this platform; a Worker on an address it does not block can
  // reach it. When FEED_RELAY_URL and FEED_RELAY_TOKEN are BOTH set, blocked
  // sources come back into the fetch list and route through it. Half
  // configured is treated as not configured — see lib/engine/feed-relay.ts,
  // where an unauthenticated URL-taking endpoint is an open proxy.
  const relayOn = relayUsable(relayConfig());
  const core = vertical.sources.filter(
    (s) => !muted.has(s.id) && (relayOn || s.status !== 'blocked'),
  );
  const discovery = vertical.discovery.filter(
    (s) => enabled.has(s.id) || s.enabledByDefault === true,
  );

  const custom: SourceConfig[] = (prefs?.custom ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    platform: 'rss' as const,
    url: c.url,
    defaultTier: c.defaultTier,
    category: c.category,
    role: 'core' as const,
    rationale: 'User-added source.',
  }));

  const all = [...core, ...discovery, ...custom];

  const order = prefs?.order ?? [];
  if (order.length === 0) return all;

  // Explicitly ordered sources first, in the reader's order; the rest follow.
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...all].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

/** Discovery sources only — the coverage-gap net. */
export function discoverySources(vertical: VerticalConfig): SourceConfig[] {
  return vertical.discovery;
}
