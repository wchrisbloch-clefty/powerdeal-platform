import { NextResponse } from 'next/server';
import { findTracker, PRIMACY_STATES } from '@/lib/engine/epa-class-vi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ccus/epa-tracker — current EPA Class VI tracker revision.
 *
 * The sweep already ingests this; the endpoint exists so the scrape can be
 * checked on its own. A scraper that breaks silently is the failure mode
 * worth guarding against here — EPA can restructure the page at any time, and
 * without this the only symptom would be CCUS items quietly never appearing.
 */
export async function GET() {
  try {
    const tracker = await findTracker();

    if (!tracker) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No permit-tracker PDF link found on the EPA page. The page was reachable, ' +
            'so the link pattern likely changed — check lib/engine/epa-class-vi.ts.',
          primacyStates: PRIMACY_STATES,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      tracker,
      // Surfaced because EPA's tracker is not the whole picture: these states
      // permit their own Class VI wells and are absent from it.
      primacyStates: PRIMACY_STATES,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
