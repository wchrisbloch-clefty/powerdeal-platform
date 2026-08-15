import 'server-only';
import { ownerSelect } from './supabase/admin';
import { explainFailure, keyShape } from './supabase/diagnose';
import { SEED_DEALS, SEED_FEED_ITEMS } from './seed-data';
import type {
  Deal, FeedItem, Signal, MarketWatchEntry, CcusEvent,
  StageTransition, UserSettings,
} from './types';

/**
 * Server-side data access.
 *
 * Every reader returns real rows when Supabase is configured and falls back to
 * seed data otherwise. Pages never branch on "is Supabase configured" — they
 * just render what they get, plus the `isSeed` flag so the UI can be honest
 * about it.
 *
 * Reads go through ownerSelect() from ./supabase/admin, which uses the
 * service role and applies `.eq('user_id', POWERDEAL_USER_ID)` itself. There
 * is no signed-in user to derive scope from since sign-in was removed, and
 * the service role bypasses RLS — so that scope is this layer's job, not the
 * database's. See the header of ./supabase/admin for why it is centralised.
 *
 * This file is `server-only`. None of it can reach a client bundle.
 */

/**
 * Turn a raw supabase-js message into one that names the client, the key
 * scheme and the fix. "JWT issued at future" is a symptom; this says where.
 */
function describeReadFailure(message: string): string {
  return explainFailure({
    client: 'service-role',
    message,
    key: keyShape(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}

export interface DataResult<T> {
  data: T;
  /** True when this came from the local seed rather than the database. */
  isSeed: boolean;
  /**
   * ⚠️ SET WHEN THE READ FAILED, AS OPPOSED TO NOT BEING CONFIGURED.
   *
   * Both fall back to seed data and both set `isSeed`, and for a long time the
   * Dashboard printed the same sentence for both: "Showing template data.
   * Connect Supabase to load your real pipeline." That instruction is correct
   * for an unconfigured deployment and WRONG for a configured one whose key is
   * being rejected — it sends the reader to connect something already
   * connected.
   *
   * It is also nearly invisible, because SEED_DEALS has exactly 21 deals and
   * so does the live pipeline. A rejected key renders 21 plausible rows under
   * a banner that reads like setup advice.
   *
   * Null means "seed because nothing is configured", which is a deployment
   * state. A string means "seed because the database refused us", which is an
   * outage, and it carries the diagnosis — which client, which key scheme, and
   * the actual fix.
   */
  readError: string | null;
}

export async function getDeals(): Promise<DataResult<Deal[]>> {
  const query = ownerSelect('deals');
  if (!query) return { data: SEED_DEALS, isSeed: true, readError: null };

  const { data, error } = await query
    .neq('stage', 'Archived')
    .order('health_score', { ascending: true });

  if (error) {
    // NOT the same as unconfigured. Named, with the diagnosis attached.
    const why = describeReadFailure(error.message);
    console.warn('[data] getDeals failed:', why);
    return { data: SEED_DEALS, isSeed: true, readError: why };
  }

  // An empty table on a signed-in account means the seed hasn't run yet.
  if (!data || data.length === 0) return { data: SEED_DEALS, isSeed: true, readError: null };
  return { data: data as Deal[], isSeed: false, readError: null };
}

export async function getDeal(id: string): Promise<DataResult<Deal | null>> {
  const query = ownerSelect('deals');
  if (!query) {
    return { data: SEED_DEALS.find((d) => d.id === id) ?? null, isSeed: true, readError: null };
  }

  const { data, error } = await query.eq('id', id).maybeSingle();

  if (error || !data) {
    const seeded = SEED_DEALS.find((d) => d.id === id) ?? null;
    // A missing row and a refused query are different states. Only the second
    // carries a readError; `!data` alone means the deal genuinely is not there.
    return {
      data: seeded,
      isSeed: seeded !== null,
      readError: error ? describeReadFailure(error.message) : null,
    };
  }
  return { data: data as Deal, isSeed: false, readError: null };
}

export async function getSignalsForDeal(dealId: string): Promise<Signal[]> {
  const query = ownerSelect('intelligence_log');
  if (!query) return [];

  const { data } = await query
    .contains('deal_ids', [dealId])
    .order('logged_at', { ascending: false })
    .limit(50);

  return (data ?? []) as Signal[];
}

export async function getRecentSignals(limit = 50): Promise<Signal[]> {
  const query = ownerSelect('intelligence_log');
  if (!query) return [];

  const { data } = await query
    .order('logged_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as Signal[];
}

export async function getMarketWatchForDeal(dealId: string): Promise<MarketWatchEntry[]> {
  const query = ownerSelect('market_watch_log');
  if (!query) return [];

  const { data } = await query
    .contains('deal_ids', [dealId])
    .order('swept_at', { ascending: false })
    .limit(30);

  return (data ?? []) as MarketWatchEntry[];
}

export async function getMarketWatch(limit = 40): Promise<MarketWatchEntry[]> {
  const query = ownerSelect('market_watch_log');
  if (!query) return [];

  const { data } = await query
    .order('impact_rank', { ascending: false })
    .order('swept_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as MarketWatchEntry[];
}

export async function getStageTransitions(dealId: string): Promise<StageTransition[]> {
  const query = ownerSelect('stage_transitions');
  if (!query) return [];

  const { data } = await query
    .eq('deal_id', dealId)
    .order('transitioned_at', { ascending: false });

  return (data ?? []) as StageTransition[];
}

export interface FeedQuery {
  category?: string | null;
  limit?: number;
  offset?: number;
  since?: string | null;
}

export async function getFeedItems(q: FeedQuery = {}): Promise<DataResult<FeedItem[]>> {
  const base = ownerSelect('feed_items');
  if (!base) return { data: SEED_FEED_ITEMS, isSeed: true, readError: null };

  const limit = q.limit ?? 20;
  let query = base
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(q.offset ?? 0, (q.offset ?? 0) + limit - 1);

  if (q.category && q.category !== 'all') query = query.eq('category', q.category);
  if (q.since) query = query.gte('published_at', q.since);

  const { data, error } = await query;
  if (error) {
    console.warn('[data] getFeedItems failed:', error.message);
    return { data: SEED_FEED_ITEMS, isSeed: true, readError: null };
  }
  if (!data || data.length === 0) return { data: SEED_FEED_ITEMS, isSeed: true, readError: null };
  return { data: data as FeedItem[], isSeed: false, readError: null };
}

export async function getCcusEvents(limit = 40): Promise<DataResult<CcusEvent[]>> {
  const query = ownerSelect('ccus_events');
  if (!query) return { data: [], isSeed: true, readError: null };

  const { data } = await query
    .order('event_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  return { data: (data ?? []) as CcusEvent[], isSeed: false, readError: null };
}

export async function getUserSettings(): Promise<UserSettings | null> {
  // ownerSelect already filters user_id — no second .eq needed here.
  const query = ownerSelect('user_settings');
  if (!query) return null;

  const { data } = await query.maybeSingle();

  return (data as UserSettings) ?? null;
}

export async function getAppState<T = unknown>(key: string): Promise<T | null> {
  const query = ownerSelect('app_state', 'value');
  if (!query) return null;

  const { data } = await query.eq('key', key).maybeSingle();

  return (data?.value as T) ?? null;
}

/**
 * Feed rows by url_hash — how the Research tab pulls an ingested run's items
 * back out. Ingested items ARE feed items: same table, same grading, same
 * card. Only the run metadata lives apart.
 */
export async function getFeedItemsByKeys(
  keys: string[],
): Promise<Record<string, FeedItem>> {
  if (keys.length === 0) return {};
  const query = ownerSelect('feed_items');
  if (!query) return {};

  const { data } = await query.in('url_hash', keys.slice(0, 500));
  const out: Record<string, FeedItem> = {};
  for (const row of (data ?? []) as FeedItem[]) {
    if (row.url_hash) out[row.url_hash] = row;
  }
  return out;
}
