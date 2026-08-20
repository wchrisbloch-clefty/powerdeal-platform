import { isAuthorized, unauthorized, ok, serverError } from '../_shared/auth.ts';
import { contractStamp } from '../_shared/contract.ts';
import { serviceClient, listUsers, listDeals, writeState, readState } from '../_shared/appState.ts';
import { recordAgentRun } from '../_shared/appState.ts';

/**
 * Daily CCUS sweep — 6am CT (11:00 UTC).
 *
 * Pulls GCCSI and NETL feeds, keeps items that are actually about carbon
 * capture, matches them to pipeline accounts, and writes ccus_events.
 *
 * EPA's Class VI permit tracker is NOT scraped. It is an HTML table whose
 * structure changes without notice, and a scraper that silently starts
 * mis-parsing would write wrong permit statuses into the tracker — worse than
 * having no automated permit feed at all. Primacy state is maintained as
 * checked-in data in lib/geo/epa-api.ts.
 */

interface FeedEntry {
  title: string;
  link: string;
  published: string | null;
  summary: string;
}

// URLs mirror lib/verticals/powerdeal.ts. Neither could be verified at build
// time (no outbound network) — check the `errors` array in this function's
// response after the first scheduled run.
// Both URLs verified live 2026-07-31 against the deployment's health probe.
// The originals were dead: the GCCSI /resources/news-media/news/rss/ path and
// netl.doe.gov/rss/news both 404. CCUS_PATTERN below filters the DOE-wide feed
// down to carbon-management items, so the broader source does not add noise.
const SOURCES = [
  {
    name: 'Global CCS Institute',
    url: 'https://www.globalccsinstitute.com/feed/',
    tier: 'verified',
  },
  {
    name: 'DOE Energy News',
    url: 'https://www.energy.gov/rss/articles.xml',
    tier: 'verified',
  },
];

const CCUS_PATTERN =
  /\b(carbon capture|ccus|\bccs\b|class vi|sequestration|co2 storage|carbon storage|45q|carbon dioxide (?:storage|injection))\b/i;

/**
 * ⚠️ THE WINDOW IS THE BINDING CONSTRAINT, NOT THE SOURCES.
 *
 * A manual run on 2026-08-19 reported `fetched: 12, recent: 0` — twelve items
 * in the feeds matched the CCUS pattern and NONE were published in the last 48
 * hours. That is the shape of a slow-moving source: the feeds carry weeks of
 * carbon-management items, and the daily window sees a couple of days of them.
 *
 * So ~1 new event every few days is the expected yield here, and the CCUS tab
 * is a slow surface rather than a broken one. What it is NOT is evidence that
 * the outage cost nothing: anything published between 2026-08-12 and 2026-08-19
 * fell out of the 48h window while the job was dead, and a daily sweep can
 * never reach back for it.
 *
 * ══ WHICH IS WHY THE WINDOW IS NOW AN INPUT ══
 *
 * `{"window_hours": 336}` sweeps fourteen days instead of two. Safe to run,
 * and safe specifically because dedupe is keyed on `source_url`: a wider sweep
 * re-reads everything it has already stored and inserts none of it. The only
 * thing a backfill can do is find items the narrow window missed.
 *
 * Bounded at 90 days. Not because anything breaks past that, but because an
 * unbounded window on a scheduled endpoint is a way to make one call do
 * unbounded work, and this endpoint is reachable by anyone holding the secret.
 */
const DEFAULT_WINDOW_HOURS = 48;
const MAX_WINDOW_HOURS = 24 * 90;

Deno.serve(async (request: Request) => {
  const startedAt = Date.now();
  if (!isAuthorized(request)) return unauthorized();

  let windowHours = DEFAULT_WINDOW_HOURS;
  let windowAsked: number | null = null;
  try {
    const body = await request.clone().json();
    const asked = Number(body?.window_hours);
    if (Number.isFinite(asked) && asked > 0) {
      windowAsked = asked;
      windowHours = Math.min(asked, MAX_WINDOW_HOURS);
    }
  } catch {
    // No body, or not JSON. The scheduled call sends '{}' and lands here
    // harmlessly; the default is the daily window.
  }

  try {
    const supabase = serviceClient();

    // ── 1. Fetch and filter ──
    const entries: (FeedEntry & { source: string; tier: string })[] = [];
    const errors: string[] = [];

    for (const source of SOURCES) {
      try {
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'PowerDealBot/1.0', Accept: 'application/rss+xml, application/xml' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
          errors.push(`${source.name}: HTTP ${res.status}`);
          continue;
        }
        const parsed = parseFeed(await res.text());
        for (const entry of parsed) {
          if (!CCUS_PATTERN.test(`${entry.title} ${entry.summary}`)) continue;
          entries.push({ ...entry, source: source.name, tier: source.tier });
        }
      } catch (err) {
        errors.push(`${source.name}: ${(err as Error).message}`);
      }
    }

    // Daily by default, and the 48h overlap covers ONE missed run. It cannot
    // cover seven, which is what August established — see the note above.
    const cutoff = Date.now() - windowHours * 3600_000;
    const recent = entries.filter(
      (e) => !e.published || Date.parse(e.published) >= cutoff,
    );

    // ── 2. Per-user mapping and write ──
    const users = await listUsers(supabase);
    // One record per job, not per user — the status page asks whether the
    // job ran, not whether it ran for a particular row.
    const ownerForRecord = users[0]?.user_id ?? '';
    const summary: Record<string, unknown> = {};

    for (const user of users) {
      const deals = await listDeals(supabase, user.user_id);

      // Only O&G and industrial accounts get CCUS signals — a defense
      // contractor does not care about a Class VI permit.
      const ccusRelevant = deals.filter(
        (d) => d.vertical.startsWith('O&G') || d.vertical.startsWith('Industrial'),
      );

      const rows = recent.map((entry) => {
        const haystack = `${entry.title} ${entry.summary}`.toLowerCase();
        const matched = ccusRelevant.filter((d) => {
          const company = d.company.toLowerCase().split(/\s+/)[0];
          return company.length >= 4 && haystack.includes(company);
        });

        return {
          event_type: classify(entry.title, entry.summary),
          project_name: entry.title.slice(0, 300),
          state: extractState(`${entry.title} ${entry.summary}`),
          operator: null,
          details: entry.summary.slice(0, 1000),
          source_url: entry.link,
          source_tier: entry.tier,
          deal_ids: matched.map((d) => d.id),
          event_date: entry.published ? entry.published.slice(0, 10) : null,
          user_id: user.user_id,
        };
      });

      let newEvents = 0;
      let accountsHit: (string | undefined)[] = [];

      if (rows.length > 0) {
        // Skip anything already stored — the 48h window overlaps by design.
        // ⚠️ THE DEDUPE READ IGNORED ITS ERROR, AND THE FALLBACK WRITES DATA.
        // Given `[]`, nothing is recognised as already stored, so every row in
        // the overlapping 48h window is inserted again — a refused READ turning
        // into duplicate rows in the table the operator reads. Skipped rather
        // than inserted-blind: a sweep that adds nothing is recoverable, and a
        // sweep that doubles the table on every run is not.
        const { data: existing, error: dedupeError } = await supabase
          .from('ccus_events')
          .select('source_url')
          .eq('user_id', user.user_id)
          .in('source_url', rows.map((r) => r.source_url));

        if (dedupeError) {
          throw new Error(
            `ccus_events dedupe read failed for ${user.user_id}: ${dedupeError.message}. ` +
              `Refusing to insert, because without the existing set every row in the ` +
              `overlapping window would be written a second time.`,
          );
        }

        const seen = new Set((existing ?? []).map((r) => r.source_url as string));
        const fresh = rows.filter((r) => !seen.has(r.source_url));

        if (fresh.length > 0) {
          const { error } = await supabase.from('ccus_events').insert(fresh);
          if (error) errors.push(`insert (${user.user_id}): ${error.message}`);
        }

        newEvents = fresh.length;
        accountsHit = [
          ...new Set(
            fresh.flatMap((r) =>
              r.deal_ids
                .map((id) => deals.find((d) => d.id === id)?.company)
                .filter(Boolean),
            ),
          ),
        ];
      }

      /**
       * ⚠️ THIS WRITE USED TO SIT INSIDE `if (rows.length > 0)`, AND THAT IS
       * HOW FIVE DAYS OF SILENCE READ AS HEALTHY.
       *
       * With nothing new in the window, `rows` is empty, the branch is skipped,
       * and `ccus_latest` keeps whatever timestamp it had the last time the
       * sweep found something. So one key was carrying two different facts —
       * "when did this last run" and "when did this last find anything" — and
       * answering the second while wearing the label of the first.
       *
       * That is the isSeed / readError distinction again: "nothing found" and
       * "did not run" are different, and a freshness signal that only moves on
       * news cannot detect a job that stopped. It is also exactly the shape of
       * the stall-alert defect on a second function.
       *
       * Two timestamps now. `ran_at` moves every run, unconditionally.
       * `found_at` moves only when something was written, and is carried
       * forward from the previous record when nothing was — so the surface can
       * say "checked 20 minutes ago, nothing new since the 11th" instead of
       * implying the eleventh was the last time anybody looked.
       */
      const prior = await readState<{ found_at?: string | null }>(
        supabase,
        user.user_id,
        'ccus_latest',
      );

      await writeState(supabase, user.user_id, 'ccus_latest', {
        ran_at: new Date().toISOString(),
        found_at: newEvents > 0 ? new Date().toISOString() : (prior?.found_at ?? null),
        new_events: newEvents,
        candidates_in_window: rows.length,
        accounts_hit: accountsHit,
      });

      summary[user.user_id] = { new_events: newEvents, candidates: rows.length };
    }

    /*
      ⚠️ THIS REPORTED `ok: true` UNCONDITIONALLY WHILE COLLECTING `errors`.
      Both feeds could 404, `entries` would be empty, nothing would be written,
      and the status page would show a healthy daily sweep. market-watch got
      this right — `ok: !sweepError`, with a comment saying exactly why — and
      this function did not, which is the argument for the shared contract
      rather than three functions each remembering separately.

      A run that could not reach its sources did not succeed at its job. The
      errors travel with the record so the status page can say which source.
    */
    await recordAgentRun(supabase, ownerForRecord, 'ccus-sweep', {
      ok: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : null,
      durationMs: Date.now() - startedAt,
      // ⚠️ WAS HARDCODED 0. The heartbeat carried a meaningless count, so even
      // a healthy run said nothing about how much it had actually done.
      itemsProcessed: Object.values(summary).reduce(
        (n, s) => n + ((s as { new_events: number }).new_events ?? 0),
        0,
      ),
    });

    return ok({
      ...contractStamp(),
      ran_at: new Date().toISOString(),
      /*
        ⚠️ BOTH NUMBERS, NOT JUST THE APPLIED ONE. `window_hours` alone answers
        "what did you sweep" and leaves "did you get what I sent" open — a
        request for 5000 hours and a request for 2160 both come back as 2160,
        which is the clamp doing its job invisibly.

        `window_hours_requested` is null when no parameter was sent, so the
        scheduled call is distinguishable from a manual one asking for the
        default. Three states, three answers.
      */
      window_hours: windowHours,
      window_hours_requested: windowAsked,
      fetched: entries.length,
      recent: recent.length,
      users: users.length,
      summary,
      errors,
      note: 'EPA Class VI permit tracker is not scraped — see the comment at the top of this function.',
    });
  } catch (err) {
    // Recorded on the failure path as well — an unrecorded failure looks
    // exactly like a job that was never deployed.
    try {
      const client = serviceClient();
      // error-blind-ok: this is the FAILURE path's bookkeeping. It runs inside a
      // catch whose only job is recording that the run failed, and it is itself
      // wrapped in a catch so a second failure cannot mask the first. Inspecting
      // this error would have nowhere to report it that is not the error we are
      // already reporting.
      const { data } = await client.from('user_settings').select('user_id').limit(1).maybeSingle();
      await recordAgentRun(client, (data?.user_id as string) ?? '', 'ccus-sweep', {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch { /* bookkeeping must never mask the original error */ }
    return serverError(err);
  }
});

/** Minimal RSS/Atom parser. Deno edge has no XML library worth bundling. */
function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];

  for (const block of blocks) {
    const title = decode(pick(block, 'title'));
    const link =
      pick(block, 'link') ||
      /<link[^>]+href=["']([^"']+)["']/i.exec(block)?.[1] ||
      '';
    if (!title || !link) continue;

    const dateRaw = pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated');
    let published: string | null = null;
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (!Number.isNaN(d.getTime())) published = d.toISOString();
    }

    out.push({
      title,
      link: link.trim(),
      published,
      summary: decode(
        pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'),
      ),
    });
  }

  return out;
}

function pick(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match?.[1]?.trim() ?? '';
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (/primacy/.test(text)) {
    return /grant|approv|award/.test(text)
      ? 'state-primacy-granted'
      : 'state-primacy-pending';
  }
  if (/class vi/.test(text)) {
    if (/approv|issu|grant/.test(text)) return 'class-vi-permit-approved';
    if (/den(y|ied)|reject/.test(text)) return 'class-vi-permit-denied';
    return 'class-vi-permit-application';
  }
  if (/fund|award|grant|\$\d|million|billion/.test(text)) return 'doe-funding';
  return 'gccsi-project-update';
}

const STATE_NAMES: Record<string, string> = {
  texas: 'TX', louisiana: 'LA', wyoming: 'WY', 'north dakota': 'ND',
  colorado: 'CO', california: 'CA', illinois: 'IL', 'west virginia': 'WV',
  oklahoma: 'OK', arizona: 'AZ', alabama: 'AL', mississippi: 'MS',
  indiana: 'IN', ohio: 'OH', montana: 'MT', kansas: 'KS', nebraska: 'NE',
};

function extractState(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (lower.includes(name)) return code;
  }
  return null;
}
