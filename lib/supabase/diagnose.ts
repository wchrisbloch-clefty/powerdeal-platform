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
}

function decodeRole(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { role?: string };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    // A key that will not decode is not a JWT. Reported as unrecognised rather
    // than assumed to be one.
    return null;
  }
}

export function keyShape(raw: string | undefined | null): KeyFacts {
  const key = raw?.trim();
  if (!key) {
    return { scheme: 'absent', privileged: false, label: 'not set' };
  }
  if (key.startsWith('sb_secret_')) {
    return { scheme: 'new-secret', privileged: true, label: 'new-scheme secret key (sb_secret_…)' };
  }
  if (key.startsWith('sb_publishable_')) {
    return {
      scheme: 'new-publishable',
      privileged: false,
      label: 'new-scheme PUBLISHABLE key (sb_publishable_…) — not privileged',
    };
  }
  if (key.startsWith('eyJ')) {
    const role = decodeRole(key);
    if (role === 'service_role') {
      return {
        scheme: 'legacy-service-role',
        privileged: true,
        label: 'legacy service_role JWT',
      };
    }
    if (role === 'anon') {
      return {
        scheme: 'legacy-anon',
        privileged: false,
        label: 'legacy ANON JWT — not privileged',
      };
    }
    return {
      scheme: 'legacy-jwt-unknown-role',
      privileged: false,
      label: `legacy JWT with role "${role ?? 'undecodable'}"`,
    };
  }
  return { scheme: 'unrecognised', privileged: false, label: 'unrecognised key format' };
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
  if (m.includes('issued at future') || m.includes('iat') || m.includes('not yet valid')) {
    return {
      cause: 'clock-skew',
      detail:
        `${where}: the token's issued-at time is AHEAD of the database's clock. ` +
        `This is clock skew, not a bad key — rotating it will not help, and a ` +
        `just-issued key makes it more likely because its iat sits closest to ` +
        `the boundary. Check the two clocks, or re-issue the key once they agree.`,
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
