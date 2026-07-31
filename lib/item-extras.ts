import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';

/**
 * Per-item durable extras: cached key facts, dismissals, and the brief queue.
 *
 * All three live in `app_state` rows rather than columns on `feed_items`, for
 * the same reason triage state does: a schema change would mean the operator
 * running migration SQL in Supabase before the feature works at all. These are
 * also facts about the READER's relationship to an item — what they dismissed,
 * what they want in the next brief — not facts about the item.
 *
 * Keyed by url_hash, which is the live feed's item id, so an entry survives a
 * refetch. The database uuid would not: the feed refetches on every load and
 * never persists most of what it shows.
 *
 * The honest cost, same as feed-state: none of this is queryable in SQL. At
 * feed scale that is nothing. If it ever needs to be, that is the signal to
 * move it to columns.
 */

export const KEY_FACTS_KEY = 'item:key-facts';
export const DISMISSED_KEY = 'item:dismissed';
export const BRIEF_QUEUE_KEY = 'item:brief-queue';

export interface CachedKeyFacts {
  facts: string[];
  thin: boolean;
  note: string | null;
  model: string | null;
  at: string;
}

export interface Dismissal {
  reason: string | null;
  at: string;
}

export interface BriefQueueEntry {
  title: string;
  url: string | null;
  source: string | null;
  tier: string;
  synthesis: string | null;
  /** Account this was flagged for — the brief it belongs to. */
  dealId: string | null;
  at: string;
}

export type KeyFactsMap = Record<string, CachedKeyFacts>;
export type DismissalMap = Record<string, Dismissal>;
export type BriefQueueMap = Record<string, BriefQueueEntry>;

async function readMap<T>(key: string): Promise<Record<string, T>> {
  return (await getAppState<Record<string, T>>(key)) ?? {};
}

/**
 * Read-modify-write on a single JSON blob, which would be a race with
 * concurrent writers. This deployment has one operator clicking one button at a
 * time, so the simplicity is worth more than a lock — same trade as feed-state.
 */
async function writeMap<T>(key: string, next: Record<string, T>): Promise<void> {
  const client = getAdminClient();
  if (!client) return;
  await client
    .from('app_state')
    .upsert({ key, value: next, user_id: POWERDEAL_USER_ID }, { onConflict: 'user_id,key' });
}

// ── Key facts ───────────────────────────────────────────────────

export async function getKeyFacts(itemKey: string): Promise<CachedKeyFacts | null> {
  const map = await readMap<CachedKeyFacts>(KEY_FACTS_KEY);
  return map[itemKey] ?? null;
}

export async function putKeyFacts(itemKey: string, value: CachedKeyFacts): Promise<void> {
  const map = await readMap<CachedKeyFacts>(KEY_FACTS_KEY);
  await writeMap(KEY_FACTS_KEY, { ...map, [itemKey]: value });
}

// ── Dismissals ──────────────────────────────────────────────────

export async function getDismissals(): Promise<DismissalMap> {
  return readMap<Dismissal>(DISMISSED_KEY);
}

export async function setDismissal(
  itemKey: string,
  record: Dismissal | null,
): Promise<DismissalMap> {
  const map = await readMap<Dismissal>(DISMISSED_KEY);
  const next = { ...map };
  if (record === null) delete next[itemKey];
  else next[itemKey] = record;
  await writeMap(DISMISSED_KEY, next);
  return next;
}

// ── Brief queue ─────────────────────────────────────────────────

export async function getBriefQueue(): Promise<BriefQueueMap> {
  return readMap<BriefQueueEntry>(BRIEF_QUEUE_KEY);
}

export async function setBriefQueueEntry(
  itemKey: string,
  entry: BriefQueueEntry | null,
): Promise<BriefQueueMap> {
  const map = await readMap<BriefQueueEntry>(BRIEF_QUEUE_KEY);
  const next = { ...map };
  if (entry === null) delete next[itemKey];
  else next[itemKey] = entry;
  await writeMap(BRIEF_QUEUE_KEY, next);
  return next;
}

/** Queued research for one account — what Forge offers before generating. */
export async function briefQueueForDeal(dealId: string): Promise<BriefQueueEntry[]> {
  const map = await getBriefQueue();
  return Object.values(map)
    .filter((e) => e.dealId === dealId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
