import 'server-only';
import { ownerSelect } from './supabase/admin';
import { explainFailure, keyShape } from './supabase/diagnose';
import { SEED_DEALS } from './seed-data';
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

/**
 * ⚠️ THE COLLECTION READERS RETURN DataResult, NOT A BARE ARRAY, AND THAT IS
 * THE WHOLE POINT OF THIS BLOCK.
 *
 * All five used to be written like this:
 *
 *   const { data } = await query...;
 *   return (data ?? []) as Signal[];
 *
 * `error` was never destructured, so a REJECTED query was indistinguishable
 * from an empty table. supabase-js resolves with `{ data: null, error }` rather
 * than throwing, so nothing anywhere noticed. The surface then rendered its
 * designed empty state — "No signals logged yet", "Nothing persisted yet" —
 * which is a sentence ABOUT THE OPERATOR'S DILIGENCE, asserted on the strength
 * of a query that never ran. That is worse than a blank screen: it is the
 * platform inventing a fact about its own user.
 *
 * `emptyOr` forces the error into the return value. What a surface does with it
 * is the surface's judgement; whether it gets to SEE it is not negotiable, and
 * tests/data-read-failures.test.ts asserts every one of these destructures it.
 */
async function emptyOr<T>(query: unknown, label: string): Promise<DataResult<T[]>> {
  const { data, error } = (await query) as { data: unknown; error: { message: string } | null };
  if (error) {
    const why = describeReadFailure(error.message);
    console.warn(`[data] ${label} failed:`, why);
    // isSeed stays FALSE: nothing was substituted. This is an outage, and the
    // empty array is the absence of an answer rather than an answer of zero.
    return { data: [], isSeed: false, readError: why };
  }
  return { data: (data ?? []) as T[], isSeed: false, readError: null };
}

export async function getSignalsForDeal(dealId: string): Promise<DataResult<Signal[]>> {
  const query = ownerSelect('intelligence_log');
  if (!query) return { data: [], isSeed: true, readError: null };

  return emptyOr<Signal>(
    query
      .contains('deal_ids', [dealId])
      .order('logged_at', { ascending: false })
      .limit(50),
    'getSignalsForDeal',
  );
}

export async function getRecentSignals(limit = 50): Promise<DataResult<Signal[]>> {
  const query = ownerSelect('intelligence_log');
  if (!query) return { data: [], isSeed: true, readError: null };

  return emptyOr<Signal>(
    query.order('logged_at', { ascending: false }).limit(limit),
    'getRecentSignals',
  );
}

export async function getMarketWatchForDeal(dealId: string): Promise<DataResult<MarketWatchEntry[]>> {
  const query = ownerSelect('market_watch_log');
  if (!query) return { data: [], isSeed: true, readError: null };

  return emptyOr<MarketWatchEntry>(
    query
      .contains('deal_ids', [dealId])
      .order('swept_at', { ascending: false })
      .limit(30),
    'getMarketWatchForDeal',
  );
}

export async function getMarketWatch(limit = 40): Promise<DataResult<MarketWatchEntry[]>> {
  const query = ownerSelect('market_watch_log');
  if (!query) return { data: [], isSeed: true, readError: null };

  return emptyOr<MarketWatchEntry>(
    query
      .order('impact_rank', { ascending: false })
      .order('swept_at', { ascending: false })
      .limit(limit),
    'getMarketWatch',
  );
}

export async function getStageTransitions(dealId: string): Promise<DataResult<StageTransition[]>> {
  const query = ownerSelect('stage_transitions');
  if (!query) return { data: [], isSeed: true, readError: null };

  return emptyOr<StageTransition>(
    query.eq('deal_id', dealId).order('transitioned_at', { ascending: false }),
    'getStageTransitions',
  );
}

/**
 * ── getFeedItems AND FeedQuery WERE DELETED HERE ──
 *
 * The audit that found the bug found no callers for it. It read feed_items
 * from the database, fell back to SEED_FEED_ITEMS on failure, and reported
 * `readError: null` while doing it — the same defect getDeals was fixed for.
 * Nothing rendered it. Intelligence › Feed goes through getLiveFeed, which
 * fetches RSS directly and has its own seed fallback; the entity page reads
 * that same live feed; /api/feed builds its own query.
 *
 * Fixing it would have produced a correct diagnosis that no surface could
 * ever show, which is the same category as the nine dead --sp-* tokens and
 * the dead border-color class group: a declaration that alters no behaviour.
 * Deleted instead. If a caller ever needs it back, it comes back with the
 * error carried, because emptyOr and getDeals are both right there.
 */

export async function getCcusEvents(limit = 40): Promise<DataResult<CcusEvent[]>> {
  const query = ownerSelect('ccus_events');
  if (!query) return { data: [], isSeed: true, readError: null };

  // Was `const { data } = await query` returning `isSeed: false, readError: null`
  // — a rejected read asserting "this IS your real data, and there is none of
  // it." The most confident of the three failure shapes and the least true.
  return emptyOr<CcusEvent>(
    query.order('event_date', { ascending: false, nullsFirst: false }).limit(limit),
    'getCcusEvents',
  );
}

/**
 * ── THE THREE THAT KEEP THEIR SIGNATURE, AND WHY ──
 *
 * These return null / null / {} rather than DataResult. Not an oversight and
 * not a smaller version of the defect above: each already has a caller-side
 * meaning for "absent" that is honest under failure. Settings absent renders
 * the configuration screen, not a claim about the operator. app_state absent
 * means a cached run has not happened. An empty key map means an ingested
 * item's extras did not resolve, and the item still renders.
 *
 * What they DO owe is the diagnosis in the log. All three previously discarded
 * `error` entirely, so a rejected read left no trace anywhere — the same blind
 * spot, just with a less damaging surface. Inspecting the error is the
 * invariant; converting it into a rendered state is a judgement call.
 */
export async function getUserSettings(): Promise<UserSettings | null> {
  // ownerSelect already filters user_id — no second .eq needed here.
  const query = ownerSelect('user_settings');
  if (!query) return null;

  const { data, error } = await query.maybeSingle();
  if (error) console.warn('[data] getUserSettings failed:', describeReadFailure(error.message));

  return (data as UserSettings) ?? null;
}

export async function getAppState<T = unknown>(key: string): Promise<T | null> {
  const query = ownerSelect('app_state', 'value');
  if (!query) return null;

  const { data, error } = await query.eq('key', key).maybeSingle();
  if (error) console.warn(`[data] getAppState(${key}) failed:`, describeReadFailure(error.message));

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

  const { data, error } = await query.in('url_hash', keys.slice(0, 500));
  if (error) console.warn('[data] getFeedItemsByKeys failed:', describeReadFailure(error.message));

  const out: Record<string, FeedItem> = {};
  for (const row of (data ?? []) as FeedItem[]) {
    if (row.url_hash) out[row.url_hash] = row;
  }
  return out;
}
