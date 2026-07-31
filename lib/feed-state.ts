import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';

/**
 * Per-item triage state: acted on, assigned, snoozed, not-for-me.
 *
 * Stored as ONE row in `app_state` rather than columns on `feed_items`, on
 * purpose. A schema change would mean the operator running migration SQL in
 * Supabase before the feature works at all, and this is triage metadata — it
 * describes the reader's relationship to an item, not the item. app_state is
 * already user-scoped and already read by the data layer.
 *
 * The cost is honest: this cannot be queried or sorted in SQL. At feed scale
 * (tens to low hundreds of live items) filtering in memory is nothing. If the
 * feed ever needs server-side pagination over triage state, this becomes
 * columns — and that is the signal to move it.
 */

export const FEED_STATE_KEY = 'feed:item-states';

export type ItemState = 'acted' | 'assigned' | 'snoozed' | 'not-for-me';

export interface ItemStateRecord {
  state: ItemState;
  /** ISO — when a snooze expires and the item returns to the feed. */
  until?: string;
  /** Deal the item was assigned or logged against. */
  dealId?: string;
  note?: string;
  at: string;
}

export type FeedStateMap = Record<string, ItemStateRecord>;

export async function getFeedStates(): Promise<FeedStateMap> {
  return (await getAppState<FeedStateMap>(FEED_STATE_KEY)) ?? {};
}

/**
 * Merge one item's state in and persist.
 *
 * Read-modify-write on a single JSON blob, which would be a race with
 * concurrent writers. This deployment has exactly one operator clicking one
 * button at a time, so the simplicity is worth more than a lock. Revisit
 * alongside the move to columns.
 */
export async function setFeedState(
  itemId: string,
  record: ItemStateRecord | null,
): Promise<FeedStateMap> {
  const client = getAdminClient();
  const current = await getFeedStates();

  const next: FeedStateMap = { ...current };
  if (record === null) delete next[itemId];
  else next[itemId] = record;

  if (client) {
    await client
      .from('app_state')
      .upsert(
        { key: FEED_STATE_KEY, value: next, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );
  }

  return next;
}

/**
 * Whether an item should be hidden from the default feed view.
 *
 * Snoozes expire on their own — an item hidden forever because nobody
 * remembered to unsnooze it is a silent loss of coverage. `not-for-me` and
 * `acted` persist, since both are decisions rather than deferrals.
 */
export function isHidden(record: ItemStateRecord | undefined, now = Date.now()): boolean {
  if (!record) return false;
  if (record.state === 'snoozed') {
    return record.until ? new Date(record.until).getTime() > now : false;
  }
  return record.state === 'not-for-me';
}
