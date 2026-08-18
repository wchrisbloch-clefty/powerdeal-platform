/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH CLIENT, WHICH KEY, AND WHAT THE ERROR ACTUALLY MEANS.
 * ═══════════════════════════════════════════════════════════════
 *
 * `JWT issued at future` names a symptom and nothing else. It does not say
 * which client raised it, which key that client was built from, or whether the
 * fix is a clock, a key rotation or a migration to Supabase's new key scheme.
 *
 * Same lesson as the feed-health probe reporting `unparseable non-HTML (HTTP
 * 302)` — accurate, and it sent two people looking at publisher feeds when the
 * cause was an SSO redirect. Detection is half the job. A failure that names
 * the wrong place costs more than one that stays quiet.
 *
 * PURE. It classifies a key by SHAPE and an error by TEXT. It never reads a
 * key's value into an output, never contacts anything, and never logs a secret
 * — `keyShape` returns a category, not a prefix, so a diagnosis can be pasted
 * into an issue safely.
 */

/**
 * Supabase is migrating from legacy anon/service_role JWTs to publishable and
 * secret keys. A deployment part-way through has one of each, and the failure
 * mode is silent: the old key keeps working until it does not.
 */
export type KeyScheme =
  | 'legacy-service-role'
  | 'legacy-anon'
  | 'legacy-jwt-unknown-role'
  | 'new-secret'
  | 'new-publishable'
  | 'unrecognised'
  | 'absent';

export interface KeyFacts {
  scheme: KeyScheme;
  /** True for the two forms that carry full RLS-bypassing authority. */
  privileged: boolean;
  /** Human label for the diagnosis line. Never contains the key. */
  label: string;
  /**
   * ⚠️ THE CLAIM, READ RATHER THAN ASSUMED. Null for a new-scheme key (they
   * are opaque identifiers, not tokens, and carry no iat at all) and for
   * anything that will not decode.
   *
   * This exists because the clock-skew branch used to state "the token's
   * issued-at time is AHEAD of the database's clock" without ever looking at
   * it. The message said iat, so the diagnosis repeated it. Decoding a JWT
   * payload needs no secret — the signature is what needs the secret — so the
   * claim was there to be checked the whole time.
   */
  iat: number | null;
}

/**
 * Legacy Supabase keys carry a FIXED, ROUND iat rather than a real issuance
 * time. Observed on this project's own anon key: iat 1700000000 exactly
 * (2023-11-14T22:13:20Z) and exp 2000000000 exactly (2033-05-18T03:33:20Z).
 *
 * That matters for the clock-skew story. If the iat is a placeholder from
 * years ago rather than a timestamp from the moment of issue, then "issued at
 * future" cannot be describing it unless the database clock is years behind —
 * and it means re-issuing the key does NOT move the iat closer to now, which
 * is the opposite of what the original diagnosis assumed.
 */
export const LEGACY_PLACEHOLDER_IAT = 1_700_000_000;

function decodeClaims(jwt: string): { role: string | null; iat: number | null } {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return { role: null, iat: null };
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { role?: string; iat?: number };
    return {
      role: typeof json.role === 'string' ? json.role : null,
      iat: typeof json.iat === 'number' ? json.iat : null,
    };
  } catch {
    // A key that will not decode is not a JWT. Reported as unrecognised rather
    // than assumed to be one.
    return { role: null, iat: null };
  }
}

export function keyShape(raw: string | undefined | null): KeyFacts {
  const key = raw?.trim();
  if (!key) {
    return { scheme: 'absent', privileged: false, label: 'not set', iat: null };
  }
  if (key.startsWith('sb_secret_')) {
    return {
      scheme: 'new-secret',
      privileged: true,
      label: 'new-scheme secret key (sb_secret_…)',
      iat: null,
    };
  }
  if (key.startsWith('sb_publishable_')) {
    return {
      scheme: 'new-publishable',
      privileged: false,
      label: 'new-scheme PUBLISHABLE key (sb_publishable_…) — not privileged',
      iat: null,
    };
  }
  if (key.startsWith('eyJ')) {
    const { role, iat } = decodeClaims(key);
    if (role === 'service_role') {
      return {
        scheme: 'legacy-service-role',
        privileged: true,
        label: 'legacy service_role JWT',
        iat,
      };
    }
    if (role === 'anon') {
      return {
        scheme: 'legacy-anon',
        privileged: false,
        label: 'legacy ANON JWT — not privileged',
        iat,
      };
    }
    return {
      scheme: 'legacy-jwt-unknown-role',
      privileged: false,
      label: `legacy JWT with role "${role ?? 'undecodable'}"`,
      iat,
    };
  }
  return { scheme: 'unrecognised', privileged: false, label: 'unrecognised key format', iat: null };
}

/**
 * The named causes. Each one sends the reader somewhere different, which is
 * the entire point of separating them.
 */
export type FailureCause =
  | 'clock-skew'
  | 'expired'
  | 'malformed-or-wrong-key'
  | 'wrong-privilege'
  | 'rls-denied'
  | 'unreachable'
  | 'other';

export interface Diagnosis {
  cause: FailureCause;
  /** One line, safe to paste anywhere. Names the client, the key and the fix. */
  detail: string;
}

export interface DiagnoseInput {
  /** Which client raised it — 'service-role' or 'anon'. */
  client: string;
  /** Verbatim message from supabase-js. */
  message: string;
  key: KeyFacts;
}

/**
 * Injectable clock. The one impure thing in this file, isolated to a single
 * line so the purity claim in the header stays true of everything else — and
 * so the iat comparison below can be tested at a fixed instant rather than
 * relative to whenever the suite happens to run.
 */
export let nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Test seam. Call with nothing to restore the real clock. */
export function setNowSeconds(fn?: () => number): void {
  nowSeconds = fn ?? (() => Math.floor(Date.now() / 1000));
}

export function diagnose({ client, message, key }: DiagnoseInput): Diagnosis {
  const m = message.toLowerCase();
  const where = `${client} client, ${key.label}`;

  /**
   * ⚠️ `JWT issued at future` IS A CLOCK PROBLEM, NOT A KEY PROBLEM, and the
   * distinction matters because the two fixes have nothing in common.
   *
   * PostgREST rejects a token whose `iat` is ahead of the server's clock. The
   * key is valid; the two machines disagree about the time. Rotating the key
   * changes nothing, and a freshly-issued key makes it MORE likely, not less —
   * a key minted seconds ago carries an `iat` closest to the skew boundary.
   */
  /*
    ⚠️ `m.includes('iat')` WAS A BARE SUBSTRING TEST AND IT MISFIRED ON FOUR
    ORDINARY WORDS: assoc-iat-ed, init-iat-ed, negot-iat-ion, different-iat-ed.
    "no rows associated with that key" and "connection initiated but refused"
    both classified as CLOCK SKEW — and clock skew is the one diagnosis in this
    file that tells the reader their key is FINE and sends them to look at a
    clock. A day of the wrong investigation, which is precisely the failure
    this module exists to prevent.

    It also never caught the message it was written for: 'JWT issued at future'
    contains no 'iat' substring at all. The clause earned nothing and cost the
    two most misleading false positives available. Word-boundary now.
  */
  if (m.includes('issued at future') || /\biat\b/.test(m) || m.includes('not yet valid')) {
    /*
      ⚠️ AND NOW IT CHECKS THE CLAIM INSTEAD OF REPEATING THE MESSAGE.

      The old text asserted the iat was ahead of the database clock because the
      error said so. It never decoded the token. When the iat is READABLE AND IN
      THE PAST — which it is for every legacy Supabase key, since they carry a
      fixed placeholder rather than a real issuance time — the message is not
      describing this key, and "check your clocks" sends the reader after
      something that cannot be the cause.
    */
    const now = nowSeconds();
    if (key.iat !== null && key.iat < now) {
      const age = Math.round((now - key.iat) / 86400);
      return {
        cause: 'clock-skew',
        detail:
          `${where}: the message says the token was issued in the future, but this ` +
          `key's iat decodes to ${new Date(key.iat * 1000).toISOString()} — ${age} days ` +
          `in the PAST. For that to be "future" the database clock would have to be ` +
          `wrong by the same amount, which no managed instance is. Legacy Supabase ` +
          `keys also carry a fixed placeholder iat, so re-issuing this key does not ` +
          `move it. Read the error as coming from a DIFFERENT client — the anon key, ` +
          `an edge function, or a session-minted token — or switch this slot to an ` +
          `sb_secret_ key, which is not a token and has no iat to reject. ` +
          `Run scripts/key-clock.mjs to see both clocks.`,
      };
    }
    return {
      cause: 'clock-skew',
      detail:
        `${where}: the token's issued-at time is reported AHEAD of the database's ` +
        `clock, and this key's iat could not be read to confirm it. This is clock ` +
        `skew, not a bad key — rotating it will not help. ` +
        // ⚠️ THE OLD TEXT SAID A JUST-ISSUED KEY MAKES THIS MORE LIKELY, because
        // its iat would sit closest to the boundary. True of tokens minted at
        // issue time, and NOT of legacy Supabase keys, which carry a fixed
        // placeholder iat. Re-issuing does not move it, so the advice pointed
        // at a mechanism that is not running here.
        `Run scripts/key-clock.mjs to print both clocks and this key's actual iat. ` +
        `The durable fix is an sb_secret_ key: an opaque identifier rather than a ` +
        `token, carrying no iat, so it cannot be rejected this way.`,
    };
  }

  if (m.includes('expired') || m.includes('exp')) {
    return {
      cause: 'expired',
      detail: `${where}: the token has EXPIRED. Issue a new key and redeploy.`,
    };
  }

  /**
   * The migration trap. A publishable or anon key in a slot expecting a
   * privileged one fails at the ROW level, not at the connection — reads
   * return empty or permission-denied rather than refusing to connect, which
   * reads as "no data" instead of "wrong key".
   */
  if (!key.privileged && key.scheme !== 'absent') {
    return {
      cause: 'wrong-privilege',
      detail:
        `${where}: this slot needs a PRIVILEGED key and holds one that is not. ` +
        `Supabase is migrating legacy anon/service_role JWTs to publishable/` +
        `secret keys; a publishable or anon key here fails per-row rather than ` +
        `at the connection, so it looks like an empty database. Set a ` +
        `service_role JWT or an sb_secret_ key.`,
    };
  }

  if (m.includes('jws') || m.includes('malformed') || m.includes('invalid signature')
      || m.includes('invalid jwt') || m.includes('invalid api key')) {
    return {
      cause: 'malformed-or-wrong-key',
      detail:
        `${where}: the key was REJECTED as invalid — wrong project, truncated ` +
        `on paste, or from the other key scheme. Re-copy it from the Supabase ` +
        `dashboard for THIS project and redeploy.`,
    };
  }

  if (m.includes('row-level security') || m.includes('permission denied')) {
    return {
      cause: 'rls-denied',
      detail:
        `${where}: RLS refused the row. A service-role key bypasses RLS, so ` +
        `seeing this from one means the key is not the privileged one it is ` +
        `assumed to be.`,
    };
  }

  if (m.includes('fetch failed') || m.includes('econnrefused') || m.includes('timeout')
      || m.includes('enotfound')) {
    return {
      cause: 'unreachable',
      detail: `${where}: the database could not be reached. Network or project state, not the key.`,
    };
  }

  return { cause: 'other', detail: `${where}: ${message}` };
}

/** The full line a surface prints. Symptom, then location, then the fix. */
export function explainFailure(input: DiagnoseInput): string {
  return `${input.message} — ${diagnose(input).detail}`;
}
