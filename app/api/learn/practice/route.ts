import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { routeStream, toSseResponse, canRun } from '@/lib/engine/model-routing';
import { POWERDEAL_IDENTITY } from '@/lib/prompts/system';
import { knowledgeBlock, loadKnowledge } from '@/lib/skills/knowledge';
import { newSession } from '@/lib/learn/session';
import { appendAndSave, getSession, saveSession } from '@/lib/learn/store';
import { buyerInstruction } from '@/lib/learn/practice/prompt';
import { scenarioById } from '@/lib/learn/practice/scenarios';
import { resolveScenarios } from '@/lib/learn/practice/scenarios-resolve';
import { POWERDEAL_USER_ID } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PRACTICE — you say it, the buyer answers.
 *
 * Separate from /api/learn because the shape is different: there is no mode to
 * detect, the system prompt is a person rather than a teaching instruction, and
 * the response carries a structured tail that gets inspected before it renders.
 *
 * ⚠️ THE GUARDRAIL DOES NOT LIVE HERE. It runs where the response is READ, in
 * lib/learn/practice/response.ts, so the finding is attached to the text the
 * reader is looking at rather than to a copy of it on a server. That also means
 * a resumed session is re-inspected on its way back onto the screen, which a
 * write-time check would not do.
 *
 * ══ THE SHELF IS THE ONE FILE THE BUYER REASONS FROM ══
 *
 * Not the whole shelf. This buyer holds one set of objections and arguing them
 * well is the point; handing over every playbook would produce a composite
 * nobody would ever meet.
 */

interface Body {
  scenarioId?: string;
  /** What the rep said. */
  said?: string;
  sessionId?: string;
}

export async function GET() {
  // The scenario list, with any whose doctrine is missing marked rather than
  // hidden — the reader should see there were four and one cannot run.
  return NextResponse.json({ scenarios: resolveScenarios(), available: canRun('learn') });
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Unreadable body.' }, { status: 400 });
  }

  const said = (body.said ?? '').trim();
  if (!said) return NextResponse.json({ error: 'Nothing said.' }, { status: 400 });

  const scenario = scenarioById(body.scenarioId ?? '');
  if (!scenario) {
    return NextResponse.json(
      { error: `No scenario "${body.scenarioId ?? ''}". It may have been removed.` },
      { status: 400 },
    );
  }

  if (!canRun('learn')) {
    return NextResponse.json(
      {
        error:
          'ANTHROPIC_API_KEY is not set. Practice is a domain-reasoning surface and is never routed to a cheaper model — a buyer who argues the doctrine subtly wrong teaches the wrong reflexes, and from inside the conversation there is no way to tell.',
      },
      { status: 501 },
    );
  }

  /**
   * ⚠️ REFUSE RATHER THAN IMPROVISE. If the knowledge file is gone the buyer
   * would argue from general knowledge, fluently, and the reader would rehearse
   * against objections nobody in this market raises. A 501 with a reason beats
   * a convincing rehearsal of the wrong conversation.
   *
   * ⚠️ AND IT IS `loadKnowledge`, NOT `knowledgeBlock`. The first version of
   * this asked `if (!doctrine)`. `knowledgeBlock` never returns empty: when the
   * file is missing it
   * returns a paragraph telling the model to proceed without it and say so.
   * That is the right behaviour for a teaching answer and the wrong one here —
   * `if (!doctrine)` was dead code, and the refusal below would never have
   * fired. The buyer would have improvised, fluently, and the surface would
   * have looked identical.
   */
  const knowledge = loadKnowledge(scenario.source);
  if (!knowledge.ready) {
    return NextResponse.json(
      {
        error: `This scenario reasons from ${scenario.source}, which is not available (${knowledge.error}). Running it anyway would improvise a buyer, and a plausible wrong buyer is worse practice than none.`,
      },
      { status: 501 },
    );
  }
  const doctrine = knowledgeBlock(scenario.source);

  const now = new Date().toISOString();
  let sessionId = body.sessionId ?? null;
  let writeError: string | null = null;

  if (sessionId) {
    const appended = await appendAndSave(sessionId, { role: 'user', text: said, at: now });
    if (!appended.ok) writeError = appended.error;
  } else {
    sessionId = randomUUID();
    const created = await saveSession(
      // The opener is the SCENARIO, so the resume list says which room it was.
      newSession(sessionId, 'practice', `Practice — ${scenario.who}`, now, POWERDEAL_USER_ID),
    );
    if (!created.ok) writeError = created.error;
    if (created.ok) {
      const first = await appendAndSave(sessionId, { role: 'user', text: said, at: now });
      if (!first.ok) writeError = first.error;
    }
  }

  let priorTurns = '';
  if (body.sessionId) {
    const { session } = await getSession(body.sessionId);
    if (session) {
      priorTurns = session.turns
        .slice(-12)
        .map((t) => `${t.role === 'user' ? 'THE REP' : 'YOU'}: ${t.text}`)
        .join('\n\n');
    }
  }

  const system = [POWERDEAL_IDENTITY, '', buyerInstruction(scenario), '', doctrine]
    .filter(Boolean)
    .join('\n\n');

  const user = [
    `YOU OPENED WITH: ${scenario.opener}`,
    priorTurns ? `THE EXCHANGE SO FAR:\n\n${priorTurns}` : '',
    `THE REP SAYS: ${said}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const stream = routeStream('learn', {
    system,
    user,
    // A buyer's turn is short. The tail is two fields. Anything longer is a
    // monologue, which is not what a person in a meeting does.
    maxTokens: 1200,
    promptCache: true,
  });

  return toSseResponse(
    (async function* () {
      yield {
        type: 'meta' as const,
        message: JSON.stringify({ sessionId, scenarioId: scenario.id, writeError }),
      };

      let answer = '';
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) answer += chunk.text;
        yield chunk;
      }

      if (answer.trim() && sessionId) {
        const saved = await appendAndSave(sessionId, {
          role: 'assistant',
          text: answer,
          at: new Date().toISOString(),
        });
        if (!saved.ok) {
          yield { type: 'meta' as const, message: JSON.stringify({ writeError: saved.error }) };
        }
      }
    })(),
  );
}
