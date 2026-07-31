import 'server-only';
import { getAppState } from '@/lib/data';

/**
 * Ingested last30days runs.
 *
 * A run is the unit the Research tab groups by — "what did I ask, when, and
 * what came back" — so it is stored as its own record rather than inferred by
 * grouping feed_items after the fact. The items themselves live in feed_items
 * like everything else and are graded by the same classifier; this only holds
 * what makes a RUN a run.
 *
 * app_state again, for the same reason as the rest: no migration required
 * before the feature works.
 */

export const RESEARCH_RUNS_KEY = 'research:last30days-runs';

export interface IngestEngagement {
  score: number;
  comments?: number;
  label: string;
}

export interface ResearchRun {
  query: string;
  generatedAt: string;
  windowDays: number;
  schemaVersion: string;
  itemCount: number;
  platforms: string[];
  /** Set when the run was scoped to one account. */
  dealId: string | null;
  /** url_hash of every item, so the tab can pull them back out of feed_items. */
  itemKeys: string[];
  /**
   * Engagement per item, kept OUT of the feed_items row on purpose. It is not a
   * property of the item's trustworthiness and must never sit next to the tier
   * where something could start folding one into the other.
   */
  engagement: Record<string, IngestEngagement>;
  /** Items with a BD implication, offered for promotion to a signal. */
  promotable: string[];
}

export async function getResearchRuns(): Promise<ResearchRun[]> {
  const runs = await getAppState<ResearchRun[]>(RESEARCH_RUNS_KEY);
  return Array.isArray(runs) ? runs : [];
}

/**
 * Research context for one account's brief, plan or outreach prompt.
 *
 * Reads the ingested rows straight out of feed_items — they were graded there
 * on arrival — and re-attaches the engagement label from the run record. The
 * two are stored apart on purpose and only ever meet in the prompt, where the
 * accompanying instruction says which of them is the trust signal.
 */
export async function researchForDeal(
  dealId: string,
  limit = 10,
): Promise<import('@/lib/prompts/modules/shared').ResearchContextItem[]> {
  const runs = await getResearchRuns();
  if (runs.length === 0) return [];

  const { ownerSelect } = await import('@/lib/supabase/admin');
  const query = ownerSelect('feed_items');
  if (!query) return [];

  const { data } = await query
    .contains('deal_ids', [dealId])
    .eq('source_id', 'last30days')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  const engagementByKey = new Map<string, string>();
  let runAt: string | undefined;
  for (const run of runs) {
    runAt ??= run.generatedAt;
    for (const [key, e] of Object.entries(run.engagement ?? {})) {
      if (!engagementByKey.has(key)) engagementByKey.set(key, e.label);
    }
  }

  return ((data ?? []) as { title: string; source_name: string | null; url: string | null; tier: string; url_hash: string | null }[]).map(
    (row) => ({
      title: row.title,
      source: row.source_name,
      url: row.url,
      tier: row.tier,
      engagement: row.url_hash ? engagementByKey.get(row.url_hash) ?? null : null,
      runAt,
    }),
  );
}
