import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';

/**
 * FEED HEALTH — checked on a schedule, not when someone remembers to click.
 *
 * Twelve of twenty-two feeds broke silently once already. Publishers move URLs
 * without announcing it, and a feed that returns 404 forever just makes the
 * stream quieter — there is no error, no empty state, nothing to notice. The
 * manual "check all feeds" button only helps the operator who already suspects
 * something is wrong, which is exactly the person who does not need it.
 *
 * TRANSITIONS are the part worth keeping. Current state answers "how many are
 * down"; the transition log answers "what broke since I last looked", which is
 * the actionable half. A feed that has been dead for a month is a known loss; a
 * feed that died on Tuesday is a fix.
 */

export const FEED_HEALTH_KEY = 'feed_health_latest';

export interface FeedHealthEntry {
  id: string;
  name: string;
  status: 'ok' | 'empty' | 'error';
  httpStatus: number | null;
  itemCount: number;
  message: string | null;
}

export interface FeedHealthTransition {
  id: string;
  name: string;
  from: 'ok' | 'empty' | 'error' | 'unknown';
  to: 'ok' | 'empty' | 'error';
  at: string;
}

export interface FeedHealthSnapshot {
  checkedAt: string;
  checked: number;
  ok: number;
  broken: number;
  sources: FeedHealthEntry[];
  /** Newest first, capped — what changed since the previous probe. */
  transitions: FeedHealthTransition[];
}

export async function getFeedHealth(): Promise<FeedHealthSnapshot | null> {
  return await getAppState<FeedHealthSnapshot>(FEED_HEALTH_KEY);
}

/**
 * Store a probe result, carrying forward the transition log.
 *
 * Transitions are computed against the PREVIOUS snapshot rather than recorded
 * by the prober, so a probe that runs twice in a row without change adds
 * nothing — the log stays a list of events, not a list of observations.
 */
export async function storeFeedHealth(
  sources: FeedHealthEntry[],
): Promise<FeedHealthSnapshot> {
  const previous = await getFeedHealth();
  const prevById = new Map((previous?.sources ?? []).map((s) => [s.id, s.status]));
  const at = new Date().toISOString();

  const transitions: FeedHealthTransition[] = [];
  for (const source of sources) {
    const before = prevById.get(source.id);
    // A source seen for the first time is not a transition — it is a baseline.
    if (before === undefined) continue;
    if (before !== source.status) {
      transitions.push({
        id: source.id,
        name: source.name,
        from: before,
        to: source.status,
        at,
      });
    }
  }

  const snapshot: FeedHealthSnapshot = {
    checkedAt: at,
    checked: sources.length,
    ok: sources.filter((s) => s.status === 'ok').length,
    broken: sources.filter((s) => s.status !== 'ok').length,
    sources,
    transitions: [...transitions, ...(previous?.transitions ?? [])].slice(0, 40),
  };

  const client = getAdminClient();
  if (client) {
    await client
      .from('app_state')
      .upsert(
        { key: FEED_HEALTH_KEY, value: snapshot, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );
  }

  return snapshot;
}
