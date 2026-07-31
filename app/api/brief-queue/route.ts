import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBriefQueue, setBriefQueueEntry } from '@/lib/item-extras';

export const dynamic = 'force-dynamic';

/**
 * "Add to brief" — the direct path from "I saw something useful" to "it is in
 * the document".
 *
 * Flagged items surface in Forge under "Research to include", with checkboxes
 * before generation, and ride into the prompt with their tier badges intact.
 * Carrying the tier through is the point: a document generator that receives
 * research stripped of provenance will state an INFERRED rumour as fact in
 * something a customer reads.
 */

const Body = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  url: z.string().url().nullish(),
  source: z.string().max(200).nullish(),
  tier: z.string().max(20),
  synthesis: z.string().max(4000).nullish(),
  dealId: z.string().max(80).nullish(),
  /** Unflag it. */
  remove: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ queue: await getBriefQueue() });
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

  const queue = await setBriefQueueEntry(
    parsed.id,
    parsed.remove
      ? null
      : {
          title: parsed.title,
          url: parsed.url ?? null,
          source: parsed.source ?? null,
          tier: parsed.tier,
          synthesis: parsed.synthesis ?? null,
          dealId: parsed.dealId ?? null,
          at: new Date().toISOString(),
        },
  );

  return NextResponse.json({ ok: true, queue });
}
