import Anthropic from '@anthropic-ai/sdk';
import type { ChatInput } from '@/lib/types';

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

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

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

/**
 * Stream a task through the routing chain. Falls through to the next provider
 * when one is unconfigured or throws before emitting any text.
 */
export async function* routeStream(
  task: TaskKind,
  input: ChatInput,
): AsyncGenerator<StreamChunk> {
  const chain = ORDER[task].filter(providerConfigured);
  if (chain.length === 0) throw new NoProviderError(task);

  let lastError: unknown = null;

  for (const provider of chain) {
    let emitted = false;
    try {
      const gen =
        provider === 'claude'
          ? streamClaude(task, input)
          : provider === 'groq'
            ? streamGroq(input)
            : streamGemini(input);

      for await (const chunk of gen) {
        if (chunk.type === 'text') emitted = true;
        yield chunk;
      }
      return;
    } catch (err) {
      lastError = err;
      // Once text has reached the client we can't silently restart on another
      // provider — the output would be spliced mid-sentence.
      if (emitted) {
        yield {
          type: 'error',
          message: `Stream interrupted (${provider}).`,
        };
        return;
      }
      console.warn(`[model-routing] ${provider} failed for "${task}":`, err);
    }
  }

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
