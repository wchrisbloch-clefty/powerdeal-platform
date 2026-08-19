#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * DO THE REMAINING COPIES OF CRON_SECRET AGREE?
 * ═══════════════════════════════════════════════════════════════
 *
 *   CRON_SECRET=… node scripts/cron-secret-check.mjs [base-url]
 *
 * ══ WHY THIS COMPARES BEHAVIOUR AND NOT VALUES ══
 *
 * The secret lived in three places with nothing holding them together, and on
 * 2026-08-12 two of them drifted. Every pg_cron call 401'd; pg_cron recorded
 * success because net.http_post is asynchronous; twelve missed runs across two
 * jobs reported healthy for five days.
 *
 * The pg_cron copy is gone — schedule.sql reads the vault at fire time now.
 * Two remain, and NEITHER can be read from here: Supabase edge secrets are
 * write-only through the API, and the vault is only reachable from inside the
 * database. So there is no pair of values to compare.
 *
 * There is, however, a question that matters more than equality: does a call
 * carrying this secret get accepted? That is answerable, it is what actually
 * broke, and it stays true even if the storage mechanism changes underneath.
 *
 * ⚠️ THE SECRET IS NEVER PRINTED. Not in output, not in an error, not in a
 * URL. It goes into one header and nowhere else.
 *
 * ⚠️ AND THIS FIRES REAL JOBS. `ccus-sweep` and `market-watch` are read-mostly
 * and safe to poke. `stall-alert` is NOT probed, because a successful call
 * increments days_in_stage on every in-flight deal — the probe would age the
 * whole book by a day to prove a header matched. It is checked with a
 * deliberately WRONG secret instead, which proves the gate is closed without
 * ever running the job.
 */

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('✗ CRON_SECRET is not set in this shell. Nothing to check.');
  process.exit(2);
}

const base =
  process.argv[2] ??
  process.env.SUPABASE_FUNCTIONS_URL ??
  (process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co')
    : null);

if (!base) {
  console.error(
    '✗ No functions base URL. Pass one as an argument, or set ' +
      'SUPABASE_FUNCTIONS_URL / NEXT_PUBLIC_SUPABASE_URL.',
  );
  process.exit(2);
}

/**
 * `safe` — can be called without changing anything the operator would notice.
 * A job with a side effect is probed for REJECTION only.
 */
const FUNCTIONS = [
  { name: 'ccus-sweep', safe: true, why: 'read-mostly; inserts only genuinely new events' },
  { name: 'market-watch', safe: true, why: 'read-mostly; writes a rollup key' },
  {
    name: 'stall-alert',
    safe: false,
    why: 'increments days_in_stage on every in-flight deal',
  },
];

async function call(name, token, timeoutMs = 30000) {
  try {
    const res = await fetch(`${base}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': token },
      body: '{}',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 400) };
  } catch (err) {
    return { status: null, body: String(err.message ?? err) };
  }
}

let failures = 0;
console.log(`checking ${FUNCTIONS.length} function(s) at ${base}\n`);

for (const fn of FUNCTIONS) {
  // ⚠️ THE NEGATIVE PROBE COMES FIRST, ALWAYS. If a wrong secret is accepted,
  // the positive result below proves nothing at all — the gate is open and
  // every call would succeed. Rule 4 as a runtime step: establish that the
  // check can fail before believing that it passed.
  const wrong = await call(fn.name, `${secret}-deliberately-wrong`, 15000);
  if (wrong.status !== 401) {
    console.log(
      `✗ ${fn.name}: a WRONG secret got ${wrong.status ?? 'no response'}, expected 401. ` +
        `The gate is not closed, so nothing else here is evidence.`,
    );
    failures += 1;
    continue;
  }

  if (!fn.safe) {
    console.log(`✓ ${fn.name}: rejects a wrong secret. Not fired — ${fn.why}.`);
    continue;
  }

  const right = await call(fn.name, secret);
  if (right.status === 200) {
    console.log(`✓ ${fn.name}: accepted this secret and ran. ${right.body.slice(0, 160)}`);
  } else if (right.status === 401) {
    console.log(
      `✗ ${fn.name}: REJECTED this secret. The edge-function environment holds a ` +
        `different value from the one in this shell — this is the drift that ` +
        `caused the August outage.`,
    );
    failures += 1;
  } else {
    console.log(
      `✗ ${fn.name}: ${right.status ?? 'no response'} — not an auth verdict. ${right.body.slice(0, 200)}`,
    );
    failures += 1;
  }
}

console.log(`
⚠️ THIS CHECKS THE EDGE-FUNCTION COPY ONLY. The vault copy is what pg_cron
   reads at fire time and is only visible from inside the database:

     select name, updated_at from vault.secrets where name = 'cron_secret';

   If this script passes and the scheduled runs still 401, the vault row is
   the one that is wrong — or missing, which makes the header NULL and drops
   it from jsonb_build_object entirely.

⚠️ AND VERCEL'S CRON_SECRET IS A SEPARATE TRUST BOUNDARY. It gates the Next
   cron routes through middleware.ts. There is no reason for it to hold the
   same value as this one, and one reason for it not to: a leak of either
   currently compromises both.`);

process.exit(failures > 0 ? 1 : 0);
