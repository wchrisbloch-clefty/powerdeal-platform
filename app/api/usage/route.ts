import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getAppState } from '@/lib/data';
import {
  USAGE_KEY,
  emptyUsage,
  recordVisit,
  recordWish,
  recordAction,
  report,
  reportHeadline,
  type UsageState,
} from '@/lib/usage';
import { KNOWN_SURFACES } from '@/lib/surfaces';

export const dynamic = 'force-dynamic';

/**
 * POST /api/usage — record one visit, wish, or action.
 * GET  /api/usage — the week's report.
 *
 * Stored in `app_state`, so nothing has to be migrated against a live table
 * holding 21 real deals.
 *
 * ══ IT NEVER FAILS LOUDLY AND NEVER BLOCKS ══
 *
 * Every write path returns 200 with `{ recorded: false, reason }` rather than
 * an error status. The caller is a `sendBeacon` on page-hide and a small box
 * in the corner; neither can act on a 500, and instrumentation that can
 * interrupt the work it measures is worse than none.
 *
 * ⚠️ The write still INSPECTS the error supabase-js resolves with, and reports
 * it in the body. Best-effort is not the same as silent — that conflation is
 * what left `app_state` writing nothing for a day while every caller believed
 * it had.
 */

interface Body {
  kind: 'visit' | 'wish' | 'action';
  path?: string;
  ms?: number;
  text?: string;
  action?: string;
  error?: string;
}

async function readState(): Promise<UsageState> {
  return (await getAppState<UsageState>(USAGE_KEY)) ?? emptyUsage();
}

export async function POST(request: NextRequest) {
  const client = getAdminClient();
  if (!client) {
    return NextResponse.json({
      recorded: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set, so usage cannot be stored.',
    });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ recorded: false, reason: 'Unreadable body.' });
  }

  const at = new Date().toISOString();
  const path = (body.path ?? '').slice(0, 200);

  // Read-modify-write on a single jsonb row. Safe here because there is
  // exactly one operator and visits are recorded on page-hide, not per tick —
  // the concurrency this would lose to does not exist in a one-user week.
  const state = await readState();
  let next: UsageState;

  switch (body.kind) {
    case 'visit':
      if (!path) return NextResponse.json({ recorded: false, reason: 'A visit needs a path.' });
      next = recordVisit(state, path, body.ms ?? 0, at);
      break;
    case 'wish':
      next = recordWish(state, { text: (body.text ?? '').slice(0, 2000), path, at });
      // An empty wish is a no-op in the reducer. Reported as not-recorded so
      // the box can say so rather than pretending it saved something.
      if (next.wishes.length === state.wishes.length) {
        return NextResponse.json({ recorded: false, reason: 'Empty wish, nothing stored.' });
      }
      break;
    case 'action':
      if (!body.action) {
        return NextResponse.json({ recorded: false, reason: 'An action needs a name.' });
      }
      next = recordAction(state, {
        action: body.action.slice(0, 120),
        path,
        at,
        error: body.error?.slice(0, 300),
      });
      break;
    default:
      return NextResponse.json({ recorded: false, reason: `Unknown kind "${body.kind}".` });
  }

  const { error } = await client
    .from('app_state')
    .upsert(
      { key: USAGE_KEY, value: next, user_id: POWERDEAL_USER_ID },
      { onConflict: 'user_id,key' },
    );

  if (error) {
    // Best-effort, NOT silent.
    console.warn('[usage] write failed:', error.message);
    return NextResponse.json({ recorded: false, reason: `Write failed: ${error.message}` });
  }

  return NextResponse.json({ recorded: true });
}

export async function GET() {
  const client = getAdminClient();
  if (!client) {
    return NextResponse.json({
      available: false,
      reason:
        'SUPABASE_SERVICE_ROLE_KEY is not set. Nothing has been recorded — which is not the same as nothing having been used.',
    });
  }

  const state = await readState();
  const r = report(state, KNOWN_SURFACES);

  return NextResponse.json({
    available: true,
    headline: reportHeadline(r),
    ...r,
  });
}
