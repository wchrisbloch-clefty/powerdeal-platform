import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  competitorsForDeal, setPresence, upsertCompetitor, removeCompetitor,
} from '@/lib/competitive';
import { presenceGrid, cardControls, CATALOG_BY_KEY } from '@/lib/competitor-catalog';
import { getDeal } from '@/lib/data';
import { COMPETITOR_TIERS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * PER-DEAL COMPETITIVE PRESENCE.
 *
 * POST toggles a row of the grid. PATCH records detail on one. They are
 * separate verbs because they are separate acts: selection is two seconds and
 * happens on every deal, detail is deliberate and happens on a few. Folding
 * them into one endpoint would push the client toward one form again.
 */

const Toggle = z.object({
  dealId: z.string().min(1),
  /** A catalog key ('grid') or a stored row id. Never a display name. */
  key: z.string().min(1).max(80),
  on: z.boolean(),
});

const Detail = z.object({
  dealId: z.string().min(1),
  key: z.string().min(1).max(80),
  posture: z.string().max(2000).nullish(),
  whatWasSaid: z.string().max(4000).nullish(),
  whatLanded: z.string().max(4000).nullish(),
});

const AddNamed = z.object({
  dealId: z.string().min(1),
  /** Free text: "Wärtsilä via Burns & McDonnell" is a fact about this deal. */
  competitor: z.string().min(1).max(200),
  tier: z.enum(COMPETITOR_TIERS),
});

function badRequest(err: unknown) {
  const message =
    err instanceof z.ZodError
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Invalid request body.';
  return NextResponse.json({ error: message }, { status: 400 });
}

/** GET /api/competitors?dealId=… — the grid as it stands, plus the buttons. */
export async function GET(request: NextRequest) {
  const dealId = request.nextUrl.searchParams.get('dealId');
  if (!dealId) {
    return NextResponse.json({ error: 'dealId is required.' }, { status: 400 });
  }

  const { data: deal } = await getDeal(dealId);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const competitors = await competitorsForDeal(dealId);
  return NextResponse.json({
    rows: presenceGrid(deal, competitors),
    cards: cardControls(deal, competitors),
  });
}

export async function POST(request: NextRequest) {
  let body: z.infer<typeof Toggle> | z.infer<typeof AddNamed>;
  const raw = await request.json().catch(() => null);

  // Adding a named competitor and flipping a switch arrive on the same verb
  // because both are "this is in the deal now".
  if (raw && typeof raw === 'object' && 'competitor' in raw) {
    let add: z.infer<typeof AddNamed>;
    try {
      add = AddNamed.parse(raw);
    } catch (err) {
      return badRequest(err);
    }
    const result = await upsertCompetitor({
      dealId: add.dealId,
      competitor: add.competitor,
      tier: add.tier,
      status: 'active',
    });
    return result.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: result.error }, { status: 500 });
  }

  try {
    body = Toggle.parse(raw);
  } catch (err) {
    return badRequest(err);
  }

  const competitors = await competitorsForDeal(body.dealId);
  const result = await setPresence({ ...body, competitors });
  if (!result.ok) {
    // "Do nothing cannot be switched off" is the caller asking for something
    // the model forbids, not a server fault.
    const status = /cannot be switched off|Unknown competitor/.test(result.error ?? '')
      ? 400
      : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

/** PATCH /api/competitors — record detail on a row that is already on. */
export async function PATCH(request: NextRequest) {
  let body: z.infer<typeof Detail>;
  try {
    body = Detail.parse(await request.json());
  } catch (err) {
    return badRequest(err);
  }

  const competitors = await competitorsForDeal(body.dealId);
  const entry = CATALOG_BY_KEY.get(body.key);
  const existing = entry
    ? competitors.find(
        (c) => c.competitor.trim().toLowerCase() === entry.name.trim().toLowerCase(),
      ) ?? null
    : competitors.find((c) => c.id === body.key) ?? null;

  if (!entry && !existing) {
    return NextResponse.json({ error: `Unknown competitor: ${body.key}` }, { status: 400 });
  }
  if (entry?.presence === 'always') {
    // Do-nothing's posture is a doctrine constant, not a per-deal field. The
    // forcing function that varies per deal is critical_event, on the Spine.
    return NextResponse.json(
      {
        error:
          'Do nothing has no per-deal posture — its argument is the critical event on the deal record.',
      },
      { status: 400 },
    );
  }

  // Detail on a DEFAULT-ON row writes the row for the first time. Its status
  // must stay 'active' rather than defaulting, or recording a posture against
  // the grid would be the thing that switched the grid off.
  const result = await upsertCompetitor({
    dealId: body.dealId,
    competitor: existing?.competitor ?? entry!.name,
    tier: existing?.tier ?? entry!.tier,
    posture: body.posture ?? existing?.posture ?? null,
    whatWasSaid: body.whatWasSaid ?? existing?.what_was_said ?? null,
    whatLanded: body.whatLanded ?? existing?.what_landed ?? null,
    status: existing?.status ?? 'active',
  });

  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 500 });
}

/** DELETE /api/competitors?dealId=…&competitor=… — remove a hand-added row. */
export async function DELETE(request: NextRequest) {
  const dealId = request.nextUrl.searchParams.get('dealId');
  const competitor = request.nextUrl.searchParams.get('competitor');
  if (!dealId || !competitor) {
    return NextResponse.json(
      { error: 'dealId and competitor are both required.' },
      { status: 400 },
    );
  }
  const result = await removeCompetitor(dealId, competitor);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 500 });
}
