import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import type { OutcomeType, WinLossEntry } from '@/lib/types';

/**
 * WIN-LOSS — the buyer's own words, and an atomic close.
 *
 * This table has existed in schema.sql since the beginning with no application
 * surface at all: never read, never written. The verbatim is what makes it
 * worth having. A category selection tells you a deal was lost to budget; the
 * sentence the buyer actually said tells you what to do about the next one, and
 * it is quotable in a way nothing we write about ourselves ever is.
 */

/**
 * The terminal stage a given outcome implies.
 *
 * DERIVED, never chosen. Exported so the UI can show what will happen before
 * the user commits, and so the rule lives in one place rather than being
 * re-decided in the dialog. Mirrors log_win_loss() in the migration.
 */
export function terminalStageFor(outcome: OutcomeType): 'Closed-Won' | 'Archived' {
  return outcome === 'Won' ? 'Closed-Won' : 'Archived';
}

export interface CloseInput {
  dealId: string;
  outcomeType: OutcomeType;
  reason?: string | null;
  lesson?: string | null;
  competitorWon?: string | null;
  revisitTrigger?: string | null;
  buyerVerbatim?: string | null;
}

/**
 * Log the outcome and set the deal's terminal stage.
 *
 * Delegates to the log_win_loss() Postgres function so both writes happen in
 * ONE transaction. Doing it as two calls from here leaves a window where
 * win_loss_log says the deal was lost while deals.stage still says Discovery —
 * two records disagreeing about the same fact, with no error raised. The
 * outcome would be logged and the pipeline would show an open deal forever.
 */
export async function closeDeal(
  input: CloseInput,
): Promise<{ ok: boolean; entry?: WinLossEntry; error?: string }> {
  const client = getAdminClient();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await client.rpc('log_win_loss', {
    p_deal_id: input.dealId,
    p_outcome_type: input.outcomeType,
    p_reason: input.reason ?? null,
    p_lesson: input.lesson ?? null,
    p_competitor_won: input.competitorWon ?? null,
    p_revisit_trigger: input.revisitTrigger ?? null,
    p_buyer_verbatim: input.buyerVerbatim ?? null,
  });

  if (error) {
    // A missing function is the likely cause on an un-migrated database, and
    // the generic message would send someone hunting through app code.
    const hint = /function .*log_win_loss/i.test(error.message)
      ? ' — run supabase/migrations/20260810_win_loss_verbatim.sql'
      : '';
    return { ok: false, error: `${error.message}${hint}` };
  }

  return { ok: true, entry: data as WinLossEntry };
}

/** Outcomes for one deal, newest first. */
export async function winLossForDeal(dealId: string): Promise<WinLossEntry[]> {
  const client = getAdminClient();
  if (!client) return [];

  const { data } = await client
    .from('win_loss_log')
    .select('*')
    .eq('deal_id', dealId)
    .eq('user_id', POWERDEAL_USER_ID)
    .order('closed_at', { ascending: false });

  return (data as WinLossEntry[]) ?? [];
}

/**
 * The whole log, optionally filtered by outcome.
 *
 * The read surface is not optional. Captured verbatims sitting in a table
 * nobody opens are worse than not capturing them — the cost is paid at the
 * hardest moment, right after a loss, and never returned.
 */
export async function winLossLog(
  opts: { outcome?: OutcomeType; limit?: number } = {},
): Promise<WinLossEntry[]> {
  const client = getAdminClient();
  if (!client) return [];

  let query = client
    .from('win_loss_log')
    .select('*')
    .eq('user_id', POWERDEAL_USER_ID)
    .order('closed_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.outcome) query = query.eq('outcome_type', opts.outcome);

  const { data } = await query;
  return (data as WinLossEntry[]) ?? [];
}

/** Entries carrying a usable quote — the asset, as opposed to the record. */
export function withVerbatim(entries: WinLossEntry[]): WinLossEntry[] {
  return entries.filter((e) => Boolean(e.buyer_verbatim?.trim()));
}
