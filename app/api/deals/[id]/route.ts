import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeal, getSignalsForDeal, getMarketWatchForDeal, getStageTransitions } from '@/lib/data';
import { computeHealthScore, computeMeddpiccScore } from '@/lib/deals';
import { competitorCountForDeal } from '@/lib/competitive';
import { MEDDPICC_FIELDS, DEAL_STAGES, VERTICALS, RELATIONSHIP_TYPES } from '@/lib/types';
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

  // A rejected read used to serialise as `signals: []` — indistinguishable from
  // an account with nothing logged. 503 with the diagnosis instead: the client
  // asked for related intelligence and did not get an answer, so it should not
  // be handed one that reads like zero.
  const failed = [signals, marketWatch, transitions].find((r) => r.readError);
  if (failed) {
    return NextResponse.json({ error: failed.readError }, { status: 503 });
  }

  return NextResponse.json({
    deal,
    signals: signals.data,
    marketWatch: marketWatch.data,
    transitions: transitions.data,
  });
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
    /**
     * ⚠️ CONSTRAINED TO REAL FIELD KEYS, not free text.
     *
     * The column is `text[]` with no enum behind it, which is the price of one
     * array over ten booleans. So the validation lives here: an unknown key
     * would sit in the array forever, matching nothing, silently doing nothing
     * — a stored value that looks like a record and is not one.
     */
    verified_empty: z
      .array(z.enum(MEDDPICC_FIELDS.map((f) => f.key) as [string, ...string[]]))
      .max(MEDDPICC_FIELDS.length),
    metrics_known: z.boolean(),
    economic_buyer: z.string().max(200).nullable(),
    decision_criteria: z.string().max(2000).nullable(),
    decision_process: z.string().max(2000).nullable(),
    identified_pain: z.string().max(2000).nullable(),
    champion: z.string().max(200).nullable(),
    competition: z.string().max(1000).nullable(),
    /**
     * ⚠️ ABSENT FROM THIS SCHEMA UNTIL 2026-08-21, WHICH MADE ONE OF THE TWO
     * HEALTH CAPS IMPOSSIBLE TO SATISFY FROM THE APPLICATION.
     *
     * `compute_health_score` caps a deal at 6 when `critical_event` is null.
     * The column has existed since 20260810_critical_event.sql, it is read in
     * five places, and NOTHING in the product could ever write it — not this
     * PATCH, not the create route, not any component. Every deal was held
     * against a field that was structurally unreachable, and the cap reported
     * as a finding about the deal rather than about the platform.
     *
     * Found by auditing the write surface, not by a test: there is no assertion
     * that can fail for a field nobody references.
     */
    critical_event: z.string().max(2000).nullable(),
    /** Null is legitimate — the surface renders "no date on record". */
    critical_event_date: z.string().nullable(),
    /**
     * Wins over account-level `utility` in the resolver: the account field
     * describes the company, the beachhead is where the tariff actually is.
     */
    beachhead_utility: z.string().max(120).nullable(),
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
  // THE 'C' SCORES OFF `deal_competitors`, NOT THE DEPRECATED FREE-TEXT FIELD.
  // A null count means the read failed, and `meddpiccResult` leaves the pillar
  // unscored rather than calling it a gap — which would print "Competition:
  // gap" on a deal with a fully worked competitive grid.
  const competitorCount = await competitorCountForDeal(id);
  const meddpicc = computeMeddpiccScore(merged, competitorCount);
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
