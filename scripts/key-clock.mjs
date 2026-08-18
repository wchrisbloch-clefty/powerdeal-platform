#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * IS THE SKEW VISIBLE FROM OUR END, OR ONLY FROM THEIR DASHBOARD?
 * ═══════════════════════════════════════════════════════════════
 *
 * It is visible from our end, and this prints it.
 *
 * A legacy Supabase key IS a JWT: three base64url segments, and the middle one
 * is the payload. Reading `iat` out of it needs no secret — the signature is
 * what needs the secret, and we are not verifying it, only reading what it
 * claims. So the token's issued-at is knowable locally.
 *
 * The other half — what the database thinks the time is — comes back on every
 * HTTP response as the `Date` header, which HTTP requires and PostgREST sends.
 * That is the clock the gateway compares against.
 *
 * Two numbers, one subtraction. No dashboard, no support ticket needed to see
 * whether the premise holds.
 *
 * ⚠️ PRINTS NO KEY MATERIAL. Claims only — iat, exp, role, and the issuer.
 * Safe to paste into an issue, which is the only reason it is worth writing as
 * a script instead of a one-liner.
 *
 *   node scripts/key-clock.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and whichever of SUPABASE_SERVICE_ROLE_KEY /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are set, from the environment or .env.local.
 */

import { readFile } from 'node:fs/promises';

async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      // Real environment wins over the file, same as Next.js.
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local is normal on a deployment.
  }
  return env;
}

function claims(key) {
  if (!key) return { form: 'absent' };
  if (key.startsWith('sb_secret_') || key.startsWith('sb_publishable_')) {
    // ⚠️ THE WHOLE POINT. New-scheme keys are opaque identifiers validated by
    // lookup, not signed tokens. There is no iat, so there is no clock to be
    // ahead of and this failure mode cannot occur.
    return { form: 'new-scheme (opaque, no iat — immune to this failure)' };
  }
  if (!key.startsWith('eyJ')) return { form: 'unrecognised' };

  try {
    const payload = JSON.parse(
      Buffer.from(
        key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    );
    return {
      form: 'legacy JWT',
      role: payload.role ?? '(none)',
      iss: payload.iss ?? '(none)',
      iat: typeof payload.iat === 'number' ? payload.iat : null,
      exp: typeof payload.exp === 'number' ? payload.exp : null,
    };
  } catch {
    return { form: 'legacy JWT (payload would not decode)' };
  }
}

const iso = (s) => (s === null || s === undefined ? '—' : new Date(s * 1000).toISOString());

function days(seconds) {
  return `${(seconds / 86400).toFixed(1)}d`;
}

const env = await loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not set. Nothing to ask.');
  process.exit(2);
}

// ── The database's clock ──
let serverEpoch = null;
let status = null;
let body = '';
try {
  const anyKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const res = await fetch(`${url}/rest/v1/`, {
    headers: anyKey ? { apikey: anyKey, Authorization: `Bearer ${anyKey}` } : {},
  });
  status = res.status;
  const dateHeader = res.headers.get('date');
  if (dateHeader) serverEpoch = Math.floor(Date.parse(dateHeader) / 1000);
  body = (await res.text()).slice(0, 400);
} catch (err) {
  console.error(`Could not reach ${url}: ${err.message}`);
}

const localEpoch = Math.floor(Date.now() / 1000);

console.log('═══ CLOCKS ═══');
console.log(`  this machine       ${iso(localEpoch)}`);
console.log(`  supabase (Date hdr) ${iso(serverEpoch)}`);
if (serverEpoch !== null) {
  const skew = localEpoch - serverEpoch;
  console.log(`  skew                ${skew >= 0 ? '+' : ''}${skew}s (this machine ahead is positive)`);
}
console.log(`  REST / responded    ${status ?? 'no response'}`);
if (body) console.log(`  body                ${body.replace(/\s+/g, ' ').slice(0, 200)}`);

for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  const c = claims(env[name]);
  console.log(`\n═══ ${name} ═══`);
  console.log(`  form   ${c.form}`);
  if (c.role !== undefined) console.log(`  role   ${c.role}`);
  if (c.iss !== undefined) console.log(`  iss    ${c.iss}`);
  if (c.iat !== undefined) {
    console.log(`  iat    ${iso(c.iat)}`);
    if (c.iat !== null && serverEpoch !== null) {
      const ahead = c.iat - serverEpoch;
      console.log(
        `         ${ahead > 0 ? `AHEAD of the database clock by ${ahead}s (${days(ahead)})` : `${-ahead}s (${days(-ahead)}) in the past — cannot be "issued at future"`}`,
      );
    }
  }
  if (c.exp !== undefined) console.log(`  exp    ${iso(c.exp)}`);
}

console.log(`
═══ HOW TO READ THIS ═══
  An "issued at future" rejection requires iat > the database clock. If the
  line above says the iat is in the PAST, that error is not describing this
  key, and the next place to look is a DIFFERENT client — the anon key, an
  edge function, or a cached JWT minted by a signed-in session.

  A new-scheme key (sb_secret_) has no iat at all, which is why migrating
  removes the failure mode rather than waiting out a clock.`);
