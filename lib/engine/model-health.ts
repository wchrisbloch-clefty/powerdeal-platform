import type { Provider, TaskKind } from './model-routing';

/**
 * ═══════════════════════════════════════════════════════════════
 * MODEL HEALTH — asking the live API whether the models still exist.
 * ═══════════════════════════════════════════════════════════════
 *
 * WHAT HAPPENED. `gemini-2.0-flash` was retired by Google. Every call returned
 * a hard 404 — "no longer available". At the same hour Groq returned 429 on
 * `llama-3.3-70b-versatile`: 99,521 of 100,000 free-tier tokens spent. Both
 * cheap tiers down, one of them permanently, and the first place either
 * appeared was a log line.
 *
 * NO TEST IN THIS REPO COULD HAVE CAUGHT IT. A provider deprecating a model is
 * a change on someone else's server. The suite can prove that the routing
 * chain falls through correctly; it cannot prove the model at the end of that
 * chain still answers. That is checklist rule 16 — some checks only exist at
 * runtime — extended past the database to external dependencies. Same shape as
 * the schema drift check: the repo agreed with itself, and the world disagreed.
 *
 * ══ THE DISTINCTION THAT MATTERS ══
 *
 * A dead model and a spent quota look identical from inside the app: the call
 * fails, the chain falls through, the summary is missing. They are completely
 * different problems.
 *
 *   404 → RETIRED.   Gone forever. Waiting does nothing. A human picks a
 *                    replacement and changes an env var.
 *   429 → THROTTLED. Comes back by itself, on the provider's clock.
 *   401 → the key.   Nothing to do with the model.
 *
 * So the report never says "failing". It says which of those it is, and what
 * the operator is supposed to do about it.
 *
 * ══ IT NEVER PICKS A REPLACEMENT ══
 *
 * When a model 404s this module lists what the provider DOES offer and stops
 * there. It does not select one, does not fall back a tier, does not write an
 * env var. Auto-substituting a model is a silent downgrade of output quality
 * that nothing in the product would surface — the same class of nondeterminism
 * we removed from knowledge selection. Detection in code, resolution human.
 *
 * ══ WHY A METADATA GET AND NOT A REAL COMPLETION ══
 *
 * A one-token completion would cost money and, on a throttled provider, would
 * itself 429 — reporting "throttled" for a model that may also be retired,
 * hiding the permanent failure behind the temporary one. The metadata endpoint
 * answers exactly one question: does this identifier exist? Quota state comes
 * from the other half of this surface, the record of what the last REAL call
 * resolved to (lib/engine/model-log.ts). Neither half is sufficient alone,
 * which is why both are reported and not folded together.
 */

export type ModelStatus =
  | 'resolves'
  | 'retired'
  | 'throttled'
  | 'unauthorized'
  | 'unreachable'
  | 'not-configured';

/** What the operator does next. The whole point of the status split. */
export type ModelAction =
  | 'none'
  | 'update-the-model-id'
  | 'wait-for-quota'
  | 'fix-the-key'
  | 'retry-later'
  | 'configure-a-key';

export interface ModelProbe {
  provider: Provider;
  /** The model id this deployment is configured to use. */
  model: string;
  /** The env var that changes it. Printed so resolution needs no grep. */
  envVar: string;
  status: ModelStatus;
  action: ModelAction;
  /** HTTP status from the metadata endpoint, or null if the call never landed. */
  httpStatus: number | null;
  /** Verbatim head of the provider's response. Evidence, not paraphrase. */
  detail: string;
  /**
   * Populated ONLY when `status === 'retired'`. What the provider currently
   * offers, so choosing a replacement is a read rather than an investigation.
   * Never applied automatically.
   */
  alternatives: string[];
  /** Which routed tasks reach this provider at all. */
  tasks: TaskKind[];
}

// ── Pure classification ─────────────────────────────────────────

const ACTION_FOR: Record<ModelStatus, ModelAction> = {
  resolves: 'none',
  retired: 'update-the-model-id',
  throttled: 'wait-for-quota',
  unauthorized: 'fix-the-key',
  unreachable: 'retry-later',
  'not-configured': 'configure-a-key',
};

export function actionFor(status: ModelStatus): ModelAction {
  return ACTION_FOR[status];
}

/**
 * Map an HTTP response to a status.
 *
 * `httpStatus === null` means the request never completed — DNS, TLS, timeout.
 * That is `unreachable`, NOT retired: a model we could not ask about is not a
 * model we know is gone, and telling someone to change a model id because
 * their network blipped sends them to fix the wrong thing.
 */
export function classifyProbe(httpStatus: number | null, body: string): ModelStatus {
  if (httpStatus === null) return 'unreachable';
  if (httpStatus >= 200 && httpStatus < 300) return 'resolves';
  if (httpStatus === 404) return 'retired';
  if (httpStatus === 429) return 'throttled';
  if (httpStatus === 401 || httpStatus === 403) return 'unauthorized';

  // Some providers answer a request for an unknown model with 400 rather than
  // 404. Read the body before calling it a server fault, because "retry later"
  // on a model that no longer exists is advice that never comes good.
  if (httpStatus === 400 && /not found|not exist|unknown model|is not supported/i.test(body)) {
    return 'retired';
  }
  return 'unreachable';
}

/** One line an operator can act on without opening the JSON. */
export function explain(p: ModelProbe): string {
  switch (p.status) {
    case 'resolves':
      return `${p.provider}: ${p.model} resolves.`;
    case 'retired':
      return (
        `${p.provider}: ${p.model} is GONE (${p.httpStatus}). Retrying will never work — ` +
        `set ${p.envVar} to a current model id. ` +
        (p.alternatives.length
          ? `Currently offered: ${p.alternatives.slice(0, 8).join(', ')}.`
          : `The provider returned no alternatives list.`)
      );
    case 'throttled':
      return `${p.provider}: ${p.model} exists but is rate-limited (429). This clears on the provider's clock — no change needed here.`;
    case 'unauthorized':
      return `${p.provider}: ${p.httpStatus} on the key, not the model. ${p.model} was never checked.`;
    case 'unreachable':
      return `${p.provider}: could not reach the API to ask about ${p.model}${p.httpStatus ? ` (${p.httpStatus})` : ''}. Unknown, not healthy.`;
    case 'not-configured':
      return `${p.provider}: no key configured, so it is never in a routing chain. Not a fault.`;
  }
}

/**
 * Is anything actually wrong?
 *
 * `throttled` counts. It is temporary, but on the day both cheap tiers went
 * down simultaneously "temporary" was the whole outage — and an operator who
 * sees green while summaries are silently missing learns nothing.
 *
 * `not-configured` does NOT count. A provider with no key is a deployment
 * choice, not a failure, and colouring it red trains people to ignore red.
 */
export function isDegraded(p: ModelProbe): boolean {
  return p.status !== 'resolves' && p.status !== 'not-configured';
}

/**
 * The single worst thing on the board, for a one-line header.
 *
 * Ordered by how permanent the problem is, not how loud it is: a retired model
 * outranks a throttled one because one of them fixes itself.
 */
const SEVERITY: ModelStatus[] = [
  'retired',
  'unauthorized',
  'unreachable',
  'throttled',
  'not-configured',
  'resolves',
];

export function worstStatus(probes: ModelProbe[]): ModelStatus {
  for (const s of SEVERITY) {
    if (probes.some((p) => p.status === s)) return s;
  }
  return 'resolves';
}

// ── Live probes ─────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 8000;

interface RawResponse {
  httpStatus: number | null;
  body: string;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return { httpStatus: res.status, body: (await res.text().catch(() => '')).slice(0, 400) };
  } catch (err) {
    // Never rethrown. A health surface that can crash is a health surface that
    // reports nothing on the day it matters most.
    return { httpStatus: null, body: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** What the provider currently offers. Read only when something is retired. */
async function listModels(provider: Provider): Promise<string[]> {
  try {
    if (provider === 'gemini') {
      const { body, httpStatus } = await get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_AI_KEY}&pageSize=200`,
      );
      if (httpStatus !== 200) return [];
      const parsed = JSON.parse(body) as { models?: { name?: string }[] };
      return (parsed.models ?? [])
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean);
    }
    if (provider === 'groq') {
      const { body, httpStatus } = await get('https://api.groq.com/openai/v1/models', {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      });
      if (httpStatus !== 200) return [];
      const parsed = JSON.parse(body) as { data?: { id?: string }[] };
      return (parsed.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    }
    const { body, httpStatus } = await get('https://api.anthropic.com/v1/models?limit=100', {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    });
    if (httpStatus !== 200) return [];
    const parsed = JSON.parse(body) as { data?: { id?: string }[] };
    return (parsed.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  } catch {
    // A truncated body fails JSON.parse. An empty alternatives list reads as
    // "the provider returned no alternatives", which is honest — inventing one
    // is the failure mode this whole module exists to prevent.
    return [];
  }
}

/**
 * The metadata endpoint per provider. GET, no tokens, no cost.
 *
 * NOTE ON GROQ: `/models/{id}` answers 200 for a model that exists even while
 * chat completions on it are 429ing on daily quota. That is not a flaw in the
 * probe — it is the separation being made on purpose. "The model exists" and
 * "you may call it right now" are different facts and the surface reports both
 * from different sources.
 */
async function probeOne(provider: Provider, model: string): Promise<RawResponse> {
  switch (provider) {
    case 'gemini':
      return get(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
          `?key=${process.env.GOOGLE_AI_KEY}`,
      );
    case 'groq':
      return get(`https://api.groq.com/openai/v1/models/${encodeURIComponent(model)}`, {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      });
    case 'claude':
      return get(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      });
  }
}

export interface ConfiguredModel {
  provider: Provider;
  model: string;
  envVar: string;
  tasks: TaskKind[];
}

export async function probeModel(
  entry: ConfiguredModel,
  configured: boolean,
): Promise<ModelProbe> {
  if (!configured) {
    return {
      ...entry,
      status: 'not-configured',
      action: actionFor('not-configured'),
      httpStatus: null,
      detail: 'No API key set for this provider.',
      alternatives: [],
    };
  }

  const { httpStatus, body } = await probeOne(entry.provider, entry.model);
  const status = classifyProbe(httpStatus, body);

  return {
    ...entry,
    status,
    action: actionFor(status),
    httpStatus,
    detail: body.slice(0, 300),
    alternatives: status === 'retired' ? await listModels(entry.provider) : [],
  };
}
