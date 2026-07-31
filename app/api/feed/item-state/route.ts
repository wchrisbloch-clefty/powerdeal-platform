import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { setFeedState, type ItemStateRecord } from '@/lib/feed-state';

export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().min(1),
  /** null clears the state — the Undo path. */
  state: z.enum(['acted', 'assigned', 'snoozed', 'not-for-me']).nullable(),
  /** Snooze duration. Ignored for every other state. */
  hours: z.number().int().positive().max(24 * 30).optional(),
  dealId: z.string().optional(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/feed/item-state — triage an item.
 *
 * Backs the Snooze / Not for me / Assign / Act on it rail. Returns the full
 * updated map so the client can reconcile rather than guess at what stuck.
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

  const record: ItemStateRecord | null =
    body.state === null
      ? null
      : {
          state: body.state,
          at: new Date().toISOString(),
          ...(body.state === 'snoozed'
            ? {
                until: new Date(
                  Date.now() + (body.hours ?? 24) * 3600_000,
                ).toISOString(),
              }
            : {}),
          ...(body.dealId ? { dealId: body.dealId } : {}),
          ...(body.note ? { note: body.note } : {}),
        };

  try {
    const states = await setFeedState(body.id, record);
    return NextResponse.json({ ok: true, states });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not save that.' },
      { status: 500 },
    );
  }
}
