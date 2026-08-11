import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  allMarketStructures, resolveUtilityContext, utilityRecord,
} from '@/lib/utility/store';
import { UTILITY_TYPES, SERVICE_MODELS } from '@/lib/utility/model';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * THE UTILITY LAYER, QUERYABLE WITHOUT A DEAL.
 *
 * `dealId` is not a parameter here and deliberately so. A market review of a
 * prospect that is not in the pipeline resolves at Level 0 from a two-letter
 * state code and nothing else:
 *
 *   GET /api/utility?state=TX
 *
 * If a deals join were the only path to utility resolution, origination would
 * get nothing — which is the failure this route exists to prevent. A caller
 * that happens to have a deal passes the deal's fields, not its id.
 */

/** GET /api/utility?state=TX&utility=CenterPoint&siteUtility=… */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;

  if (p.get('all') === 'structures') {
    return NextResponse.json({ structures: await allMarketStructures() });
  }

  const state = p.get('state');
  const accountUtility = p.get('utility');
  const siteUtility = p.get('siteUtility');

  if (!state && !accountUtility && !siteUtility) {
    return NextResponse.json(
      {
        error:
          'Pass at least a state. Level 0 resolves from a two-letter code alone — that is what makes this reachable for a prospect with no deal.',
      },
      { status: 400 },
    );
  }

  const context = await resolveUtilityContext({ state, accountUtility, siteUtility });
  return NextResponse.json({ context });
}

const Upsert = z.object({
  key: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  state: z.string().length(2),
  type: z.enum(UTILITY_TYPES),
  serviceModel: z.enum(SERVICE_MODELS).nullish(),
  iso: z.string().max(40).nullish(),
  standbyTariff: z.string().max(2000).nullish(),
  departingLoadCharge: z.string().max(2000).nullish(),
  exitFee: z.string().max(2000).nullish(),
  minimumTake: z.string().max(2000).nullish(),
  /**
   * Tri-state on purpose. Null is UNVERIFIED, which the model treats as a live
   * NO-GO candidate — collapsing it to false would silently clear the largest
   * qualification-stage risk in the layer.
   */
  allRequirementsContract: z.boolean().nullish(),
  notes: z.string().max(4000).nullish(),
});

/**
 * POST /api/utility — add a utility on demand.
 *
 * On demand is the storage model. Six utilities are seeded, everything else
 * resolves at Level 0 until somebody has a reason to add it, because a
 * comprehensive US reference would be thousands of rows rotting continuously.
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Upsert>;
  try {
    body = Upsert.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const client = getAdminClient();
  if (!client) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const { error } = await client.from('utilities').upsert(
    {
      key: body.key.trim().toLowerCase(),
      name: body.name.trim(),
      state: body.state.trim().toUpperCase(),
      type: body.type,
      service_model: body.serviceModel ?? null,
      iso: body.iso ?? null,
      standby_tariff: body.standbyTariff ?? null,
      departing_load_charge: body.departingLoadCharge ?? null,
      exit_fee: body.exitFee ?? null,
      minimum_take: body.minimumTake ?? null,
      all_requirements_contract: body.allRequirementsContract ?? null,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );

  if (error) {
    const hint = /relation .*utilities/i.test(error.message)
      ? ' — run supabase/migrations/20260811_utility_structure.sql'
      : '';
    return NextResponse.json({ error: `${error.message}${hint}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, utility: await utilityRecord(body.key) });
}
