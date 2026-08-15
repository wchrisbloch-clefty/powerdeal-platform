import { NextResponse } from 'next/server';
import {
  configuredModels,
  providerConfigured,
  chainFor,
  type TaskKind,
} from '@/lib/engine/model-routing';
import {
  probeModel,
  explain,
  isDegraded,
  worstStatus,
  type ModelProbe,
} from '@/lib/engine/model-health';
import { getModelLog, failingProviders, isStale } from '@/lib/engine/model-log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/models/health — do the models we are configured to call still exist?
 *
 * The gap this closes: `gemini-2.0-flash` was retired by Google and
 * `llama-3.3-70b-versatile` hit its daily free-tier ceiling on the same
 * afternoon. Both cheap tiers down, one of them permanently, and the first
 * place either appeared was a log line. Nothing in the repo could have caught
 * it — a provider deprecating a model is a change on someone else's server.
 *
 * TWO INDEPENDENT SOURCES, REPORTED SEPARATELY:
 *
 *   `probes`      — a live metadata GET per configured model. Answers "does
 *                   this identifier still exist", and nothing else.
 *   `resolutions` — what the last REAL call for each task actually resolved
 *                   to, including every provider it fell through on the way.
 *
 * They are not folded together, for the same reason the schema drift check is
 * fetched separately from agent status: a probe can say a model exists while
 * every call to it is 429ing, and a resolution can say Claude answered while
 * saying nothing about whether Gemini is dead or simply was not reached.
 * Collapsing them would produce one confident number derived from two partial
 * truths, which is how "six idle jobs" happened.
 *
 * 200 EVEN WHEN EVERY MODEL IS DEAD. The HTTP status describes whether the
 * CHECK ran, not whether the models are healthy — same rule as the drift
 * route. A 503 here would make a monitoring tool report the checker as down
 * and hide the finding it was built to deliver.
 *
 * NON-GATING. This surface never blocks a call, a sweep, or an artifact.
 */
export async function GET() {
  const entries = configuredModels();

  const probes: ModelProbe[] = await Promise.all(
    entries.map((e) => probeModel(e, providerConfigured(e.provider))),
  );

  const log = await getModelLog();
  const now = Date.now();

  const resolutions = (Object.keys(log) as TaskKind[])
    .map((task) => ({
      task,
      chain: chainFor(task),
      resolution: log[task] ?? null,
      stale: isStale(log[task] ?? null, now),
    }))
    .sort((a, b) => a.task.localeCompare(b.task));

  const degraded = probes.filter(isDegraded);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    ok: degraded.length === 0,
    worst: worstStatus(probes),
    /**
     * The one line to read. Leads with what a human must do, because "retired"
     * and "throttled" both read as "broken" and only one of them is worth
     * getting out of bed for.
     */
    headline:
      degraded.length === 0
        ? `All ${probes.filter((p) => p.status === 'resolves').length} configured models resolve.`
        : degraded.map(explain).join(' '),
    probes: probes.map((p) => ({ ...p, explanation: explain(p) })),
    resolutions,
    /**
     * Providers that failed on the last real call, regardless of whether the
     * task ultimately succeeded. A successful summarize that quietly burned
     * through two dead providers is the state that went unnoticed.
     */
    fellThroughLastRun: failingProviders(log),
    note:
      'Probes ask the provider whether the model id exists. Resolutions record what the last real call did. ' +
      'A model can exist and still be rate-limited, so neither answers alone. Nothing here selects a replacement model.',
  });
}
