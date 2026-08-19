import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { keyShape, diagnose } from '@/lib/supabase/diagnose';

/**
 * ═══════════════════════════════════════════════════════════════
 * NOTHING DOWNSTREAM MAY BRANCH ON THE KEY BEING A JWT.
 * ═══════════════════════════════════════════════════════════════
 *
 * SUPABASE_SERVICE_ROLE_KEY now holds an `sb_secret_` key rather than a legacy
 * service_role JWT. The two are not the same object: a JWT is a signed token
 * the gateway parses, and a secret key is an opaque identifier it looks up.
 * A secret key has no header, no payload, no `role` claim, no `iat` and no
 * `exp`, and it does not start with `eyJ`.
 *
 * So any code that recognises the key by its JWT-ness — a `startsWith('eyJ')`,
 * a payload decode, a role-claim check, a "does it expire" branch — stops
 * being true of the deployment on the day the key is swapped. The dangerous
 * shape is not a crash. It is a branch that quietly takes its ELSE arm and
 * reports something reasonable-sounding about the wrong scheme, which is this
 * codebase's whole recurring failure.
 *
 * ══ WHAT THE AUDIT ACTUALLY FOUND ══
 *
 * One branch, in keyShape itself, where it belongs: it classifies by prefix,
 * and `sb_secret_` is matched BEFORE the `eyJ` test, as privileged. Everything
 * else — getAdminClient, ownerSelect, isAdminConfigured, env-check, every API
 * route — tests for PRESENCE of the env var and passes the value straight to
 * createClient. supabase-js sends whatever it is given as `apikey` and
 * `Authorization: Bearer`, which is correct for both schemes.
 *
 * This test is here so that stays true.
 */

const ROOTS = ['app', 'lib', 'middleware.ts'];

/** Ways of asking "is this a JWT?" that a secret key answers wrongly. */
const JWT_TELLS = [
  "startsWith('eyJ')",
  'startsWith("eyJ")',
  'split(\'.\')[1]',
  'jwtDecode',
  'jsonwebtoken',
  'atob(',
];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...(await walk(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function sourceFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const root of ROOTS) {
    if (root.endsWith('.ts')) out.push(root);
    else out.push(...(await walk(root)));
  }
  return out;
}

describe('the service-role key is used by presence, not by shape', () => {
  it('the scan covers the app, and knows how many files that is', async () => {
    const files = await sourceFiles();
    // Loudest finding first: a scan over nothing proves nothing.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('lib/supabase/admin.ts');
    expect(files).toContain('lib/data.ts');
  });

  it('only diagnose.ts decodes a JWT, and it is prefix-gated', async () => {
    const files = await sourceFiles();
    const decoders: string[] = [];
    for (const file of files) {
      const src = await readFile(file, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (JWT_TELLS.some((t) => code.includes(t))) decoders.push(file);
    }
    // diagnose.ts is the only legitimate one: classification IS its job.
    expect(decoders).toEqual(['lib/supabase/diagnose.ts']);

    // And there it is gated behind the new-scheme prefixes, which are checked
    // first — so an sb_secret_ key never reaches the decode path.
    const src = await readFile('lib/supabase/diagnose.ts', 'utf8');
    expect(src.indexOf("startsWith('sb_secret_')")).toBeLessThan(
      src.indexOf("startsWith('eyJ')"),
    );
  });

  it('getAdminClient checks presence and nothing else', async () => {
    const src = await readFile('lib/supabase/admin.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The only condition on the key is that it exists.
    expect(code).toContain('if (!url || !key)');
    // It must not inspect the value.
    expect(code).not.toMatch(/key\.(startsWith|split|includes|match|slice)/);
    expect(code).not.toContain('keyShape');
  });

  it('an sb_secret_ key is privileged, so no diagnosis calls it the wrong key', () => {
    /*
      ⚠️ THE BRANCH THAT WOULD HAVE BITTEN. diagnose() has:

        if (!key.privileged && key.scheme !== 'absent') -> 'wrong-privilege'

      which fires BEFORE the malformed-key and RLS branches. Had keyShape
      classified sb_secret_ as unprivileged — or as 'unrecognised', which is
      what it returns for any prefix it does not know — every failure on the
      new key would have been reported as "this slot needs a PRIVILEGED key
      and holds one that is not", sending the reader to swap back to the key
      they just migrated away from.
    */
    const secret = keyShape('sb_secret_abcdefghijklmnop');
    expect(secret.scheme).toBe('new-secret');
    expect(secret.privileged).toBe(true);
    expect(secret.iat).toBeNull();

    for (const message of [
      'permission denied for table deals',
      'invalid api key',
      'fetch failed',
      'JWT issued at future',
    ]) {
      const d = diagnose({ client: 'service-role', message, key: secret });
      expect(d.cause, `"${message}" on a secret key`).not.toBe('wrong-privilege');
      // And no diagnosis may describe an opaque key as a token.
      expect(d.detail).not.toContain('legacy');
    }
  });

  it('a publishable key in the privileged slot is still caught', () => {
    // The migration trap the wrong-privilege branch exists for: sb_publishable_
    // looks like a new-scheme key and is NOT privileged. Pasting the wrong one
    // of the pair is the realistic mistake now that the swap has happened.
    const pub = keyShape('sb_publishable_abcdefghijklmnop');
    expect(pub.privileged).toBe(false);
    const d = diagnose({ client: 'service-role', message: 'permission denied', key: pub });
    expect(d.cause).toBe('wrong-privilege');
  });

  it('the edge functions are a SEPARATE client on a key we do not control', async () => {
    /*
      ⚠️ THE VERCEL SWAP DID NOT TOUCH THESE. supabase/functions/* read
      SUPABASE_SERVICE_ROLE_KEY from Deno.env, and inside the Supabase runtime
      that variable is injected by the platform — it is Supabase's own legacy
      service_role JWT, not the value set in Vercel.

      So if "JWT issued at future" was ever raised by ccus-sweep,
      market-watch or stall-alert, swapping the Vercel key cannot have fixed
      it, and the absence of the error in the app is not evidence about them.
      Asserted so the distinction is on the record rather than rediscovered.
    */
    const shared = await readFile('supabase/functions/_shared/appState.ts', 'utf8');
    expect(shared).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    const fns = (await readdir('supabase/functions', { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== '_shared')
      .map((e) => e.name)
      .sort();
    expect(fns).toEqual(['ccus-sweep', 'market-watch', 'stall-alert']);
  });

  it('no anon client exists in the app at all', async () => {
    /*
      NEXT_PUBLIC_SUPABASE_ANON_KEY is in .env.local and is read by NOTHING.
      @supabase/ssr is a dependency and is imported nowhere. Worth asserting
      because it removes the anon key from the list of things that could be
      raising a JWT error from the app side — the error, if it returns, is the
      service-role client or an edge function, and nothing else.
    */
    const files = await sourceFiles();
    for (const file of files) {
      const src = await readFile(file, 'utf8');
      expect(src, `${file} reads the anon key`).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      expect(src, `${file} imports @supabase/ssr`).not.toContain('@supabase/ssr');
    }
  });
});
