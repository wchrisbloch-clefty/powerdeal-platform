import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/supabase/server';
import { getRecentSignals } from '@/lib/data';
import { SIGNAL_TYPES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CreateSignal = z.object({
  signal_type: z.enum(SIGNAL_TYPES),
  raw_signal: z.string().min(1).max(8000),
  so_what: z.string().max(4000).nullable().optional(),
  account_meaning: z.string().max(4000).nullable().optional(),
  business_meaning: z.string().max(4000).nullable().optional(),
  source_name: z.string().max(200).nullable().optional(),
  deal_ids: z.array(z.string().uuid()).max(50).default([]),
});

/** GET /api/signals — the Intelligence Log, newest first. */
export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  const signals = await getRecentSignals(Math.min(Math.max(limit, 1), 200));
  return NextResponse.json({ signals });
}

/** POST /api/signals — log a signal against one or more deals. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) {
    return NextResponse.json(
      { error: 'Sign in to log signals — the Intelligence Log needs somewhere to persist.' },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof CreateSignal>;
  try {
    parsed = CreateSignal.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('intelligence_log')
    .insert({ ...parsed, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signal: data }, { status: 201 });
}
