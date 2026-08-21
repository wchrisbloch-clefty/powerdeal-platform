import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase/admin';
import { FACT_KEYS, fieldFor } from '@/lib/capture/fields';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE ONLY THING IN THE PRODUCT THAT PROMOTES A PROPOSAL TO A FACT.
 * ═══════════════════════════════════════════════════════════════
 *
 * One field, one deal, one signal, one request. Never a batch: "confirm all"
 * is a button that gets pressed without reading, and reading is the entire
 * safeguard. The surface offers them one at a time for the same reason.
 *
 * ⚠️ IT GOES THROUGH `apply_fact`, NOT A PLAIN UPDATE. The RPC is the only path
 * that can stamp `deal_field_history.signal_id`, because a trigger cannot know
 * which signal produced a write. It also whitelists the column in the database
 * rather than only here — a `security definer` function that trusted its caller
 * would write any column of any row.
 *
 * ⚠️ AND IT REPORTS WHAT LANDED, NOT WHAT WAS ASKED FOR. `apply_fact` returns
 * the stored value read back after the write. A caller assuming its own input
 * is now the stored value is the optimistic-update defect this build already
 * corrected once in the deal panel.
 */

const Body = z.object({
  deal_id: z.string().uuid(),
  field: z.enum(FACT_KEYS as [string, ...string[]]),
  /** Text; cast to the column's type inside `apply_fact`. */
  value: z.string().min(1).max(4000),
  /** The signal this came from. Optional — a hand-typed fact has none. */
  signal_id: z.string().uuid().nullable().optional(),
  /**
   * sourced | derived | illustrative. An estimate must never later read as a
   * measurement, and the column cannot carry that distinction itself.
   */
  basis: z.enum(['sourced', 'derived', 'illustrative']).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Sign in to confirm a fact. The template pipeline is read-only.' },
      { status: 401 },
    );
  }

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

  const spec = fieldFor(body.field);
  if (!spec) {
    // Unreachable through the zod enum, and asserted anyway: the enum is built
    // from the same list, so this fires only if the two ever come apart.
    return NextResponse.json(
      { error: `"${body.field}" is not a fact field.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc('apply_fact', {
    p_deal: body.deal_id,
    p_field: body.field,
    p_value: body.value,
    p_signal: body.signal_id ?? null,
    p_basis: body.basis ?? null,
    p_note: body.note ?? null,
  });

  /*
    ⚠️ supabase-js RESOLVES WITH { error }. Without this check a refused RPC —
    an unlisted field, a bad cast on a date, a deal id that does not exist —
    would return 200 with `data: null`, and the surface would show the fact as
    confirmed while the deal was untouched.
  */
  if (error) {
    return NextResponse.json(
      {
        error: `The write did not land: ${error.message}`,
        field: body.field,
      },
      { status: 500 },
    );
  }

  const result = data as {
    field: string;
    before: string | null;
    after: string | null;
    changed: boolean;
  } | null;

  if (!result) {
    return NextResponse.json(
      { error: 'The write returned nothing, so it cannot be reported as applied.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...result,
    label: spec.label,
    moves: spec.moves,
    /**
     * ⚠️ `changed: false` IS NOT AN ERROR AND IS NOT A SUCCESS. It means the
     * deal already held this value — worth saying, because a reader who just
     * confirmed a champion and sees nothing move should know whether the write
     * was a no-op or whether it failed silently. Those are the two readings
     * this whole build exists to keep apart.
     */
    note: result.changed
      ? `${spec.label} recorded. ${spec.moves}.`
      : `${spec.label} was already this value. Nothing changed, and nothing failed.`,
  });
}
