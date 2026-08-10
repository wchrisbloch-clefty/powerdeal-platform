import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { closeDeal, winLossLog } from '@/lib/win-loss';
import { OUTCOME_TYPES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const Body = z.object({
  dealId: z.string().min(1),
  outcomeType: z.enum(OUTCOME_TYPES),
  reason: z.string().max(2000).optional(),
  lesson: z.string().max(2000).optional(),
  competitorWon: z.string().max(200).optional(),
  revisitTrigger: z.string().max(500).optional(),
  /**
   * The buyer's own words. Generous limit on purpose — the instruction is to
   * capture what was said, and a tight cap invites paraphrase, which is the
   * one thing this field must not contain.
   */
  buyerVerbatim: z.string().max(4000).optional(),
});

/** GET /api/win-loss?outcome=No-Decision — the log, optionally filtered. */
export async function GET(request: NextRequest) {
  const outcome = request.nextUrl.searchParams.get('outcome');
  const parsed = outcome
    ? OUTCOME_TYPES.find((o) => o === outcome)
    : undefined;

  if (outcome && !parsed) {
    return NextResponse.json(
      { error: `Unknown outcome type: ${outcome}` },
      { status: 400 },
    );
  }

  return NextResponse.json({ entries: await winLossLog({ outcome: parsed }) });
}

/**
 * POST /api/win-loss — log an outcome and close the deal.
 *
 * One call, one transaction. The terminal stage is derived from the outcome
 * inside the database function, so there is no way for a caller to log a loss
 * and leave the deal open.
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await closeDeal(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Close failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: result.entry });
}
