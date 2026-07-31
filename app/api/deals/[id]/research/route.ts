import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import type { Deal, DealArtifact } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * "Save to deal" — the replacement for The Hub's personal vault.
 *
 * The Hub saves an item to a reader's own collection. That is the wrong shape
 * here: a rep does not want a pile of interesting articles, they want the rate
 * filing attached to the account it affects, where it will be in front of them
 * the next time they open that deal. So a save is an attachment to a DEAL, and
 * it shows up on the deal page under Research.
 *
 * Stored on the deal's existing `artifacts` array with type `research`, which
 * the deal detail page already reads — no schema change, and it inherits
 * whatever the artifacts list already does.
 */

const Body = z.object({
  title: z.string().min(1).max(500),
  url: z.string().url(),
  source: z.string().max(200).nullish(),
  tier: z.string().max(20).nullish(),
  /** Remove instead of add. */
  remove: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured — saved research needs somewhere to live.' },
      { status: 503 },
    );
  }

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

  const { data: deal, error: readError } = await supabase
    .from('deals')
    .select('artifacts')
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('id', id)
    .maybeSingle();

  if (readError || !deal) {
    return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  }

  const existing = ((deal as Pick<Deal, 'artifacts'>).artifacts ?? []) as DealArtifact[];

  // Saving the same article twice is a no-op rather than a duplicate row — the
  // rep pressed the button again because they forgot, not because they want two.
  const withoutThis = existing.filter((a) => a.url !== parsed.url);
  const next: DealArtifact[] = parsed.remove
    ? withoutThis
    : [
        ...withoutThis,
        {
          type: 'research',
          label: parsed.title.slice(0, 200),
          url: parsed.url,
          format: parsed.tier ?? 'reported',
          created_at: new Date().toISOString(),
        },
      ];

  const { error: writeError } = await supabase
    .from('deals')
    .update({ artifacts: next, updated_at: new Date().toISOString() })
    .eq('user_id', POWERDEAL_USER_ID)
    .eq('id', id);

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, artifacts: next });
}
