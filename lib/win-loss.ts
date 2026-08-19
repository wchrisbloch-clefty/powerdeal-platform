import 'server-only';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { describeReadFailure } from '@/lib/data';
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

/**
 * ═══ `Archived` COLLAPSES THREE DIFFERENT LOSSES, AND THE CURE FOR EACH IS
 *     DIFFERENT. THIS IS THE JOIN THAT SEPARATES THEM. ═══
 *
 * `terminalStageFor` maps No-Decision, Competitive and Disqualified all to
 * `Archived`, and that collapse is CORRECT given the schema — `DEAL_STAGES`
 * has no lost stage to map them to and `win_loss_log.outcome_type` preserves
 * the distinction. Nothing is lost; it is just not readable from the stage.
 *
 * Which matters because the doctrine is explicit that the three have different
 * cures: a no-decision needs a forcing function, a competitive loss needs a
 * different argument, and a disqualification needs better qualification
 * earlier. A pipeline row reading `Archived` prescribes none of them.
 *
 * PURE, and it takes the log rows rather than fetching them — the caller
 * already loads them for the win-loss surface, and a second query per row is
 * how a pipeline table becomes slow.
 */
export interface ArchivedOutcome {
  outcome: OutcomeType | null;
  /** What the stage alone cannot say. Empty string when the outcome is Won. */
  label: string;
  /** The doctrine's cure for THIS loss. Null when there is nothing to cure. */
  cure: string | null;
}

const CURES: Record<OutcomeType, string | null> = {
  'No-Decision': 'Needs a forcing function — a dated consequence for not deciding.',
  Competitive: 'Needs a different argument, not a better version of the one that lost.',
  Disqualified: 'Needs better qualification earlier, before the time is spent.',
  Won: null,
};

/**
 * Resolve what an archived deal actually was.
 *
 * ⚠️ A DEAL WITH NO LOG ROW RETURNS `outcome: null`, NOT A GUESS. An archived
 * deal that was never closed through the dialog — moved by hand, or migrated
 * in — has no recorded outcome, and inventing the most common one would put a
 * fabricated cure in front of a rep. The label says the outcome was not
 * recorded, which is a true statement and an actionable one.
 */
export function archivedOutcome(
  dealId: string,
  entries: WinLossEntry[],
): ArchivedOutcome {
  // Newest first: a deal reopened and re-closed has more than one row, and the
  // current outcome is the last one recorded.
  const matches = entries
    .filter((e) => e.deal_id === dealId)
    .sort((a, b) => String(b.closed_at ?? '').localeCompare(String(a.closed_at ?? '')));

  const entry = matches[0];
  if (!entry) {
    return {
      outcome: null,
      label: 'Archived — outcome not recorded',
      cure: null,
    };
  }

  return {
    outcome: entry.outcome_type,
    label: entry.outcome_type === 'Won' ? 'Won' : `Archived — ${entry.outcome_type}`,
    cure: CURES[entry.outcome_type],
  };
}

/** Index the log by deal so a table resolves each row without a scan. */
export function outcomesByDeal(entries: WinLossEntry[]): Map<string, ArchivedOutcome> {
  const ids = new Set(entries.map((e) => e.deal_id).filter((id): id is string => Boolean(id)));
  return new Map([...ids].map((id) => [id, archivedOutcome(id, entries)]));
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

/**
 * Outcomes for one deal, newest first.
 *
 * ⚠️ RETURNS A RESULT. "No outcomes logged" is a sentence about the operator's
 * record-keeping, and the whole argument for this table is that the capture
 * cost is paid at the hardest moment — right after a loss. Printing it because
 * a query was refused is the one thing that would make somebody stop trusting
 * the log, and it would be indistinguishable from the honest empty state.
 */
export interface WinLossResult {
  rows: WinLossEntry[];
  readError: string | null;
}

export async function winLossForDeal(dealId: string): Promise<WinLossResult> {
  const client = getAdminClient();
  if (!client) return { rows: [], readError: null };

  const { data, error } = await client
    .from('win_loss_log')
    .select('*')
    .eq('deal_id', dealId)
    .eq('user_id', POWERDEAL_USER_ID)
    .order('closed_at', { ascending: false });

  if (error) {
    const why = describeReadFailure(error.message);
    console.warn('[win-loss] winLossForDeal failed:', why);
    return { rows: [], readError: why };
  }
  return { rows: (data as WinLossEntry[]) ?? [], readError: null };
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
): Promise<WinLossResult> {
  const client = getAdminClient();
  if (!client) return { rows: [], readError: null };

  let query = client
    .from('win_loss_log')
    .select('*')
    .eq('user_id', POWERDEAL_USER_ID)
    .order('closed_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.outcome) query = query.eq('outcome_type', opts.outcome);

  const { data, error } = await query;
  if (error) {
    const why = describeReadFailure(error.message);
    console.warn('[win-loss] winLossLog failed:', why);
    return { rows: [], readError: why };
  }
  return { rows: (data as WinLossEntry[]) ?? [], readError: null };
}

/** Entries carrying a usable quote — the asset, as opposed to the record. */
export function withVerbatim(entries: WinLossEntry[]): WinLossEntry[] {
  return entries.filter((e) => Boolean(e.buyer_verbatim?.trim()));
}
