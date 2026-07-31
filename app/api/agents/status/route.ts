import { NextResponse } from 'next/server';
import { getAgentStatuses, getAgentAlert } from '@/lib/agent-runs';
import { isAdminConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/status — is the scheduled work actually alive?
 *
 * Reports every job that is SUPPOSED to exist, including ones that have never
 * run. A job missing from this response would mean it was removed from the
 * declared list, not that it is healthy.
 *
 * `persistence: false` is its own answer: without Supabase there is nowhere to
 * write run records, so every job would read "never run" whether or not it
 * fired. Saying so beats reporting six false negatives.
 */
export async function GET() {
  const persistence = isAdminConfigured();

  if (!persistence) {
    return NextResponse.json({
      persistence: false,
      note:
        'Supabase is not configured, so no run records can be stored or read. Job status is unknown, not healthy.',
      jobs: [],
      alert: null,
    });
  }

  const [jobs, alert] = await Promise.all([getAgentStatuses(), getAgentAlert()]);

  return NextResponse.json({
    persistence: true,
    checkedAt: new Date().toISOString(),
    summary: {
      total: jobs.length,
      ok: jobs.filter((j) => j.status === 'ok').length,
      failing: jobs.filter((j) => j.status === 'failing').length,
      stale: jobs.filter((j) => j.status === 'stale').length,
      neverRun: jobs.filter((j) => j.status === 'never-run').length,
    },
    jobs,
    alert,
  });
}
