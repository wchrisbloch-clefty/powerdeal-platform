import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { route, canRun } from '@/lib/engine/model-routing';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';
import { extractionInstruction } from '@/lib/capture/prompt';
import { readProposals, type ProposalOutcome } from '@/lib/capture/proposal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ═══════════════════════════════════════════════════════════════
 * DUMP A SENTENCE. THE SIGNAL LANDS FIRST.
 * ═══════════════════════════════════════════════════════════════
 *
 * The order is the whole design:
 *
 *   1. write the sentence to `intelligence_log` — timestamped, deal-linked
 *   2. THEN ask a model what fields it might map to
 *   3. return proposals for a human to confirm, one at a time
 *
 * ⚠️ STEP 1 CANNOT BE SKIPPED AND STEP 2 CANNOT UNDO IT. If the model is
 * unconfigured, slow, wrong, or returns nonsense, the capture already happened.
 * The reader is in a car park; the durable record is the point and the
 * proposals are an enrichment on top of it.
 *
 * That ordering also decides what a failure looks like. A 200 with zero
 * proposals and a stated reason is the correct response to "the model is not
 * configured" — the signal is saved, and saying so is more useful than a 501
 * that implies nothing landed.
 *
 * ⚠️ NOTHING HERE WRITES A DEAL FIELD. There is no code path from this route to
 * `deals`. Confirmation is a separate request to a separate route, because a
 * misparsed champion scores a point and reads exactly like a fact somebody
 * checked.
 */

const Body = z.object({
  text: z.string().min(1).max(4000),
  /** Which deals this is about. Empty is legitimate — see below. */
  deal_ids: z.array(z.string().uuid()).max(50).default([]),
  /**
   * The signal type for the log row. Defaults to `stakeholder` because that is
   * what a post-call dictation usually is; the reader can change it in the log.
   */
  signal_type: z.string().max(40).default('stakeholder'),
});

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Sign in to capture — the Intelligence Log needs somewhere to persist.' },
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

  const text = body.text.trim();

  // ── 1. THE DURABLE RECORD, BEFORE ANYTHING ELSE ──
  const { data: signal, error } = await supabase
    .from('intelligence_log')
    .insert({
      signal_type: body.signal_type,
      raw_signal: text,
      deal_ids: body.deal_ids,
      source_name: 'Captured',
      user_id: POWERDEAL_USER_ID,
    })
    .select()
    .single();

  /*
    ⚠️ THE ONLY FAILURE THAT STOPS THIS ROUTE. supabase-js RESOLVES with
    { error } rather than throwing, so this check is the difference between a
    lost capture and a reported one. Proposals for a sentence that was not
    saved would be worse than useless: the reader would confirm a field
    attributed to a signal id that does not exist.
  */
  if (error || !signal) {
    return NextResponse.json(
      { error: `The capture was NOT saved: ${error?.message ?? 'no row returned'}` },
      { status: 500 },
    );
  }

  // ── 2. Proposals, best-effort, on top of a record that is already safe ──
  const outcome = await propose(text);

  return NextResponse.json(
    {
      signal,
      proposals: outcome.proposals,
      refused: outcome.refused,
      /**
       * ⚠️ SAID OUT LOUD RATHER THAN INFERRED FROM AN EMPTY ARRAY. "The model
       * read nothing mappable", "the model is not configured" and "the model
       * failed" all produce zero proposals, and the reader needs to know which
       * one they are looking at before deciding whether to type it in by hand.
       */
      note: outcome.note,
    },
    { status: 201 },
  );
}

interface Outcome extends ProposalOutcome {
  note: string;
}

async function propose(text: string): Promise<Outcome> {
  if (!canRun('extract')) {
    return {
      proposals: [],
      refused: [],
      note:
        'Saved to the Intelligence Log. No model is configured, so nothing was ' +
        'proposed — the sentence is recorded and can be mapped by hand.',
    };
  }

  try {
    const result = await route('extract', {
      system: [POWERDEAL_IDENTITY, '', extractionInstruction()].filter(Boolean).join('\n\n'),
      user: `THE REP SAID:\n\n${text}`,
      maxTokens: 900,
      promptCache: true,
    });

    /*
      A model asked for JSON sometimes wraps it in a fence or a sentence. The
      object is located rather than assumed, and a body with no object at all
      is reported as such — never as "found nothing".
    */
    const raw = result.text ?? '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return {
        proposals: [],
        refused: [],
        note: 'Saved. The model did not return a JSON object, so nothing could be proposed.',
      };
    }

    const outcome = readProposals(JSON.parse(raw.slice(start, end + 1)));
    return {
      ...outcome,
      note:
        outcome.proposals.length > 0
          ? 'Saved. Nothing below is written until you confirm it.'
          : outcome.refused.length > 0
            ? 'Saved. Every candidate was refused — see the reasons below.'
            : 'Saved. The model read nothing it could quote as a field, which is a common and correct outcome.',
    };
  } catch (err) {
    return {
      proposals: [],
      refused: [],
      note: `Saved to the Intelligence Log. The extraction failed (${(err as Error).message}), so nothing was proposed.`,
    };
  }
}
