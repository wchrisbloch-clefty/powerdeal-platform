import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDismissals, setDismissal } from '@/lib/item-extras';

export const dynamic = 'force-dynamic';

/**
 * Dismissals — recorded, and actually consulted.
 *
 * A dismissal that nothing reads is analytics theater: the reader tells the
 * product "not this" and the product shows it again tomorrow. Every feed load
 * reads this back and filters, which is the only thing that makes the gesture
 * mean anything.
 *
 * The reason is optional on purpose. Requiring one turns a one-tap dismissal
 * into a form, and the gesture stops getting used at all.
 */

const Body = z.object({
  id: z.string().min(1).max(120),
  reason: z.string().max(400).nullish(),
  /** Undo — the few-second escape hatch after a swipe. */
  undo: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ dismissed: await getDismissals() });
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const dismissed = await setDismissal(
    parsed.id,
    parsed.undo
      ? null
      : { reason: parsed.reason?.trim() || null, at: new Date().toISOString() },
  );

  return NextResponse.json({ ok: true, dismissed });
}
