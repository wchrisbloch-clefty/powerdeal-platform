import 'server-only';
import { getAuthedClient } from './supabase/server';
import { SEED_DEALS, SEED_FEED_ITEMS } from './seed-data';
import type {
  Deal, FeedItem, Signal, MarketWatchEntry, CcusEvent,
  StageTransition, UserSettings,
} from './types';

/**
 * Server-side data access.
 *
 * Every reader returns real rows when Supabase is configured and the user is
 * signed in, and falls back to seed data otherwise. Pages never branch on
 * "is Supabase configured" — they just render what they get, plus the
 * `isSeed` flag so the UI can be honest about it.
 */

export interface DataResult<T> {
  data: T;
  /** True when this came from the local seed rather than the database. */
  isSeed: boolean;
}

export async function getDeals(): Promise<DataResult<Deal[]>> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return { data: SEED_DEALS, isSeed: true };

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .neq('stage', 'Archived')
    .order('health_score', { ascending: true });

  if (error) {
    console.warn('[data] getDeals failed:', error.message);
    return { data: SEED_DEALS, isSeed: true };
  }

  // An empty table on a signed-in account means the seed hasn't run yet.
  if (!data || data.length === 0) return { data: SEED_DEALS, isSeed: true };
  return { data: data as Deal[], isSeed: false };
}

export async function getDeal(id: string): Promise<DataResult<Deal | null>> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) {
    return { data: SEED_DEALS.find((d) => d.id === id) ?? null, isSeed: true };
  }

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    const seeded = SEED_DEALS.find((d) => d.id === id) ?? null;
    return { data: seeded, isSeed: seeded !== null };
  }
  return { data: data as Deal, isSeed: false };
}

export async function getSignalsForDeal(dealId: string): Promise<Signal[]> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return [];

  const { data } = await supabase
    .from('intelligence_log')
    .select('*')
    .contains('deal_ids', [dealId])
    .order('logged_at', { ascending: false })
    .limit(50);

  return (data ?? []) as Signal[];
}

export async function getRecentSignals(limit = 50): Promise<Signal[]> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return [];

  const { data } = await supabase
    .from('intelligence_log')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as Signal[];
}

export async function getMarketWatchForDeal(dealId: string): Promise<MarketWatchEntry[]> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return [];

  const { data } = await supabase
    .from('market_watch_log')
    .select('*')
    .contains('deal_ids', [dealId])
    .order('swept_at', { ascending: false })
    .limit(30);

  return (data ?? []) as MarketWatchEntry[];
}

export async function getMarketWatch(limit = 40): Promise<MarketWatchEntry[]> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return [];

  const { data } = await supabase
    .from('market_watch_log')
    .select('*')
    .order('impact_rank', { ascending: false })
    .order('swept_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as MarketWatchEntry[];
}

export async function getStageTransitions(dealId: string): Promise<StageTransition[]> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return [];

  const { data } = await supabase
    .from('stage_transitions')
    .select('*')
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
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return { data: SEED_FEED_ITEMS, isSeed: true };

  const limit = q.limit ?? 20;
  let query = supabase
    .from('feed_items')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(q.offset ?? 0, (q.offset ?? 0) + limit - 1);

  if (q.category && q.category !== 'all') query = query.eq('category', q.category);
  if (q.since) query = query.gte('published_at', q.since);

  const { data, error } = await query;
  if (error) {
    console.warn('[data] getFeedItems failed:', error.message);
    return { data: SEED_FEED_ITEMS, isSeed: true };
  }
  if (!data || data.length === 0) return { data: SEED_FEED_ITEMS, isSeed: true };
  return { data: data as FeedItem[], isSeed: false };
}

export async function getCcusEvents(limit = 40): Promise<DataResult<CcusEvent[]>> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return { data: [], isSeed: true };

  const { data } = await supabase
    .from('ccus_events')
    .select('*')
    .order('event_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  return { data: (data ?? []) as CcusEvent[], isSeed: false };
}

export async function getUserSettings(): Promise<UserSettings | null> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return null;

  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return (data as UserSettings) ?? null;
}

export async function getAppState<T = unknown>(key: string): Promise<T | null> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) return null;

  const { data } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  return (data?.value as T) ?? null;
}
