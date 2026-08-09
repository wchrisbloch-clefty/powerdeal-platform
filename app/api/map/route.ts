import { NextResponse, type NextRequest } from 'next/server';
import { getMapPlan, saveMapPlan } from '@/lib/map/store';
import type { MapPlan } from '@/lib/map/schedule';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const dealId = request.nextUrl.searchParams.get('dealId');
  if (!dealId) {
    return NextResponse.json({ error: 'dealId is required.' }, { status: 400 });
  }
  return NextResponse.json({ plan: await getMapPlan(dealId) });
}

export async function POST(request: NextRequest) {
  let body: { dealId?: string; plan?: MapPlan };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.dealId || !body.plan || !Array.isArray(body.plan.milestones)) {
    return NextResponse.json(
      { error: 'dealId and a plan with a milestones array are required.' },
      { status: 400 },
    );
  }

  const result = await saveMapPlan(body.dealId, body.plan);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Save failed.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
