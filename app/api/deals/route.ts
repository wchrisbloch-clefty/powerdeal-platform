import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getDeals } from '@/lib/data';
import { computeHealthScore, computeMeddpiccScore, nextDealId } from '@/lib/deals';
import { VERTICALS, RELATIONSHIP_TYPES, DEAL_STAGES } from '@/lib/types';
import type { Deal } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CreateDeal = z.object({
  company: z.string().min(1).max(200),
  vertical: z.enum(VERTICALS),
  relationship_type: z.enum(RELATIONSHIP_TYPES).default('Direct'),
  // Not always a 2-letter code — multi-site accounts legitimately carry
  // 'multi'. centroidFor() returns null for those, so they simply don't
  // plot on the map rather than plotting somewhere wrong.
  state: z.string().max(20).nullable().optional(),
  utility: z.string().max(120).nullable().optional(),
  stage: z.enum(DEAL_STAGES).default('Prospecting'),
  champion: z.string().max(200).nullable().optional(),
  geo_tier: z.string().max(40).nullable().optional(),
  value_prop: z.string().max(60).nullable().optional(),
  size_mw: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

/** GET /api/deals — every deal for the signed-in user. */
export async function GET() {
  const { data, isSeed } = await getDeals();
  return NextResponse.json({ deals: data, isSeed });
}

/** POST /api/deals — create. deal_id is generated from the vertical prefix. */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Sign in to create deals. The template pipeline is read-only.' },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof CreateDeal>;
  try {
    parsed = CreateDeal.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Generate the human deal_id from what already exists for this user.
  // The user_id filter is explicit because the service role bypasses RLS —
  // without it the next id would be derived from every user's deals.
  const { data: existing } = await supabase
    .from('deals')
    .select('deal_id')
    .eq('user_id', POWERDEAL_USER_ID)
    .like('deal_id', '%-%');

  const dealId = nextDealId(
    parsed.vertical,
    (existing ?? []) as Pick<Deal, 'deal_id'>[] as Deal[],
  );

  const draft = {
    ...parsed,
    deal_id: dealId,
    user_id: POWERDEAL_USER_ID,
    days_in_stage: 0,
    multi_threaded: false,
    decision_mapped: false,
  };

  const meddpicc = computeMeddpiccScore(draft);
  const row = {
    ...draft,
    meddpicc_score: meddpicc,
    health_score: computeHealthScore({ ...draft, meddpicc_score: meddpicc }),
  };

  const { data, error } = await supabase.from('deals').insert(row).select().single();

  if (error) {
    // 23505 = unique_violation on (user_id, deal_id) — two tabs racing.
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ deal: data as Deal }, { status: 201 });
}
