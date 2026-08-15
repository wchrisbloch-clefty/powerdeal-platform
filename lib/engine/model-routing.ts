import Anthropic from '@anthropic-ai/sdk';
import type { ChatInput } from '@/lib/types';
import { recordResolution } from './model-log';

/**
 * ═══════════════════════════════════════════════════════════════
 * Model routing — the economic engine.
 * ═══════════════════════════════════════════════════════════════
 *
 * Routes each task to the cheapest capable provider, falling through the
 * chain when a provider has no key or errors.
 *
 * GLOBAL RULE 10: domain reasoning is Claude-only. brief/qualify/plan/map/
 * outreach/campaign/intel/persuade/forge-doc have NO fallback chain — if
 * ANTHROPIC_API_KEY is absent they fail loudly rather than silently
 * degrading the methodology to a cheaper model.
 */

export type Provider = 'groq' | 'gemini' | 'claude';

export type TaskKind =
  // Inherited from The Hub
  | 'summarize' // Feed item summaries → Groq (free, fast)
  | 'synthesize' // Cross-item synthesis → Claude
  | 'ask' // General questions → Claude
  // PowerDeal-specific
  | 'classify' // Tier classification, signal tagging → Groq
  | 'market-watch' // Market signal processing → Gemini
  | 'qualify' // Deal qualification (MEDDPICC) → Claude (domain)
  | 'brief' // Executive brief generation → Claude (domain)
  | 'plan' // Account plan → Claude (domain)
  | 'map-gen' // MAP generation → Claude (domain)
  | 'outreach' // Outreach plan → Claude (domain)
  | 'campaign' // Campaign mode → Claude (domain)
  | 'intel' // Strategic read / intelligence → Claude (domain)
  | 'business-case' // Champion-facing business case → Claude (domain)
  | 'objections' // Champion objection scripts → Claude (domain)
  | 'no-decision-card' // No-decision card, per deal → Claude (domain)
  | 'pricing-defense-card' // Pricing defense vs one posture → Claude (domain)
  | 'meeting-prep' // Persona + stage-aware meeting brief → Claude (domain)
  | 'persuade' // Persuasion enhancement → Claude (domain)
  | 'forge-doc' // Document generation (PPTX/DOCX) → Claude (domain)
  | 'recap'; // Weekly recap → Claude Haiku (structured)

/** Tasks whose output quality IS the product. No non-Claude fallback. */
export const DOMAIN_TASKS: readonly TaskKind[] = [
  'qualify',
  'brief',
  'plan',
  'map-gen',
  'outreach',
  'campaign',
  'intel',
  'persuade',
  'forge-doc',
  'business-case',
  'objections',
  'no-decision-card',
  'pricing-defense-card',
  'meeting-prep',
];

export function isDomainTask(task: TaskKind): boolean {
  return DOMAIN_TASKS.includes(task);
}

const ORDER: Record<TaskKind, Provider[]> = {
  summarize: ['groq', 'gemini', 'claude'],
  classify: ['groq', 'gemini', 'claude'],
  'market-watch': ['gemini', 'groq', 'claude'],
  recap: ['claude', 'gemini', 'groq'],
  synthesize: ['claude', 'gemini', 'groq'],
  ask: ['claude', 'gemini', 'groq'],
  // Domain reasoning — Claude or nothing.
  qualify: ['claude'],
  brief: ['claude'],
  plan: ['claude'],
  'map-gen': ['claude'],
  outreach: ['claude'],
  campaign: ['claude'],
  intel: ['claude'],
  'business-case': ['claude'],
  objections: ['claude'],
  'no-decision-card': ['claude'],
  'pricing-defense-card': ['claude'],
  'meeting-prep': ['claude'],
  persuade: ['claude'],
  'forge-doc': ['claude'],
};

/**
 * Claude model per task. The spec calls for Haiku on cheap structured work and
 * Sonnet on domain reasoning; these are the current IDs for those tiers.
 * Override per-deployment with ANTHROPIC_MODEL_* env vars.
 */
const CHEAP_MODEL = process.env.ANTHROPIC_MODEL_CHEAP ?? 'claude-haiku-4-5';
const QUALITY_MODEL = process.env.ANTHROPIC_MODEL_QUALITY ?? 'claude-sonnet-5';

function claudeModelFor(task: TaskKind): string {
  switch (task) {
    case 'summarize':
    case 'classify':
    case 'recap':
      return CHEAP_MODEL;
    default:
      return QUALITY_MODEL;
  }
}

/**
 * Haiku 4.5 rejects `output_config.effort`, and only the Sonnet/Opus 5 tier
 * takes adaptive thinking. Gate both on the model family rather than the task.
 */
function isFrontierModel(model: string): boolean {
  return /^claude-(opus|sonnet|fable)-\d/.test(model);
}

export interface RouteResult {
  text: string;
  provider: Provider;
  model: string;
}

export interface StreamChunk {
  type: 'text' | 'meta' | 'error';
  text?: string;
  provider?: Provider;
  model?: string;
  message?: string;
}

// ── Provider availability ────────────────────────────────────────

export function providerConfigured(p: Provider): boolean {
  switch (p) {
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'gemini':
      return Boolean(process.env.GOOGLE_AI_KEY);
    case 'claude':
      return Boolean(process.env.ANTHROPIC_API_KEY);
  }
}

/** Which providers this deployment can actually reach. */
export function availableProviders(): Provider[] {
  return (['groq', 'gemini', 'claude'] as Provider[]).filter(providerConfigured);
}

export function canRun(task: TaskKind): boolean {
  return ORDER[task].some(providerConfigured);
}

/** The routing chain for a task, unfiltered. Reported, never mutated. */
export function chainFor(task: TaskKind): Provider[] {
  return [...ORDER[task]];
}

/**
 * Every model id this deployment is configured to call, with the env var that
 * changes it and the tasks that reach it.
 *
 * Derived from ORDER rather than listed by hand: a task added to the routing
 * table appears here automatically, so the health surface cannot fall behind
 * the thing it reports on. The Claude row uses CHEAP_MODEL — it is the tier at
 * the END of the summarize/classify chains, which is precisely the model whose
 * absence would leave those tasks with nothing.
 */
export function configuredModels(): {
  provider: Provider;
  model: string;
  envVar: string;
  tasks: TaskKind[];
}[] {
  const tasksFor = (p: Provider) =>
    (Object.keys(ORDER) as TaskKind[]).filter((t) => ORDER[t].includes(p));

  return [
    { provider: 'groq', model: GROQ_MODEL, envVar: 'GROQ_MODEL', tasks: tasksFor('groq') },
    { provider: 'gemini', model: GEMINI_MODEL, envVar: 'GEMINI_MODEL', tasks: tasksFor('gemini') },
    {
      provider: 'claude',
      model: CHEAP_MODEL,
      envVar: 'ANTHROPIC_MODEL_CHEAP',
      tasks: tasksFor('claude').filter((t) => claudeModelFor(t) === CHEAP_MODEL),
    },
    {
      provider: 'claude',
      model: QUALITY_MODEL,
      envVar: 'ANTHROPIC_MODEL_QUALITY',
      tasks: tasksFor('claude').filter((t) => claudeModelFor(t) === QUALITY_MODEL),
    },
  ];
}

// ── Anthropic ───────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

/**
 * Build the system block. When `promptCache` is set the system prefix is
 * marked cacheable — the PowerDeal brain is ~large and identical on every
 * domain call, so this cuts repeat input cost substantially.
 *
 * Caching is a prefix match: the system text must be byte-identical across
 * calls. Never interpolate a timestamp or deal ID into it — per-call context
 * belongs in the user turn.
 */
function buildSystem(input: ChatInput): Anthropic.TextBlockParam[] {
  const block: Anthropic.TextBlockParam = { type: 'text', text: input.system };
  if (input.promptCache !== false) {
    block.cache_control = { type: 'ephemeral' };
  }
  return [block];
}

function buildParams(
  task: TaskKind,
  input: ChatInput,
): Anthropic.MessageCreateParamsStreaming {
  const model = claudeModelFor(task);
  const params: Anthropic.MessageCreateParamsStreaming = {
    model,
    // Streaming means we can afford real headroom; on frontier models
    // max_tokens caps thinking + text together.
    max_tokens: input.maxTokens ?? 4000,
    system: buildSystem(input),
    messages: [{ role: 'user', content: input.user }],
    stream: true,
  };

  if (isFrontierModel(model)) {
    // Adaptive thinking + effort are frontier-only. Sonnet 5 also rejects
    // temperature/top_p/top_k outright, so we never send sampling params.
    params.thinking = { type: 'adaptive' };
    params.output_config = { effort: isDomainTask(task) ? 'high' : 'medium' };
  }

  return params;
}

async function* streamClaude(
  task: TaskKind,
  input: ChatInput,
): AsyncGenerator<StreamChunk> {
  const model = claudeModelFor(task);
  const stream = getAnthropic().messages.stream(buildParams(task, input));

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield { type: 'text', text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    yield {
      type: 'error',
      message: 'The model declined this request.',
    };
    return;
  }
  yield { type: 'meta', provider: 'claude', model };
}

// ── Groq (OpenAI-compatible) ────────────────────────────────────

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function* streamGroq(input: ChatInput): AsyncGenerator<StreamChunk> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: input.maxTokens ?? 1200,
      stream: true,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Groq ${res.status}: ${await res.text().catch(() => '')}`);
  }

  yield* parseSseDeltas(res.body, (json) => {
    const frame = json as {
      choices?: { delta?: { content?: string } }[];
    };
    return frame.choices?.[0]?.delta?.content;
  });
  yield { type: 'meta', provider: 'groq', model: GROQ_MODEL };
}

// ── Gemini ──────────────────────────────────────────────────────

/**
 * ⚠️ `gemini-2.0-flash` WAS RETIRED and this default replaces it.
 *
 * Every call returned a hard 404 — "no longer available". Not a transient
 * failure and not something a retry fixes: the identifier is gone from
 * Google's API. The whole `market-watch` chain led with it and `summarize`
 * fell through to it, so the first cheap tier and the second were dead at the
 * same time.
 *
 * THE VALUE BELOW IS A CLAIM THIS REPO CANNOT PROVE. Which model ids exist is
 * a fact about Google's servers, and no test here can reach them. It is
 * asserted at RUNTIME instead, by `/api/models/health`, which asks the live
 * API whether this exact string resolves and — if it does not — prints what
 * the provider currently offers so the replacement is a copy-paste rather than
 * an investigation. Override with `GEMINI_MODEL` without touching this file.
 *
 * Nothing auto-selects a substitute. A model swapped in silently is a quality
 * change nobody approved.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

async function* streamGemini(input: ChatInput): AsyncGenerator<StreamChunk> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent` +
    `?alt=sse&key=${process.env.GOOGLE_AI_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
      generationConfig: { maxOutputTokens: input.maxTokens ?? 1500 },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`);
  }

  yield* parseSseDeltas(res.body, (json) => {
    const frame = json as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return frame.candidates?.[0]?.content?.parts?.[0]?.text;
  });
  yield { type: 'meta', provider: 'gemini', model: GEMINI_MODEL };
}

/** Shared SSE line reader for the OpenAI/Gemini-shaped streams. */
async function* parseSseDeltas(
  body: ReadableStream<Uint8Array>,
  pick: (json: unknown) => string | undefined,
): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const text = pick(JSON.parse(payload) as unknown);
          if (text) yield { type: 'text', text };
        } catch {
          // Partial or malformed frame — skip it rather than kill the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Public API ──────────────────────────────────────────────────

export class NoProviderError extends Error {
  constructor(public readonly task: TaskKind) {
    super(
      isDomainTask(task)
        ? `ANTHROPIC_API_KEY required — "${task}" is a domain-reasoning task and will not be routed to a cheaper model.`
        : `No AI provider configured for task "${task}".`,
    );
    this.name = 'NoProviderError';
  }
}

/** An empty completion is a failure, not a summary. See routeStream. */
export class EmptyCompletionError extends Error {
  constructor(provider: Provider) {
    super(`${provider} returned 200 with no text.`);
    this.name = 'EmptyCompletionError';
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Stream a task through the routing chain. Falls through to the next provider
 * when one is unconfigured, throws, or answers with nothing.
 *
 * EVERY FALL-THROUGH IS RECORDED. A call that succeeded after burning through
 * two dead providers used to look identical to one that succeeded on the first
 * try — the summary appeared, the sweep reported success, and the fact that
 * both cheap tiers were down existed only as a `console.warn` nobody reads.
 * The winner and the losers are both written to `models:last`.
 *
 * AN EMPTY RESPONSE IS A FAILURE. A provider that answers 200 with an empty
 * body used to end the loop as a success, returning `text: ''`. Downstream,
 * `''` is not `NOT RELEVANT` and not null, so it stored as a summary that is a
 * blank string — a silent-direction failure of the exact kind this build keeps
 * finding. It now throws and falls through like any other failure.
 */
export async function* routeStream(
  task: TaskKind,
  input: ChatInput,
): AsyncGenerator<StreamChunk> {
  const chain = ORDER[task].filter(providerConfigured);
  if (chain.length === 0) throw new NoProviderError(task);

  let lastError: unknown = null;
  const fellThrough: { provider: Provider; error: string }[] = [];

  for (const provider of chain) {
    let emitted = false;
    try {
      const gen =
        provider === 'claude'
          ? streamClaude(task, input)
          : provider === 'groq'
            ? streamGroq(input)
            : streamGemini(input);

      let model = '';
      let declined = false;
      for await (const chunk of gen) {
        if (chunk.type === 'text' && chunk.text) emitted = true;
        if (chunk.type === 'meta' && chunk.model) model = chunk.model;
        // A refusal is an ANSWER, not an empty response. Falling through to
        // another provider to get a different verdict on the same request is
        // shopping for a yes, and on a domain task there is no other provider
        // to shop at — it would surface as "returned 200 with no text", which
        // is true and tells the reader nothing.
        if (chunk.type === 'error') declined = true;
        yield chunk;
      }
      if (!emitted && !declined) throw new EmptyCompletionError(provider);

      void recordResolution(task, {
        provider,
        model,
        at: new Date().toISOString(),
        ok: true,
        fellThrough,
      });
      return;
    } catch (err) {
      lastError = err;
      // Once text has reached the client we can't silently restart on another
      // provider — the output would be spliced mid-sentence.
      if (emitted) {
        void recordResolution(task, {
          provider,
          model: '',
          at: new Date().toISOString(),
          ok: false,
          fellThrough,
          error: `interrupted mid-stream: ${messageOf(err)}`,
        });
        yield {
          type: 'error',
          message: `Stream interrupted (${provider}).`,
        };
        return;
      }
      fellThrough.push({ provider, error: messageOf(err).slice(0, 300) });
      console.warn(`[model-routing] ${provider} failed for "${task}":`, err);
    }
  }

  // Nobody answered. Recorded against the LAST provider tried, with the whole
  // fall-through chain attached — "all three failed" is the finding, and which
  // one failed last is the least interesting part of it.
  void recordResolution(task, {
    provider: chain[chain.length - 1],
    model: '',
    at: new Date().toISOString(),
    ok: false,
    fellThrough: fellThrough.slice(0, -1),
    error: messageOf(lastError ?? new Error(`All providers failed for task "${task}".`)).slice(0, 300),
  });

  throw lastError instanceof Error
    ? lastError
    : new Error(`All providers failed for task "${task}".`);
}

/** Buffered convenience wrapper for non-UI callers (cron, cache fills). */
export async function route(
  task: TaskKind,
  input: ChatInput,
): Promise<RouteResult> {
  let text = '';
  let provider: Provider = 'claude';
  let model = '';

  for await (const chunk of routeStream(task, input)) {
    if (chunk.type === 'text' && chunk.text) text += chunk.text;
    if (chunk.type === 'meta') {
      provider = chunk.provider ?? provider;
      model = chunk.model ?? model;
    }
    if (chunk.type === 'error' && !text) {
      throw new Error(chunk.message ?? 'Model call failed.');
    }
  }

  return { text: text.trim(), provider, model };
}

/** Wrap a chunk generator as an SSE Response body for a route handler. */
export function toSseResponse(gen: AsyncGenerator<StreamChunk>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Model call failed.';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`),
        );
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
