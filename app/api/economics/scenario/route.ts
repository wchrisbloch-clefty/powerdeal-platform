import { NextResponse, type NextRequest } from 'next/server';
import { saveLooseScenario, saveScenarioToDeal } from '@/lib/economics/scenarios';
import type { Scenario } from '@/lib/economics/types';

export const dynamic = 'force-dynamic';

/**
 * Save an economics scenario.
 *
 * With a dealId it lands in deals.artifacts as type 'economics-scenario', so
 * the deal page shows it beside the briefs. Without one it goes to the loose
 * tray in app_state — exploratory modelling is still worth not losing.
 */
export async function POST(request: NextRequest) {
  let body: { dealId?: string; scenario?: Scenario };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const scenario = body.scenario;
  if (!scenario?.id || !scenario.name) {
    return NextResponse.json({ error: 'A scenario with an id and name is required.' }, { status: 400 });
  }

  const result = body.dealId
    ? await saveScenarioToDeal(body.dealId, scenario)
    : await saveLooseScenario(scenario);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Save failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attachedTo: body.dealId ?? null });
}
