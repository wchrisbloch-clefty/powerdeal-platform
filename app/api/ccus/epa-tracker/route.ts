import { NextResponse } from 'next/server';
import { findAllTrackers, PRIMACY_STATES } from '@/lib/engine/class-vi-trackers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ccus/epa-tracker — current Class VI tracker revisions.
 *
 * The sweep already ingests these; the endpoint exists so the scrapes can be
 * checked on their own. A scraper that breaks silently is the failure mode
 * worth guarding against — either agency can restructure its page at any
 * time, and without this the only symptom would be CCUS items quietly never
 * appearing again.
 *
 * 502 only when EVERY tracker fails, since that means the mechanism is broken
 * rather than one agency having reshuffled a page.
 */
export async function GET() {
  try {
    const results = await findAllTrackers();
    const trackers = results.filter((t) => t !== null);

    return NextResponse.json(
      {
        ok: trackers.length > 0,
        found: trackers.length,
        expected: results.length,
        trackers,
        // Surfaced because EPA's tracker is not the whole picture: these states
        // permit their own Class VI wells. `tracked` says which are covered.
        primacyStates: PRIMACY_STATES,
        ...(trackers.length === 0
          ? {
              error:
                'No tracker document found on any agency page. The pages were ' +
                'reachable, so the link patterns likely changed — check ' +
                'lib/engine/class-vi-trackers.ts.',
            }
          : {}),
      },
      { status: trackers.length > 0 ? 200 : 502 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
