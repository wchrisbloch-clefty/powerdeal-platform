import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  classifyProbe,
  actionFor,
  explain,
  isDegraded,
  worstStatus,
  type ModelProbe,
  type ModelStatus,
} from '@/lib/engine/model-health';
import {
  shouldWrite,
  failingProviders,
  isStale,
  type ModelLog,
  type Resolution,
} from '@/lib/engine/model-log';

/**
 * TWO PROVIDERS DIED ON THE SAME AFTERNOON AND A LOG LINE WAS THE ONLY RECORD.
 *
 * Gemini retired `gemini-2.0-flash` — hard 404, gone permanently. Groq hit
 * 99,521 of 100,000 free-tier tokens — 429, back tomorrow. Identical from
 * inside the app: the call fails, the chain falls through, the summary is
 * missing. Completely different problems.
 *
 * Every test below exercises a FAILING case. A probe that has only ever seen a
 * live model is a probe that proves nothing.
 */

const probe = (over: Partial<ModelProbe> = {}): ModelProbe => ({
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  envVar: 'GEMINI_MODEL',
  status: 'resolves',
  action: 'none',
  httpStatus: 200,
  detail: '',
  alternatives: [],
  tasks: ['summarize'],
  ...over,
});

describe('a dead model and a spent quota are not the same finding', () => {
  it('404 is retired — the state that never fixes itself', () => {
    expect(classifyProbe(404, 'is not found for API version v1beta')).toBe('retired');
  });

  it('429 is throttled — the state that does', () => {
    expect(classifyProbe(429, 'rate limit reached for llama-3.3-70b-versatile')).toBe('throttled');
  });

  it('routes them to OPPOSITE actions, which is the whole point', () => {
    // The user's words: "Needs a model update, not a retry."
    expect(actionFor(classifyProbe(404, ''))).toBe('update-the-model-id');
    expect(actionFor(classifyProbe(429, ''))).toBe('wait-for-quota');
  });

  it('401 and 403 blame the key, not the model', () => {
    expect(classifyProbe(401, '')).toBe('unauthorized');
    expect(classifyProbe(403, '')).toBe('unauthorized');
    expect(actionFor('unauthorized')).toBe('fix-the-key');
  });

  it('200 resolves', () => {
    expect(classifyProbe(200, '{"name":"models/gemini-2.5-flash"}')).toBe('resolves');
    expect(classifyProbe(204, '')).toBe('resolves');
  });
});

describe('a request that never landed is unknown, not healthy and not dead', () => {
  it('null status is unreachable — NOT retired', () => {
    // Telling someone to change a model id because their DNS blipped sends
    // them to fix a thing that is not broken.
    expect(classifyProbe(null, 'fetch failed')).toBe('unreachable');
    expect(classifyProbe(null, 'The operation was aborted')).not.toBe('retired');
  });

  it('a 500 is unreachable, not retired', () => {
    expect(classifyProbe(500, 'internal error')).toBe('unreachable');
  });

  it('unreachable says so out loud rather than reading as fine', () => {
    expect(explain(probe({ status: 'unreachable', httpStatus: null }))).toContain(
      'Unknown, not healthy',
    );
  });
});

describe('a 400 that means "no such model" is read as retired', () => {
  it('reads the body, because not every provider answers 404', () => {
    expect(classifyProbe(400, 'The model `llama-3.1-70b` does not exist')).toBe('retired');
    expect(classifyProbe(400, 'model_not_found: unknown model')).toBe('retired');
    expect(classifyProbe(400, 'llama-guard is not supported for this endpoint')).toBe('retired');
  });

  it('but a plain 400 is NOT retired — that would send people to change a working id', () => {
    expect(classifyProbe(400, 'malformed request body')).toBe('unreachable');
  });
});

describe('the explanation tells the operator what to do', () => {
  it('a retired model names the env var and says retrying is pointless', () => {
    const line = explain(
      probe({ status: 'retired', httpStatus: 404, alternatives: ['gemini-2.5-flash'] }),
    );
    expect(line).toContain('GEMINI_MODEL');
    expect(line).toContain('never work');
    expect(line).toContain('gemini-2.5-flash');
  });

  it('a retired model with no alternatives list SAYS the list was empty', () => {
    // The empty case is the one that would otherwise read as "no replacements
    // exist", which is a claim this code cannot make.
    const line = explain(probe({ status: 'retired', httpStatus: 404, alternatives: [] }));
    expect(line).toContain('no alternatives list');
    expect(line).not.toMatch(/Currently offered/);
  });

  it('a throttled model explicitly says NOT to change anything', () => {
    const line = explain(probe({ provider: 'groq', status: 'throttled', httpStatus: 429 }));
    expect(line).toContain('no change needed');
  });

  it('an unauthorized probe admits the model was never actually checked', () => {
    expect(explain(probe({ status: 'unauthorized', httpStatus: 401 }))).toContain(
      'never checked',
    );
  });
});

describe('what counts as degraded', () => {
  it('throttled counts — on the day it happened, temporary WAS the outage', () => {
    expect(isDegraded(probe({ status: 'throttled' }))).toBe(true);
  });

  it('retired counts', () => {
    expect(isDegraded(probe({ status: 'retired' }))).toBe(true);
  });

  it('not-configured does NOT — colouring a deployment choice red trains people to ignore red', () => {
    expect(isDegraded(probe({ status: 'not-configured' }))).toBe(false);
  });

  it('resolves does not', () => {
    expect(isDegraded(probe({ status: 'resolves' }))).toBe(false);
  });
});

describe('the headline shows the most PERMANENT problem, not the loudest', () => {
  it('retired outranks throttled — one of them fixes itself', () => {
    expect(
      worstStatus([probe({ status: 'throttled' }), probe({ status: 'retired' })]),
    ).toBe('retired');
  });

  it('a real failure outranks not-configured', () => {
    expect(
      worstStatus([probe({ status: 'not-configured' }), probe({ status: 'throttled' })]),
    ).toBe('throttled');
  });

  it('all clear reports resolves', () => {
    expect(worstStatus([probe(), probe()])).toBe('resolves');
  });

  it('an EMPTY probe list does not report a false alarm', () => {
    expect(worstStatus([])).toBe('resolves');
  });

  it('every status is reachable through the severity ladder', () => {
    // Rule 10 in spirit: a ladder with a rung nothing lands on is a rung that
    // silently reorders the day someone adds a status above it.
    const all: ModelStatus[] = [
      'retired',
      'unauthorized',
      'unreachable',
      'throttled',
      'not-configured',
      'resolves',
    ];
    for (const s of all) {
      expect(worstStatus([probe({ status: s })])).toBe(s);
    }
  });
});

// ── The record of what really happened ──────────────────────────

const resolution = (over: Partial<Resolution> = {}): Resolution => ({
  provider: 'claude',
  model: 'claude-haiku-4-5',
  at: new Date().toISOString(),
  ok: true,
  fellThrough: [],
  ...over,
});

describe('a success that burned two dead providers is not a clean success', () => {
  it('the fall-through list is part of the signature, so its first appearance always writes', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    const t0 = 1_000_000;
    expect(shouldWrite('summarize', resolution(), t0, memo)).toBe(true);
    // Same winner, same model — but it now fell through Groq to get there.
    // Suppressing this would hide the first sighting of the outage.
    expect(
      shouldWrite(
        'summarize',
        resolution({ fellThrough: [{ provider: 'groq', error: 'Groq 429' }] }),
        t0 + 1000,
        memo,
      ),
    ).toBe(true);
  });

  it('an unchanged resolution inside the window is suppressed', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    const t0 = 1_000_000;
    shouldWrite('summarize', resolution(), t0, memo);
    expect(shouldWrite('summarize', resolution(), t0 + 60_000, memo)).toBe(false);
  });

  it('but it is rewritten once the window elapses, so the timestamp stays meaningful', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    const t0 = 1_000_000;
    shouldWrite('summarize', resolution(), t0, memo);
    expect(shouldWrite('summarize', resolution(), t0 + 11 * 60_000, memo)).toBe(true);
  });

  it('a provider change always writes', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    shouldWrite('summarize', resolution({ provider: 'groq' }), 0, memo);
    expect(shouldWrite('summarize', resolution({ provider: 'claude' }), 100, memo)).toBe(true);
  });

  it('success turning into failure always writes', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    shouldWrite('summarize', resolution(), 0, memo);
    expect(
      shouldWrite('summarize', resolution({ ok: false, error: 'all providers failed' }), 100, memo),
    ).toBe(true);
  });

  it('tasks are tracked independently — a quiet one cannot mask a noisy one', () => {
    const memo = new Map<string, { signature: string; at: number }>();
    shouldWrite('summarize', resolution(), 0, memo);
    expect(shouldWrite('classify', resolution(), 100, memo)).toBe(true);
  });
});

describe('failingProviders surfaces what the last real run hit', () => {
  it('reports a provider that was fallen through even though the task SUCCEEDED', () => {
    // This is the case that was invisible: the summary appeared, the sweep
    // reported success, and both cheap tiers were down.
    const log: ModelLog = {
      summarize: resolution({
        fellThrough: [
          { provider: 'groq', error: 'Groq 429: rate limit' },
          { provider: 'gemini', error: 'Gemini 404: no longer available' },
        ],
      }),
    };
    const failing = failingProviders(log);
    expect(failing.map((f) => f.provider).sort()).toEqual(['gemini', 'groq']);
  });

  it('deduplicates the same failure across tasks — one fact about Groq, not four', () => {
    const fell = [{ provider: 'groq' as const, error: 'Groq 429' }];
    const log: ModelLog = {
      summarize: resolution({ fellThrough: fell }),
      classify: resolution({ fellThrough: fell }),
      'market-watch': resolution({ fellThrough: fell }),
    };
    expect(failingProviders(log)).toHaveLength(1);
  });

  it('includes the terminal failure when NOBODY answered', () => {
    const log: ModelLog = {
      summarize: resolution({
        ok: false,
        provider: 'claude',
        error: 'Claude 529 overloaded',
        fellThrough: [{ provider: 'groq', error: 'Groq 429' }],
      }),
    };
    expect(failingProviders(log).map((f) => f.provider).sort()).toEqual(['claude', 'groq']);
  });

  it('a genuinely clean log reports nothing', () => {
    expect(failingProviders({ summarize: resolution() })).toEqual([]);
  });

  it('an empty log reports nothing rather than throwing', () => {
    expect(failingProviders({})).toEqual([]);
  });
});

describe('a resolution has an age, because "last resolved to Claude" is meaningless without one', () => {
  it('a fresh record is not stale', () => {
    expect(isStale(resolution())).toBe(false);
  });

  it('a record from last month is', () => {
    const old = resolution({ at: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() });
    expect(isStale(old)).toBe(true);
  });

  it('no record at all is not "stale" — it is absent, and those read differently', () => {
    expect(isStale(null)).toBe(false);
  });
});

// ── The dead model must be gone, and the fix must be checkable ──

describe('the retired Gemini model is not still wired in as a default', () => {
  it('gemini-2.0-flash is no longer the fallback value', async () => {
    const src = await readFile('lib/engine/model-routing.ts', 'utf8');
    // Strip comments: the file EXPLAINS the retirement by name, and asserting
    // on the bare substring would fail on its own explanation. Same lesson as
    // the feed-health probe test.
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('gemini-2.0-flash');
    expect(code).toContain("process.env.GEMINI_MODEL ??");
  });

  it('the retirement is recorded where the next reader will be', async () => {
    const src = await readFile('lib/engine/model-routing.ts', 'utf8');
    expect(src).toContain('gemini-2.0-flash');
    expect(src).toMatch(/RETIRED/);
  });

  it('GEMINI_MODEL is documented as the override, so nobody edits the file to change it', async () => {
    const env = await readFile('.env.example', 'utf8');
    expect(env).toContain('GEMINI_MODEL');
  });
});

describe('an empty completion is a failure, not a summary', () => {
  it('routeStream raises rather than returning empty text', async () => {
    const src = await readFile('lib/engine/model-routing.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('if (!emitted && !declined) throw new EmptyCompletionError(provider)');
  });

  it('a refusal is exempt — it is an answer, and shopping it to another provider is shopping for a yes', async () => {
    const src = await readFile('lib/engine/model-routing.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain("if (chunk.type === 'error') declined = true");
  });

  it('the sweep no longer stores an empty string as a summary', async () => {
    const src = await readFile('lib/engine/sweep.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain("text === 'NOT RELEVANT' || text === ''");
  });
});

describe('the health surface reports the check, not a verdict, in its HTTP status', () => {
  it('returns 200 even when every model is dead', async () => {
    // Same rule as the drift route: a 503 here makes a monitor report the
    // checker as down and hides the finding it exists to deliver.
    const src = await readFile('app/api/models/health/route.ts', 'utf8');
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('status: 503');
    expect(code).not.toContain('status: 500');
  });

  it('never selects a replacement model for you', async () => {
    const src = await readFile('lib/engine/model-health.ts', 'utf8');
    expect(src).toContain('Detection in code, resolution human');
  });
});
