import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deal, MarketWatchEntry, SourceTier } from '@/lib/types';
import { route, canRun } from './model-routing';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';

/**
 * WEEKLY RECAP — Market Watch Tier 2.
 *
 * This is what the sweep's persistence was always for. The live feed answers
 * "what is happening right now"; a week of persisted rows answers a question
 * the feed structurally cannot: "what MOVED this week, and which accounts did
 * it move under?" A feed that refetches on every load has no memory, so
 * accumulation has to come from somewhere else.
 *
 * Two halves, and the split is deliberate:
 *
 *   · The counts, the accounts hit and the top movers are computed in code.
 *     They are facts about rows in a table and must not be a model's
 *     recollection of them — a recap that misreports which accounts were hit
 *     is worse than no recap, because it will be read as a call list.
 *   · Only the NARRATIVE is generated, and only from those computed facts.
 *     The model is given the numbers and asked to say what they mean, never
 *     asked to count.
 *
 * If no model is configured the recap still produces every computed section and
 * simply omits the narrative. The numbers are the useful part.
 */

export const RECAP_STATE_KEY = 'recap:weekly';

export interface RecapMover {
  entity: string;
  mentions: number;
  tier: SourceTier;
}

export interface RecapAccount {
  dealId: string;
  company: string;
  hits: number;
  /** The strongest single headline that hit this account. */
  topHeadline: string | null;
  outreachHook: string | null;
}

export interface WeeklyRecap {
  generatedAt: string;
  /** Inclusive ISO date range the recap covers. */
  from: string;
  to: string;
  totalItems: number;
  verifiedCount: number;
  accountsHit: RecapAccount[];
  topMovers: RecapMover[];
  categories: { category: string; count: number }[];
  /** AI narrative over the computed facts. Null when no model is configured. */
  narrative: string | null;
  /** False when the numbers are real but the narrative could not be produced. */
  aiGenerated: boolean;
}

const TIER_RANK: Record<SourceTier, number> = { verified: 3, reported: 2, inferred: 1 };

/**
 * Build the recap from persisted market watch rows.
 *
 * Reads market_watch_log rather than feed_items because those rows are already
 * the notable subset — the sweep only writes an entry when an item hit an
 * account — and each one carries the impact rank and outreach hook the recap
 * wants to surface.
 */
export async function buildWeeklyRecap(
  supabase: SupabaseClient,
  userId: string,
  deals: Deal[],
  days = 7,
): Promise<WeeklyRecap> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600_000);

  const { data, error } = await supabase
    .from('market_watch_log')
    .select('*')
    .eq('user_id', userId)
    .gte('swept_at', from.toISOString())
    .order('impact_rank', { ascending: false })
    .order('swept_at', { ascending: false })
    .limit(400);

  if (error) throw new Error(`Recap read failed: ${error.message}`);

  const entries = (data ?? []) as MarketWatchEntry[];

  const base: WeeklyRecap = {
    generatedAt: to.toISOString(),
    from: from.toISOString(),
    to: to.toISOString(),
    totalItems: entries.length,
    verifiedCount: entries.filter((e) => e.source_tier === 'verified').length,
    accountsHit: accountsFrom(entries, deals),
    topMovers: moversFrom(entries),
    categories: categoriesFrom(entries),
    narrative: null,
    aiGenerated: false,
  };

  // A week with nothing in it is a real answer. Saying so plainly beats asking
  // a model to write paragraphs about an empty table.
  if (entries.length === 0 || !canRun('recap')) return base;

  try {
    const result = await route('recap', {
      system: POWERDEAL_IDENTITY,
      user: buildPrompt(base, entries),
      maxTokens: 700,
    });
    const text = result.text.trim();
    if (text) return { ...base, narrative: text, aiGenerated: true };
  } catch (err) {
    console.warn('[recap] narrative failed:', (err as Error).message);
  }

  return base;
}

/**
 * Persist the current recap.
 *
 * Lives here rather than in a route because both the cron and the on-demand
 * regenerate need it, and a Next route module may only export handlers and
 * config — importing a helper out of one is a build error waiting to happen.
 */
export async function storeRecap(
  supabase: SupabaseClient,
  userId: string,
  value: WeeklyRecap,
): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert(
      { key: RECAP_STATE_KEY, value, user_id: userId },
      { onConflict: 'user_id,key' },
    );
  if (error) throw new Error(`Recap store failed: ${error.message}`);
}

function accountsFrom(entries: MarketWatchEntry[], deals: Deal[]): RecapAccount[] {
  const byDeal = new Map<string, RecapAccount>();

  for (const entry of entries) {
    for (const dealId of entry.deal_ids ?? []) {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) continue;

      const existing = byDeal.get(dealId);
      if (existing) {
        existing.hits += 1;
        // Entries arrive impact-ranked, so the first hook seen is the best one.
        existing.outreachHook ??= entry.outreach_hook;
      } else {
        byDeal.set(dealId, {
          dealId,
          company: deal.company,
          hits: 1,
          topHeadline: entry.headline,
          outreachHook: entry.outreach_hook,
        });
      }
    }
  }

  return [...byDeal.values()].sort((a, b) => b.hits - a.hits);
}

/**
 * Movers are drawn from the recap's own rows rather than from the live feed's
 * trending, on purpose: trending is "right now" and this is "the week". An
 * entity that dominated Tuesday and vanished belongs here and not there.
 */
function moversFrom(entries: MarketWatchEntry[], limit = 8): RecapMover[] {
  const counts = new Map<string, RecapMover>();

  for (const entry of entries) {
    const source = entry.source_name?.trim();
    if (!source) continue;
    const existing = counts.get(source);
    if (existing) {
      existing.mentions += 1;
      if (TIER_RANK[entry.source_tier] > TIER_RANK[existing.tier]) {
        existing.tier = entry.source_tier;
      }
    } else {
      counts.set(source, { entity: source, mentions: 1, tier: entry.source_tier });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.mentions - a.mentions || TIER_RANK[b.tier] - TIER_RANK[a.tier])
    .slice(0, limit);
}

function categoriesFrom(entries: MarketWatchEntry[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The prompt hands over the computed numbers and the headlines, and asks only
 * for interpretation. It must never be asked to total anything — the counts
 * above are the record.
 */
function buildPrompt(recap: WeeklyRecap, entries: MarketWatchEntry[]): string {
  const accounts = recap.accountsHit
    .slice(0, 10)
    .map((a) => `- ${a.company}: ${a.hits} hit${a.hits === 1 ? '' : 's'}`)
    .join('\n');

  const headlines = entries
    .slice(0, 25)
    .map((e) => `- [${e.source_tier}] ${e.headline}`)
    .join('\n');

  return `Write the weekly Market Watch recap for a BD rep selling behind-the-meter baseload power.

These figures are already computed and are correct. Use them; do not recount or contradict them:
- ${recap.totalItems} notable items this week, ${recap.verifiedCount} from primary sources
- Accounts hit:
${accounts || '- none'}

HEADLINES:
${headlines}

Write 3 short paragraphs, no headings, no bullet lists:
1. What actually moved this week and why it matters commercially.
2. Which accounts to touch first, and the reason drawn from a headline above.
3. What to watch next week.

Only state figures that appear above. Never estimate a rate, price, capacity, or timeline.
If the week's items do not support a claim, say the week was quiet rather than inflating it.`;
}
