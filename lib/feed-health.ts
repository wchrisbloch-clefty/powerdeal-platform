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


/**
 * A probe response, parsed without the parser being able to kill the probe.
 *
 * `await res.json()` throws on an HTML body, and that exception used to take
 * the whole feed-health run down with "Unexpected token '<', \"<!DOCTYPE \"...".
 * A probe that exists to notice a response has stopped being parseable, and
 * that dies when a response stops being parseable, is blind in the same way a
 * check that has only ever seen the passing case is blind.
 */
export function parseProbeBody(
  raw: string,
): { ok: true; sources: FeedHealthEntry[] } | { ok: false } {
  try {
    const body = JSON.parse(raw) as { sources?: FeedHealthEntry[] };
    return { ok: true, sources: body.sources ?? [] };
  } catch {
    return { ok: false };
  }
}

/**
 * Say WHICH failure this is, because the two look identical from the outside.
 *
 * HTML where JSON was expected has exactly two common causes, and they need
 * opposite fixes:
 *
 *   · an auth or protection interstitial standing in front of the URL, which
 *     is a configuration problem on our side
 *   · a source that moved, which is the finding this probe exists to produce
 *
 * The URL decides which. An internal callback that returns a login page is
 * never "the feed moved" — it is our own edge refusing our own request, and
 * reporting it as a feed finding would send someone to fix a publisher's site.
 */
export function probeDiagnosis(status: number, raw: string, url: string): string {
  const head = raw.trim().slice(0, 120).replace(/\s+/g, ' ');
  const looksHtml = /^<(?:!doctype|html|\?xml)/i.test(raw.trim());
  const internal = !/^https?:\/\/(?!.*(?:vercel\.app|localhost|127\.0\.0\.1))/i.test(url)
    || /\/api\//.test(url);

  // ⚠️ A REDIRECT IS ITS OWN FINDING, AND THIS BRANCH WAS MISSING.
  //
  // The daily probe failed for weeks reading "unparseable non-HTML (HTTP 302):
  // Redirecting…" — true, and useless. A 302 with a `Redirecting` body is not
  // a malformed feed; it is something standing in front of the request. On an
  // internal callback that is almost always Deployment Protection bouncing the
  // caller into an SSO login, which is a configuration finding and sends the
  // reader somewhere completely different from "the publisher moved the feed".
  //
  // Detection is only half the job. A check that fires correctly and names the
  // wrong cause costs more than one that stays quiet.
  if (status >= 300 && status < 400) {
    return internal
      ? `Probe was REDIRECTED (HTTP ${status}) calling its own route ${url} — ` +
        `something is standing in front of an internal endpoint, almost always ` +
        `Deployment Protection bouncing the request to an SSO login. This is ` +
        `configuration, not a moved feed. Body: ${head}`
      : `Probe was REDIRECTED (HTTP ${status}) by ${url} — the source has moved ` +
        `and the new location is in the Location header. Body: ${head}`;
  }

  if (!looksHtml) {
    return `Probe returned unparseable non-HTML (HTTP ${status}): ${head}`;
  }
  if (internal) {
    return (
      `Probe got HTML from its own callback ${url} (HTTP ${status}) — ` +
      `an interstitial is standing in front of an internal route, so this is ` +
      `deployment configuration, not a moved feed. First check: ${head}`
    );
  }
  return (
    `Probe got HTML from ${url} (HTTP ${status}) — the source has most likely ` +
    `moved or now serves a landing page. This is the finding, not a crash: ${head}`
  );
}
