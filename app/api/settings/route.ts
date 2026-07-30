import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/supabase/server';
import { getUserSettings } from '@/lib/data';

export const dynamic = 'force-dynamic';

const CustomSource = z.object({
  id: z.string().max(80),
  name: z.string().max(120),
  url: z.string().url(),
  category: z.string().max(40),
  defaultTier: z.enum(['verified', 'reported', 'inferred']),
});

const Settings = z
  .object({
    theme: z.enum(['light', 'dark']),
    display_density: z.enum(['compact', 'comfortable', 'spacious']),
    default_map_layer: z.string().max(60),
    notify_market_watch: z.boolean(),
    notify_stall_alert: z.boolean(),
    notify_weekly_recap: z.boolean(),
    source_prefs: z.object({
      muted: z.array(z.string().max(80)).max(200),
      enabled: z.array(z.string().max(80)).max(200),
      order: z.array(z.string().max(80)).max(200),
      custom: z.array(CustomSource).max(50),
    }),
    watchlist: z.object({
      accounts: z.array(z.string().max(120)).max(200),
      topics: z.array(z.string().max(120)).max(100),
      verticals: z.array(z.string().max(60)).max(50),
      utilities: z.array(z.string().max(120)).max(100),
    }),
  })
  .partial();

/** GET /api/settings */
export async function GET() {
  const settings = await getUserSettings();
  return NextResponse.json({ settings });
}

/** PATCH /api/settings — partial update, upserted on the user's row. */
export async function PATCH(request: NextRequest) {
  const { supabase, user } = await getAuthedClient();
  if (!supabase || !user) {
    return NextResponse.json(
      { error: 'Sign in to save settings.' },
      { status: 401 },
    );
  }

  let patch: z.infer<typeof Settings>;
  try {
    patch = Settings.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
