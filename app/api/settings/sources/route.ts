import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import { getUserSettings } from '@/lib/data';
import type { CustomSource, UserSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/sources — curate the source list.
 *
 * The seeded list came from the build spec, not from the operator. This is how
 * it becomes his: add, remove, mute, reorder. Everything writes to
 * user_settings.source_prefs, which the sweep already reads, so a change takes
 * effect on the next sweep with no other wiring.
 *
 * `add-from-gap` is the one-click path from the coverage-gap block. It only
 * gets the outlet's NAME and one article URL, never a feed URL — so the source
 * is stored with the article's origin as a placeholder and flagged unverified.
 * Guessing a feed path would produce a source that silently returns nothing,
 * which is worse than one the operator has to finish by hand.
 */

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    name: z.string().min(1).max(120),
    url: z.string().url(),
    category: z.string().min(1).max(60),
  }),
  z.object({
    action: z.literal('add-from-gap'),
    name: z.string().min(1).max(120),
    articleUrl: z.string().url(),
    category: z.string().min(1).max(60),
  }),
  z.object({ action: z.literal('remove'), id: z.string().min(1) }),
  z.object({
    action: z.literal('mute'),
    id: z.string().min(1),
    muted: z.boolean(),
    /** Discovery sources are opt-IN, so they toggle `enabled` instead. */
    discovery: z.boolean().optional(),
  }),
  z.object({ action: z.literal('reorder'), order: z.array(z.string()).max(200) }),
]);

const EMPTY: NonNullable<UserSettings['source_prefs']> = {
  muted: [],
  enabled: [],
  order: [],
  custom: [],
};

export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const client = getAdminClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Supabase is not configured, so source changes cannot be saved.' },
      { status: 503 },
    );
  }

  const settings = await getUserSettings();
  const prefs = { ...EMPTY, ...(settings?.source_prefs ?? {}) };

  switch (body.action) {
    case 'add': {
      const source: CustomSource = {
        id: customId(body.name),
        name: body.name.trim(),
        url: body.url.trim(),
        category: body.category,
        // Never blocked, never flattered: anything hand-added starts at the
        // bottom tier and earns its way up.
        defaultTier: 'inferred',
      };
      if (prefs.custom.some((c) => c.id === source.id)) {
        return NextResponse.json({ error: 'That source is already in your list.' }, { status: 409 });
      }
      prefs.custom = [...prefs.custom, source];
      break;
    }

    case 'add-from-gap': {
      let origin: string;
      try {
        origin = new URL(body.articleUrl).origin;
      } catch {
        return NextResponse.json({ error: 'That article URL is not valid.' }, { status: 400 });
      }
      const source: CustomSource = {
        id: customId(body.name),
        name: body.name.trim(),
        // The site root, NOT a guessed /feed path. Settings shows it as needing
        // a real feed URL rather than pretending it works.
        url: origin,
        category: body.category,
        defaultTier: 'inferred',
      };
      if (prefs.custom.some((c) => c.id === source.id)) {
        return NextResponse.json({ ok: true, alreadyPresent: true, prefs });
      }
      prefs.custom = [...prefs.custom, source];
      break;
    }

    case 'remove':
      prefs.custom = prefs.custom.filter((c) => c.id !== body.id);
      prefs.muted = prefs.muted.filter((id) => id !== body.id);
      prefs.enabled = prefs.enabled.filter((id) => id !== body.id);
      prefs.order = prefs.order.filter((id) => id !== body.id);
      break;

    case 'mute':
      if (body.discovery) {
        // Opt-in: presence in `enabled` is the switch.
        prefs.enabled = body.muted
          ? prefs.enabled.filter((id) => id !== body.id)
          : [...new Set([...prefs.enabled, body.id])];
      } else {
        // Opt-out: presence in `muted` is the switch.
        prefs.muted = body.muted
          ? [...new Set([...prefs.muted, body.id])]
          : prefs.muted.filter((id) => id !== body.id);
      }
      break;

    case 'reorder':
      prefs.order = body.order;
      break;
  }

  const { error } = await client
    .from('user_settings')
    .upsert(
      { source_prefs: prefs, user_id: POWERDEAL_USER_ID },
      { onConflict: 'user_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prefs });
}

function customId(name: string): string {
  return `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
