import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  routeStream, toSseResponse, isDomainTask, canRun, NoProviderError,
  type TaskKind, type StreamChunk,
} from '@/lib/engine/model-routing';
import { BRAIN_READY, BRAIN_ERROR, SYSTEM_PROMPT } from '@/lib/prompts/system';
import { scenariosOn } from '@/lib/economics/scenarios';
import { competitorsForDeal } from '@/lib/competitive';
import { presenceGrid, otherPostureNames } from '@/lib/competitor-catalog';
import { negativeHeader } from '@/lib/cards';
import { resolveUtilityContext } from '@/lib/utility/store';
import { researchForDeal } from '@/lib/research';
import {
  buildBusinessCasePrompt, buildObjectionsPrompt,
  buildNoDecisionCardPrompt, buildPricingDefenseCardPrompt,
  buildBriefPrompt, buildQualifyPrompt, buildPlanPrompt, buildMapPrompt,
  buildOutreachPrompt, buildCampaignPrompt, buildIntelPrompt,
  buildPortfolioIntelPrompt, buildPersuadePrompt,
} from '@/lib/prompts/modules';
import {
  getDeal, getDeals, getSignalsForDeal, getMarketWatchForDeal, getRecentSignals,
} from '@/lib/data';
import type { ChatInput } from '@/lib/types';

// Streaming responses must not be statically optimized or cached.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TASKS = [
  'summarize', 'synthesize', 'ask', 'classify', 'market-watch', 'qualify',
  'brief', 'plan', 'map-gen', 'outreach', 'campaign', 'intel', 'persuade',
  'forge-doc', 'recap', 'business-case', 'objections',
  'no-decision-card', 'pricing-defense-card',
] as const;

const Body = z.object({
  task: z.enum(TASKS),
  dealId: z.string().optional(),
  /** Free-text: the chat message, the draft to sharpen, extra context. */
  content: z.string().max(50_000).optional(),
  audiencePersona: z.string().max(60).optional(),
  /** Names which competitor a pricing-defense card argues against. */
  postureKey: z.string().max(80).optional(),
  /** Prior turns, for the chat surface. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(40)
    .optional(),
});

/**
 * Unified streaming AI endpoint.
 *
 * Every in-app AI call lands here. It loads the deal record and its signals,
 * picks the prompt module for the task, and streams the result back as SSE so
 * words appear as they generate rather than after a 40-second wait.
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

  const task = body.task as TaskKind;

  // ── Gate 1: the brain must be synced for domain reasoning ──
  // Generating a "brief" against the placeholder prompt would produce
  // confident output that does not follow the methodology.
  if (isDomainTask(task) && !BRAIN_READY) {
    return NextResponse.json(
      {
        error:
          BRAIN_ERROR ??
          'The PowerDeal system prompt has not been synced. See prompts/README.',
        code: 'BRAIN_NOT_SYNCED',
      },
      { status: 503 },
    );
  }

  // ── Gate 2: a provider must exist ──
  if (!canRun(task)) {
    return NextResponse.json(
      {
        error: isDomainTask(task)
          ? 'ANTHROPIC_API_KEY is required for domain reasoning. This task is never routed to a cheaper model.'
          : 'No AI provider is configured.',
        code: 'NO_PROVIDER',
      },
      { status: 503 },
    );
  }

  let input: BuiltInput;
  try {
    input = await buildInput(task, body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build the prompt.' },
      { status: 400 },
    );
  }

  try {
    return toSseResponse(withCardHeader(input.cardHeader, routeStream(task, input)));
  } catch (err) {
    if (err instanceof NoProviderError) {
      return NextResponse.json({ error: err.message, code: 'NO_PROVIDER' }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Model call failed.' },
      { status: 500 },
    );
  }
}

/**
 * A prompt, plus the card header that must reach the reader whatever the model
 * does. Only the two card tasks set it.
 */
type BuiltInput = ChatInput & { cardHeader?: string };

/**
 * Emit the negative header as the FIRST text of the stream.
 *
 * Before the model is called, not after it returns. A header appended at the
 * end is a header that never arrives when generation fails halfway, and the
 * failure it prevents — a rep carrying the wrong card into a meeting — is
 * exactly the situation a half-generated card creates.
 *
 * It lands in the same buffer the export button reads, so it survives to DOCX
 * with no second code path to keep in step.
 */
async function* withCardHeader(
  header: string | undefined,
  gen: AsyncGenerator<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  if (header) yield { type: 'text', text: header };
  yield* gen;
}

async function buildInput(
  task: TaskKind,
  body: z.infer<typeof Body>,
): Promise<BuiltInput> {
  // "intel" without a dealId is a portfolio-wide strategic read rather than
  // an error — it's a genuinely useful question ("how is the book doing?").
  if (task === 'intel' && !body.dealId) {
    const [{ data: deals }, signals] = await Promise.all([
      getDeals(),
      getRecentSignals(50),
    ]);
    return buildPortfolioIntelPrompt(deals, signals, body.content);
  }

  // Tasks that operate on a single account load the full record + signals.
  const needsDeal = [
    'brief', 'qualify', 'plan', 'map-gen', 'outreach', 'intel',
    'business-case', 'objections', 'no-decision-card', 'pricing-defense-card',
  ].includes(task);

  if (needsDeal) {
    if (!body.dealId) throw new Error(`Task "${task}" requires a dealId.`);

    const { data: deal } = await getDeal(body.dealId);
    if (!deal) throw new Error('Deal not found.');

    const [signals, marketWatch, research] = await Promise.all([
      getSignalsForDeal(body.dealId),
      getMarketWatchForDeal(body.dealId),
      // Ingested last30days items for this account, capped and tier-tagged.
      researchForDeal(body.dealId).catch(() => []),
    ]);

    // Absent economics is a normal state, not an error — economicsBlock renders
    // an empty list as a named gap the document carries. Nothing gates on it.
    const economics = scenariosOn(deal);
    // Posture is an INPUT to the cards, never inferred. Empty is normal.
    const competitors = await competitorsForDeal(body.dealId).catch(() => []);

    // Resolved from the deal's FIELDS, never by a join from its id — the same
    // call an origination surface makes with a state and nothing else. Level 0
    // always answers, so this never throws the card away.
    const utility = await resolveUtilityContext({
      state: deal.state,
      siteUtility: deal.beachhead_utility,
      accountUtility: deal.utility,
    }).catch(() => null);

    const ctx = {
      deal,
      signals,
      marketWatch,
      research,
      economics,
      audiencePersona: body.audiencePersona,
      extra: body.content,
    };

    switch (task) {
      case 'brief': return buildBriefPrompt(ctx);
      case 'qualify': return buildQualifyPrompt(ctx);
      case 'plan': return buildPlanPrompt(ctx);
      case 'map-gen': return buildMapPrompt(ctx);
      case 'outreach': return buildOutreachPrompt(ctx);
      case 'intel': return buildIntelPrompt(ctx);
      case 'business-case': return buildBusinessCasePrompt(ctx);
      case 'objections': return buildObjectionsPrompt(ctx);
      case 'no-decision-card':
        return {
          ...buildNoDecisionCardPrompt({
            ...ctx,
            criticalEvent: deal.critical_event,
            criticalEventDate: deal.critical_event_date,
          }),
          // Built in code and emitted BEFORE the model is called, so it exists
          // even if generation fails outright.
          cardHeader: negativeHeader({
            addressing: 'do nothing — the status quo',
            others: otherPostureNames(deal, competitors, 'no-decision'),
            generatedOn: new Date().toISOString().slice(0, 10),
          }),
        };
      case 'pricing-defense-card': {
        // The posture is named by the caller and resolved against the TOGGLE
        // GRID, not the stored rows. The grid is on by default and stores no
        // row for the ordinary case, so a lookup restricted to stored rows
        // would refuse the single most common card on the majority of deals.
        const grid = presenceGrid(deal, competitors);
        const chosen = grid.find((r) => r.key === body.postureKey && r.on);
        if (!chosen) {
          throw new Error(
            'A pricing defense card requires a postureKey naming a competitor switched on for this deal.',
          );
        }
        if (chosen.key === 'no-decision') {
          throw new Error('Do nothing has its own card — use the no-decision-card task.');
        }
        return {
          ...buildPricingDefenseCardPrompt({
            ...ctx,
            utility,
            posture: {
              competitor: chosen.label,
              tier: chosen.tier,
              posture: chosen.record?.posture ?? null,
              whatWasSaid: chosen.record?.what_was_said ?? null,
              whatLanded: chosen.record?.what_landed ?? null,
            },
          }),
          cardHeader: negativeHeader({
            addressing: chosen.label,
            others: otherPostureNames(deal, competitors, chosen.key),
            generatedOn: new Date().toISOString().slice(0, 10),
          }),
        };
      }
      default: break;
    }
  }

  if (task === 'campaign') {
    const { data: deals } = await getDeals();
    return buildCampaignPrompt({ deals, thesis: body.content });
  }

  if (task === 'persuade') {
    if (!body.content) throw new Error('Nothing submitted to sharpen.');
    const deal = body.dealId ? (await getDeal(body.dealId)).data ?? undefined : undefined;
    return buildPersuadePrompt({
      content: body.content,
      deal,
      audiencePersona: body.audiencePersona,
    });
  }

  if (task === 'forge-doc') {
    if (!body.dealId) throw new Error('Document generation requires a dealId.');
    const { data: deal } = await getDeal(body.dealId);
    if (!deal) throw new Error('Deal not found.');
    return buildBriefPrompt({
      deal,
      audiencePersona: body.audiencePersona,
      extra: body.content,
    });
  }

  // ── Chat and general questions ──
  // The brain plus live pipeline context, so the user never has to
  // reconstruct their situation the way they would in a fresh chat.
  const { data: deals } = await getDeals();
  const selected = body.dealId
    ? deals.find((d) => d.id === body.dealId) ?? null
    : null;
  const signals = selected
    ? await getSignalsForDeal(selected.id)
    : await getRecentSignals(20);

  const contextBlock = [
    '',
    'CURRENT PIPELINE CONTEXT:',
    `Active deals: ${deals.length}`,
    selected
      ? [
          '',
          'ACTIVE DEAL CONTEXT:',
          JSON.stringify(selected, null, 2),
          '',
          'RECENT SIGNALS FOR THIS DEAL:',
          signals.length > 0
            ? signals.map((s) => `- ${s.signal_type}: ${s.raw_signal ?? ''}`).join('\n')
            : '(none logged)',
        ].join('\n')
      : '',
  ].join('\n');

  const history = (body.history ?? [])
    .map((m) => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`)
    .join('\n\n');

  return {
    system: `${SYSTEM_PROMPT}\n${contextBlock}`,
    user: history
      ? `${history}\n\nUser: ${body.content ?? ''}`
      : (body.content ?? ''),
    maxTokens: 8000,
  };
}
