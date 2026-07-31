import { NextResponse } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeals } from '@/lib/data';
import { classifyExternal, mapToAccounts } from '@/lib/engine/tiering';
import { canonicalUrl, hashString } from '@/lib/utils';
import { RESEARCH_RUNS_KEY, type IngestEngagement } from '@/lib/research';
import type { Deal, FeedItem } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ingest for last30days-skill output (`--emit=json`, schema_version 1.x).
 * Ported from The Hub's route, with PowerDeal's account layer on top.
 *
 * That skill runs LOCALLY — it reads browser cookies and shells out to yt-dlp,
 * neither of which exists in a serverless function. So we do not run it; we
 * accept what it produced. CB runs it on his machine, POSTs the JSON here, and
 * PowerDeal applies its own curation on top.
 *
 * ⭐ THE LOAD-BEARING RULE
 * Their score is ENGAGEMENT (upvotes, likes, Polymarket odds). Ours is TRUST.
 * Engagement is carried through as a displayed signal and is NEVER allowed to
 * influence the provenance tier. A post with 40k upvotes from an anonymous
 * account is still INFERRED.
 *
 * This matters more here than in the Hub. PowerDeal output goes into
 * customer-facing briefs. A viral Reddit post is not a verified fact, and the
 * only thing standing between the two is that `classifyExternal` never sees an
 * engagement number — look at the call site below: it is handed the source, the
 * URL and the title, and nothing else.
 */

interface L30Result {
  candidate_id?: string;
  title?: string;
  source?: string;
  url?: string;
  published_at?: string;
  summary?: string;
  engagement?: Record<string, unknown>;
  relevance_score?: number;
  /** Set by `--hiring-signals` runs. */
  signal_kind?: string;
}

interface L30Payload {
  schema_version?: string;
  query?: string;
  generated_at?: string;
  window_days?: number;
  results?: L30Result[];
}

/** Map their source string onto PowerDeal's platform enum. */
function platformOf(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('reddit')) return 'reddit';
  if (s.includes('youtube')) return 'youtube';
  if (s === 'x' || s.includes('twitter')) return 'x';
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('linkedin')) return 'linkedin';
  if (s.includes('instagram')) return 'instagram';
  return 'web';
}

/** Pull the largest counter out of their per-source engagement object. */
function engagementOf(raw: Record<string, unknown> | undefined): IngestEngagement | undefined {
  if (!raw) return undefined;
  const nums = Object.entries(raw).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v),
  ) as [string, number][];
  if (!nums.length) return undefined;

  const [topKey, topVal] = nums.sort((a, b) => b[1] - a[1])[0];
  const comments = Number(raw.num_comments ?? raw.comments ?? raw.replies ?? 0) || undefined;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  return { score: topVal, comments, label: `${fmt(topVal)} ${topKey.replace(/_/g, ' ')}` };
}

/**
 * Confidence from the grade plus what we know about the item itself. Recency
 * and having a real URL both raise it; neither is engagement.
 */
function itemConfidence(base: number, opts: { hasUrl: boolean; ageHours?: number }): number {
  let c = base;
  if (!opts.hasUrl) c -= 0.15;
  if (opts.ageHours !== undefined) {
    if (opts.ageHours < 48) c += 0.05;
    else if (opts.ageHours > 24 * 21) c -= 0.05;
  }
  return Math.max(0.05, Math.min(0.99, Number(c.toFixed(2))));
}

/** BD implications worth offering for promotion to a signal. */
const BD_IMPLICATION =
  /\b(expansion|expanding|outage|shutdown|turnaround|capex|capital expenditure|investment|hiring|layoff|appoint|names? new|steps down|chief executive|CEO|CFO|groundbreaking|new plant|facility|acquisition|merger)\b/i;

export async function POST(request: Request) {
  // Shared with the export surface — same trust boundary, both are machine
  // surfaces with no session behind them.
  const expected = process.env.INGEST_TOKEN ?? process.env.EXPORT_TOKEN;
  const provided =
    new URL(request.url).searchParams.get('token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'Ingest is disabled. Set INGEST_TOKEN to enable it.' },
      { status: 503 },
    );
  }
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing token.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | (L30Payload & { deal_id?: string })
    | null;

  if (!payload?.results?.length) {
    return NextResponse.json(
      { ok: false, error: 'Expected last30days JSON with a non-empty results array.' },
      { status: 400 },
    );
  }

  const { data: deals } = await getDeals();
  const scoped = payload.deal_id ? deals.find((d) => d.id === payload.deal_id) : null;

  const now = Date.now();
  const runAt = payload.generated_at ?? new Date().toISOString();

  const items = payload.results
    .filter((r) => r.title && r.url)
    .slice(0, 60)
    .map((r) => {
      const source = r.source ?? 'web';
      const url = canonicalUrl(r.url!);
      const publishedAt = r.published_at ?? runAt;
      const ageHours = (now - Date.parse(publishedAt)) / 3_600_000;

      // OUR tiering, from the source itself. Engagement is not in scope here
      // and must never be added to this call.
      const graded = classifyExternal({
        title: r.title!,
        url,
        source,
        desc: r.summary ?? '',
      });

      const engagement = engagementOf(r.engagement);

      // Account mapping — the PowerDeal layer the Hub does not have.
      const matches = mapToAccounts(
        {
          title: r.title!,
          summary: r.summary ?? '',
          content: r.summary ?? '',
          category: '',
        },
        deals,
      );
      const dealIds = scoped
        ? [...new Set([scoped.id, ...matches.map((m) => m.dealId)])]
        : matches.map((m) => m.dealId);

      const hiring = r.signal_kind === 'hiring' || /hiring|careers page|job post/i.test(r.title!);

      return {
        row: {
          title: r.title!.slice(0, 500),
          synthesis: r.summary?.slice(0, 4000) ?? null,
          tier: graded.tier,
          confidence: itemConfidence(graded.confidence, {
            hasUrl: true,
            ageHours: Number.isFinite(ageHours) ? ageHours : undefined,
          }),
          // Honest arrival: this came from an external research run, by hand.
          // Never 'rss' — that would claim a fetcher found it.
          arrival: 'manual' as const,
          platform: platformOf(source),
          source_id: 'last30days',
          source_name: source,
          url,
          url_hash: hashString(r.candidate_id ?? url),
          image_url: null,
          byline: null,
          published_at: publishedAt,
          category: null,
          vertical_tags: ['research'],
          deal_ids: dealIds,
          action: null,
          action_tier: 'inferred' as const,
          breaking: false,
          cached_at: new Date().toISOString(),
          user_id: POWERDEAL_USER_ID,
        } satisfies Partial<FeedItem> & Record<string, unknown>,
        engagement,
        /**
         * Offered for promotion, never auto-written. Whether a hiring post is a
         * buying signal is a judgment about an account, and the dual meaning
         * belongs to the operator.
         */
        promotable:
          dealIds.length > 0 && (hiring || BD_IMPLICATION.test(`${r.title} ${r.summary ?? ''}`)),
        signalType: hiring ? 'trigger-event' : null,
      };
    });

  // ── Persist ──
  const supabase = getAdminClient();
  let stored = 0;
  let storeError: string | null = null;

  if (supabase) {
    const { error } = await supabase
      .from('feed_items')
      .upsert(
        items.map((i) => i.row),
        { onConflict: 'user_id,url_hash' },
      );
    if (error) storeError = error.message;
    else stored = items.length;
  }

  // The run itself, so the Research tab can group by query and date.
  if (supabase) {
    const runs =
      (await supabase
        .from('app_state')
        .select('value')
        .eq('user_id', POWERDEAL_USER_ID)
        .eq('key', RESEARCH_RUNS_KEY)
        .maybeSingle()).data?.value ?? [];

    const next = [
      {
        query: payload.query ?? 'unknown',
        generatedAt: runAt,
        windowDays: payload.window_days ?? 30,
        schemaVersion: payload.schema_version ?? 'unknown',
        itemCount: items.length,
        platforms: [...new Set(items.map((i) => i.row.platform))],
        dealId: scoped?.id ?? null,
        itemKeys: items.map((i) => i.row.url_hash),
        engagement: Object.fromEntries(
          items.filter((i) => i.engagement).map((i) => [i.row.url_hash, i.engagement]),
        ),
        promotable: items.filter((i) => i.promotable).map((i) => i.row.url_hash),
      },
      ...(Array.isArray(runs) ? runs : []),
    ].slice(0, 40);

    await supabase
      .from('app_state')
      .upsert(
        { key: RESEARCH_RUNS_KEY, value: next, user_id: POWERDEAL_USER_ID },
        { onConflict: 'user_id,key' },
      );
  }

  return NextResponse.json({
    ok: true,
    schemaVersion: payload.schema_version ?? 'unknown',
    query: payload.query ?? null,
    windowDays: payload.window_days ?? null,
    ingested: items.length,
    stored,
    storeError,
    accountsHit: [
      ...new Set(
        items.flatMap((i) => i.row.deal_ids).map((id) => labelFor(id, deals)).filter(Boolean),
      ),
    ],
    promotable: items.filter((i) => i.promotable).length,
    note:
      'Engagement is carried as a displayed signal only. Provenance tiers were computed independently from source, URL and title — popularity never raises trust.',
    items: items.map((i) => ({
      title: i.row.title,
      tier: i.row.tier,
      platform: i.row.platform,
      engagement: i.engagement?.label ?? null,
      dealIds: i.row.deal_ids,
    })),
  });
}

function labelFor(id: string, deals: Deal[]): string {
  return deals.find((d) => d.id === id)?.company ?? '';
}
