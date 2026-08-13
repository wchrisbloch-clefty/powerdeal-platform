import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  storeFeedHealth, parseProbeBody, probeDiagnosis, type FeedHealthEntry,
} from '@/lib/feed-health';
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
 * The probe itself lives in /api/feed/health. This calls that route rather than
 * duplicating it, so there is exactly one definition of what "healthy" means —
 * two probes that drift apart would be worse than one that runs less often.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const snapshot = await withRunRecord('feed-health', async () => {
      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}/api/feed/health`, {
        headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
        // Do not follow a redirect into a login page and then try to parse it.
        // A 3xx here is a finding, not a step on the way to the answer.
        redirect: 'manual',
      });

      const raw = await res.text();
      const parsed = parseProbeBody(raw);

      // ⚠️ THE PROBE CRASHED ON THE CONDITION IT EXISTS TO DETECT.
      //
      // `await res.json()` on an HTML body threw "Unexpected token '<'", which
      // took the whole run down as an exception. A probe whose job is noticing
      // that a response stopped being parseable, and which dies when a response
      // stops being parseable, is blind in exactly the way a check that only
      // ever sees the passing case is blind.
      //
      // So a non-parseable body is now a RESULT with a diagnosis attached.
      if (!parsed.ok) {
        throw new Error(probeDiagnosis(res.status, raw, `${origin}/api/feed/health`));
      }
      if (!res.ok) throw new Error(`Probe failed (${res.status}).`);

      const sources = parsed.sources;
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
