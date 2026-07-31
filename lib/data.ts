import 'server-only';
import { ownerSelect } from './supabase/admin';
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

export interface DataResult<T> {
  data: T;
  /** True when this came from the local seed rather than the database. */
  isSeed: boolean;
}

export async function getDeals(): Promise<DataResult<Deal[]>> {
  const query = ownerSelect('deals');
  if (!query) return { data: SEED_DEALS, isSeed: true };

  const { data, error } = await query
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
  const query = ownerSelect('deals');
  if (!query) {
    return { data: SEED_DEALS.find((d) => d.id === id) ?? null, isSeed: true };
  }

  const { data, error } = await query.eq('id', id).maybeSingle();

  if (error || !data) {
    const seeded = SEED_DEALS.find((d) => d.id === id) ?? null;
    return { data: seeded, isSeed: seeded !== null };
  }
  return { data: data as Deal, isSeed: false };
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
  if (!base) return { data: SEED_FEED_ITEMS, isSeed: true };

  const limit = q.limit ?? 20;
  let query = base
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
  const query = ownerSelect('ccus_events');
  if (!query) return { data: [], isSeed: true };

  const { data } = await query
    .order('event_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  return { data: (data ?? []) as CcusEvent[], isSeed: false };
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
