import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeal, getSignalsForDeal, getMarketWatchForDeal, getStageTransitions } from '@/lib/data';
import { computeHealthScore, computeMeddpiccScore } from '@/lib/deals';
import { DEAL_STAGES, VERTICALS, RELATIONSHIP_TYPES } from '@/lib/types';
import type { Deal } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /api/deals/[id] — the deal plus its related intelligence. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { data: deal } = await getDeal(id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const [signals, marketWatch, transitions] = await Promise.all([
    getSignalsForDeal(id),
    getMarketWatchForDeal(id),
    getStageTransitions(id),
  ]);

  return NextResponse.json({ deal, signals, marketWatch, transitions });
}

const UpdateDeal = z
  .object({
    company: z.string().min(1).max(200),
    vertical: z.enum(VERTICALS),
    relationship_type: z.enum(RELATIONSHIP_TYPES),
    geo_tier: z.string().max(40).nullable(),
    // 'multi' is a valid value for multi-site accounts — see POST route.
    state: z.string().max(20).nullable(),
    utility: z.string().max(120).nullable(),
    value_prop: z.string().max(60).nullable(),
    beachhead_site: z.string().max(200).nullable(),
    stage: z.enum(DEAL_STAGES),
    size_mw: z.number().nonnegative().nullable(),
    size_usd_m: z.number().nonnegative().nullable(),
    multi_threaded: z.boolean(),
    decision_mapped: z.boolean(),
    next_move: z.string().max(1000).nullable(),
    next_move_date: z.string().nullable(),
    key_risk: z.string().max(1000).nullable(),
    metrics_known: z.boolean(),
    economic_buyer: z.string().max(200).nullable(),
    decision_criteria: z.string().max(2000).nullable(),
    decision_process: z.string().max(2000).nullable(),
    identified_pain: z.string().max(2000).nullable(),
    champion: z.string().max(200).nullable(),
    competition: z.string().max(1000).nullable(),
    landed_site: z.string().max(200).nullable(),
    next_target_site: z.string().max(200).nullable(),
    expansion_mw_captured: z.number().nonnegative(),
    expansion_mw_addressable: z.number().nonnegative().nullable(),
    partner_notes: z.string().max(4000).nullable(),
    notes: z.string().max(8000).nullable(),
  })
  .partial();

/** PATCH /api/deals/[id] — partial update. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Sign in to edit deals. The template pipeline is read-only.' },
      { status: 401 },
    );
  }

  let patch: z.infer<typeof UpdateDeal>;
  try {
    patch = UpdateDeal.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // user_id is explicit on every deal query in this file: the service role
  // bypasses RLS, so an id alone would read or write another user's row.
  const { data: current, error: readError } = await supabase
    .from('deals')
    .select('*')
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('id', id)
    .maybeSingle();

  if (readError || !current) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  }

  const merged = { ...(current as Deal), ...patch };

  // MEDDPICC and health are derived, never client-supplied — otherwise the
  // score stops meaning anything.
  const meddpicc = computeMeddpiccScore(merged);
  const update = {
    ...patch,
    meddpicc_score: meddpicc,
    health_score: computeHealthScore({ ...merged, meddpicc_score: meddpicc }),
  };

  // Stage transitions and days_in_stage are handled by the
  // deals_stage_transition trigger in schema.sql, so a stage change made
  // through any path (app, SQL, edge function) is logged exactly once.
  const { data, error } = await supabase
    .from('deals')
    .update(update)
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deal: data as Deal });
}

/**
 * DELETE /api/deals/[id] — soft delete.
 *
 * Sets stage to 'Archived' rather than removing the row: the deal's stage
 * history, logged signals, and win-loss record are the institutional memory
 * that makes the next similar deal winnable.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in to archive deals.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('deals')
    .update({ stage: 'Archived' })
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deal: data as Deal, archived: true });
}
