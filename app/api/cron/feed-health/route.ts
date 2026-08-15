import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { storeFeedHealth } from '@/lib/feed-health';
import { probeAllSources } from '@/lib/feed-health-probe';
import { withRunRecord } from '@/lib/agent-runs';

export const dynamic = 'force-dynamic';
// Twenty-odd feeds, probed with bounded concurrency.
export const maxDuration = 300;

/**
 * GET /api/cron/feed-health — the weekly probe.
 *
 * The manual check in Sources still exists and is still useful, but it only
 * helps someone who already suspects a problem. This is what catches the feed
 * that quietly started 404ing three weeks ago and made the stream a little
 * thinner every day since.
 *
 * ⚠️ THIS USED TO fetch() ITS OWN DEPLOYMENT, AND FAILED EVERY DAY.
 *
 * Vercel Deployment Protection 302'd the request into an SSO login. The cron's
 * inbound request to THIS route carries Vercel's own auth; the second request
 * it then made back to itself carried nothing, so protection bounced it. The
 * body was `Redirecting...` and the run recorded a failure daily.
 *
 * The reasoning behind the round trip was right — call the probe rather than
 * duplicate it, so there is exactly one definition of "healthy" and two probes
 * cannot drift apart. The transport was the mistake. `probeAllSources()` is
 * that single definition, called IN PROCESS: no protection layer to satisfy,
 * no origin to derive from a request host that may not be reachable from
 * inside the function, no second cold start, no network.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const snapshot = await withRunRecord('feed-health', async () => {
      // No fetch, no parse, no transport that can be intercepted. The two
      // failure modes this block used to guard against — an HTML login page
      // and an unparseable body — cannot occur across a function call.
      //
      // `parseProbeBody` and `probeDiagnosis` are NOT deleted. The Sources
      // panel still reads this over HTTP, and a diagnosis path removed because
      // its current caller stopped triggering it is a path that rots until the
      // day something else does. Both stay covered by tests/crons.test.ts.
      const sources = await probeAllSources();
      if (sources.length === 0) throw new Error('Probe returned no sources.');

      const stored = await storeFeedHealth(
        sources.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          httpStatus: s.httpStatus ?? null,
          itemCount: s.itemCount ?? 0,
          message: s.message ?? null,
        })),
      );
      return { result: stored, itemsProcessed: stored.checked };
    });

    return NextResponse.json({
      ok: true,
      checked: snapshot.checked,
      healthy: snapshot.ok,
      broken: snapshot.broken,
      newTransitions: snapshot.transitions.filter((t) => t.at === snapshot.checkedAt),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Feed health probe failed.' },
      { status: 500 },
    );
  }
}

/** POST — same probe, on demand, for the "check now" button. */
export async function POST(request: NextRequest) {
  return GET(request);
}
