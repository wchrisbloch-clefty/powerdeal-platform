import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Service-role Supabase client + app_state helpers (CB Hub pattern).
 *
 * Edge functions run across every user, so they use the service role and
 * bypass RLS. That makes user_id scoping the caller's responsibility on every
 * single query — there is no database backstop here.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readState<T>(
  supabase: SupabaseClient,
  userId: string,
  key: string,
): Promise<T | null> {
  const { data } = await supabase
    .from('app_state')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();
  return (data?.value as T) ?? null;
}

export async function writeState(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await supabase
    .from('app_state')
    .upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' },
    );
  if (error) throw new Error(`app_state write failed: ${error.message}`);
}

/** Every user with a settings row — the iteration set for scheduled work. */
export async function listUsers(
  supabase: SupabaseClient,
): Promise<{ user_id: string; watchlist: unknown; notify: Record<string, boolean> }[]> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(
      'user_id, watchlist, notify_market_watch, notify_stall_alert, notify_weekly_recap',
    );
  if (error) throw new Error(`Could not list users: ${error.message}`);

  return (data ?? []).map((row) => ({
    user_id: row.user_id as string,
    watchlist: row.watchlist,
    notify: {
      market_watch: row.notify_market_watch as boolean,
      stall_alert: row.notify_stall_alert as boolean,
      weekly_recap: row.notify_weekly_recap as boolean,
    },
  }));
}

export interface DealRow {
  id: string;
  deal_id: string;
  company: string;
  vertical: string;
  state: string | null;
  utility: string | null;
  stage: string;
  health_score: number;
  days_in_stage: number;
  multi_threaded: boolean;
  decision_mapped: boolean;
  economic_buyer: string | null;
  champion: string | null;
  next_move: string | null;
  key_risk: string | null;
  updated_at: string;
}

export async function listDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<DealRow[]> {
  const { data, error } = await supabase
    .from('deals')
    .select(
      'id, deal_id, company, vertical, state, utility, stage, health_score, days_in_stage, multi_threaded, decision_mapped, economic_buyer, champion, next_move, key_risk, updated_at',
    )
    .eq('user_id', userId)
    .not('stage', 'in', '("Closed-Won","Post-Sale","Archived")');

  if (error) throw new Error(`Could not list deals: ${error.message}`);
  return (data ?? []) as DealRow[];
}
