/**
 * Minimal Anthropic client for edge functions.
 *
 * Raw fetch rather than the SDK — Deno edge functions keep a tight bundle, and
 * the sweeps need exactly one non-streaming call shape.
 */

export interface CallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Defaults to Haiku: sweeps are structured triage, not domain reasoning. */
  model?: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

export function anthropicConfigured(): boolean {
  return Boolean(Deno.env.get('ANTHROPIC_API_KEY'));
}

export async function callClaude(opts: CallOptions): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: [
        {
          type: 'text',
          text: opts.system,
          // The identity spine is identical on every call — cache it.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: opts.user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const json = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };

  if (json.stop_reason === 'refusal') {
    throw new Error('The model declined this request.');
  }

  return (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
}

/** Parse a JSON array out of a model response, tolerating markdown fences. */
export function parseJsonArray<T>(text: string): T[] {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Last resort: grab the outermost bracketed span.
    const match = /\[[\s\S]*\]/.exec(cleaned);
    if (!match) return [];
    try {
      return JSON.parse(match[0]) as T[];
    } catch {
      return [];
    }
  }
}
