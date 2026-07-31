import { NextResponse, type NextRequest } from 'next/server';
import {
  route,
  canRun,
  availableProviders,
  isDomainTask,
  DOMAIN_TASKS,
  NoProviderError,
  type TaskKind,
} from '@/lib/engine/model-routing';
import { BRAIN_READY, BRAIN_ERROR, SYSTEM_PROMPT } from '@/lib/prompts/system';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/ai/health — is the AI actually wired up?
 *
 * /api/ai is POST-only and streams SSE, which makes it awkward to verify from
 * anywhere but the UI. This answers the question directly.
 *
 * Default mode reports configuration only and costs nothing. It proves the two
 * gates in /api/ai would pass — brain synced, provider present — but NOT that
 * a model call succeeds. Those are different failures: the router sends
 * `thinking` and `output_config.effort` only to frontier models because Haiku
 * rejects effort and Sonnet rejects temperature, and a mismatch there surfaces
 * only on a real call.
 *
 * ?live=1 makes one real call per chain to settle that. Kept opt-in because it
 * costs tokens, and deliberately tiny — a few tokens out, no deal context.
 */

interface ProbeResult {
  task: TaskKind;
  domainOnly: boolean;
  ok: boolean;
  provider?: string;
  model?: string;
  sample?: string;
  error?: string;
}

async function probe(task: TaskKind, user: string): Promise<ProbeResult> {
  const base = { task, domainOnly: isDomainTask(task) };
  try {
    const result = await route(task, {
      // Domain tasks must run against the real brain — that is the whole point
      // of the check. Non-domain tasks get a trivial system prompt so the
      // result isolates transport rather than prompt handling.
      system: isDomainTask(task) ? SYSTEM_PROMPT : 'You are a terse assistant.',
      user,
      maxTokens: 64,
    });
    return {
      ...base,
      ok: true,
      provider: result.provider,
      model: result.model,
      sample: result.text.replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error:
        err instanceof NoProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown failure',
    };
  }
}

export async function GET(request: NextRequest) {
  const live = new URL(request.url).searchParams.get('live') === '1';

  const brain = {
    ready: BRAIN_READY,
    error: BRAIN_ERROR,
    chars: SYSTEM_PROMPT.length,
    // First heading, so a synced-but-wrong document is visible rather than
    // just a length that looks plausible.
    firstHeading:
      /^#{1,3}\s+(.+)$/m.exec(SYSTEM_PROMPT)?.[1]?.trim().slice(0, 120) ?? null,
  };

  const gates = {
    providers: availableProviders(),
    domainTasksRunnable: canRun('brief'),
    cheapTasksRunnable: canRun('summarize'),
    domainTasks: DOMAIN_TASKS,
  };

  if (!live) {
    return NextResponse.json({
      mode: 'config',
      brain,
      gates,
      note: 'Configuration only — no model was called. Add ?live=1 to make one real call per chain.',
    });
  }

  // 'summarize' exercises the cheap chain (groq -> gemini -> claude).
  // 'brief' is domain-only, so it proves Claude AND the synced brain.
  const [cheap, domain] = await Promise.all([
    probe('summarize', 'Reply with exactly: OK'),
    probe(
      'brief',
      'Health check. Reply with one short sentence naming the methodology you follow. Do not produce a brief.',
    ),
  ]);

  const results = [cheap, domain];
  const ok = results.every((r) => r.ok);

  return NextResponse.json(
    { mode: 'live', ok, brain, gates, results },
    { status: ok ? 200 : 502 },
  );
}
