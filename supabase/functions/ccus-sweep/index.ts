import { isAuthorized, unauthorized, ok, serverError } from '../_shared/auth.ts';
import { serviceClient, listUsers, listDeals, writeState } from '../_shared/appState.ts';
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

Deno.serve(async (request: Request) => {
  const startedAt = Date.now();
  if (!isAuthorized(request)) return unauthorized();

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

    // Last 48h only — this runs daily, and the overlap covers a missed run.
    const cutoff = Date.now() - 48 * 3600_000;
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

      if (rows.length > 0) {
        // Skip anything already stored — the 48h window overlaps by design.
        const { data: existing } = await supabase
          .from('ccus_events')
          .select('source_url')
          .eq('user_id', user.user_id)
          .in('source_url', rows.map((r) => r.source_url));

        const seen = new Set((existing ?? []).map((r) => r.source_url as string));
        const fresh = rows.filter((r) => !seen.has(r.source_url));

        if (fresh.length > 0) {
          const { error } = await supabase.from('ccus_events').insert(fresh);
          if (error) errors.push(`insert (${user.user_id}): ${error.message}`);
        }

        await writeState(supabase, user.user_id, 'ccus_latest', {
          generated_at: new Date().toISOString(),
          new_events: fresh.length,
          accounts_hit: [
            ...new Set(
              fresh.flatMap((r) =>
                r.deal_ids
                  .map((id) => deals.find((d) => d.id === id)?.company)
                  .filter(Boolean),
              ),
            ),
          ],
        });

        summary[user.user_id] = { new_events: fresh.length };
      }
    }

    await recordAgentRun(supabase, ownerForRecord, 'ccus-sweep', {
      ok: true,
      durationMs: Date.now() - startedAt,
      itemsProcessed: 0,
    });

    return ok({
      ran_at: new Date().toISOString(),
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
