import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  routeStream, toSseResponse, isDomainTask, canRun, NoProviderError,
  type TaskKind,
} from '@/lib/engine/model-routing';
import { BRAIN_READY, BRAIN_ERROR, SYSTEM_PROMPT } from '@/lib/prompts/system';
import {
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
  'forge-doc', 'recap',
] as const;

const Body = z.object({
  task: z.enum(TASKS),
  dealId: z.string().optional(),
  /** Free-text: the chat message, the draft to sharpen, extra context. */
  content: z.string().max(50_000).optional(),
  audiencePersona: z.string().max(60).optional(),
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

  let input: ChatInput;
  try {
    input = await buildInput(task, body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build the prompt.' },
      { status: 400 },
    );
  }

  try {
    return toSseResponse(routeStream(task, input));
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

async function buildInput(
  task: TaskKind,
  body: z.infer<typeof Body>,
): Promise<ChatInput> {
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
  ].includes(task);

  if (needsDeal) {
    if (!body.dealId) throw new Error(`Task "${task}" requires a dealId.`);

    const { data: deal } = await getDeal(body.dealId);
    if (!deal) throw new Error('Deal not found.');

    const [signals, marketWatch] = await Promise.all([
      getSignalsForDeal(body.dealId),
      getMarketWatchForDeal(body.dealId),
    ]);

    const ctx = {
      deal,
      signals,
      marketWatch,
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
