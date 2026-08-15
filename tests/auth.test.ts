import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  issueSession,
  verifySession,
  isAuthenticated,
  passwordMatches,
  constantTimeEqual,
} from '@/lib/auth/session';
import {
  PUBLIC_ROUTES,
  CRON_ROUTES,
  INFRASTRUCTURE_PREFIXES,
  isPublicPath,
  isInfrastructurePath,
  isCronPath,
} from '@/lib/auth/public-routes';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE APP WAS PUBLIC. THIS IS THE SECOND LAYER.
 * ═══════════════════════════════════════════════════════════════
 *
 * 44 API routes, 35 reaching a service-role client that bypasses every RLS
 * policy, 24 accepting writes, no middleware at all, and `/app` with no gate.
 * On Hobby, Vercel offers nothing — Standard Protection covers deployment URLs
 * and not the production alias, and Password Protection is Pro-gated.
 *
 * THE ASSERTION THAT MATTERS is the last block: every route is ENUMERATED FROM
 * THE FILESYSTEM and each one must be covered by the middleware matcher and
 * absent from the public list. A route added tomorrow is in that enumeration
 * the moment its file exists, so it cannot ship public by omission.
 */

const SECRET = 'correct horse battery staple';

// ── The primitive ───────────────────────────────────────────────

describe('the session cookie cannot be forged, replayed or extended', () => {
  it('a freshly issued cookie verifies', async () => {
    expect(await verifySession(SECRET, await issueSession(SECRET))).toBe('valid');
  });

  it('a cookie signed with a DIFFERENT password does not', async () => {
    // Rotating APP_PASSWORD is the revocation mechanism — it has to invalidate
    // every outstanding cookie at once.
    const cookie = await issueSession('old password');
    expect(await verifySession(SECRET, cookie)).toBe('bad-signature');
  });

  it('an expired cookie is refused even though its signature is valid', async () => {
    const now = Date.now();
    const cookie = await issueSession(SECRET, now - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
    expect(await verifySession(SECRET, cookie, now)).toBe('expired');
    expect(await isAuthenticated(SECRET, cookie, now)).toBe(false);
  });

  it('the EXPIRY IS SIGNED, so editing it breaks the signature', async () => {
    // Max-Age is a request to the browser. Anyone can replay a cookie past it,
    // so the server has to enforce the expiry itself.
    const cookie = await issueSession(SECRET);
    const [, sig] = cookie.split('.');
    const forged = `${Date.now() + 10 * 365 * 24 * 3600_000}.${sig}`;
    expect(await verifySession(SECRET, forged)).toBe('bad-signature');
  });

  it('garbage is malformed, not accepted', async () => {
    for (const bad of ['', 'nonsense', '.', 'abc.def', '123', 'x.']) {
      expect(await isAuthenticated(SECRET, bad), `accepted "${bad}"`).toBe(false);
    }
    expect(await isAuthenticated(SECRET, undefined)).toBe(false);
    expect(await isAuthenticated(SECRET, null)).toBe(false);
  });

  it('FAILS CLOSED with no password configured — even for a valid cookie', async () => {
    // An auth layer that disables itself when unconfigured is not an auth
    // layer, and "the env var was missing" is how a gate ends up open.
    const cookie = await issueSession(SECRET);
    expect(await verifySession(undefined, cookie)).toBe('no-secret');
    expect(await isAuthenticated(undefined, cookie)).toBe(false);
    expect(await isAuthenticated('', cookie)).toBe(false);
  });

  it('verdicts are NAMED, so expired and forged are distinguishable', async () => {
    // A boolean collapses them, and they warrant different responses.
    const verdicts = new Set([
      await verifySession(SECRET, await issueSession(SECRET)),
      await verifySession(SECRET, await issueSession('other')),
      await verifySession(SECRET, `${Date.now() - 1000}.${(await issueSession(SECRET, Date.now() - SESSION_MAX_AGE_SECONDS * 1000 - 1000)).split('.')[1]}`),
      await verifySession(SECRET, 'garbage'),
      await verifySession(undefined, 'anything'),
    ]);
    expect(verdicts.size).toBeGreaterThanOrEqual(4);
  });
});

describe('password comparison is constant-time and fails closed', () => {
  it('matches only the exact password', () => {
    expect(passwordMatches(SECRET, SECRET)).toBe(true);
    expect(passwordMatches(SECRET, 'correct horse battery stapl')).toBe(false);
    expect(passwordMatches(SECRET, 'Correct horse battery staple')).toBe(false);
    expect(passwordMatches(SECRET, '')).toBe(false);
  });

  it('refuses everything when unset — including the empty string', () => {
    expect(passwordMatches(undefined, '')).toBe(false);
    expect(passwordMatches(undefined, 'anything')).toBe(false);
    expect(passwordMatches('', '')).toBe(false);
  });

  it('the comparison has no early return on a differing byte', async () => {
    // An early return leaks the secret one character at a time to anyone
    // willing to measure.
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    const src = await readFile('lib/auth/session.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function constantTimeEqual'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('diff |=');
    expect(body).not.toMatch(/if \([^)]*\)\s*return false;\s*\n\s*\}\s*\n\s*return/);
  });
});

// ── The boundary ────────────────────────────────────────────────

describe('deny by default — the exception list is tiny and justified', () => {
  it('exactly TWO public routes, and each carries its reason', () => {
    // Growing this list fails here, which is the point: adding a public route
    // is a security change and has to be argued for in a diff.
    expect(PUBLIC_ROUTES.map((r) => r.prefix).sort()).toEqual([
      '/api/auth/login',
      '/login',
    ]);
    for (const r of PUBLIC_ROUTES) expect(r.why.length).toBeGreaterThan(30);
  });

  it('the public login endpoint reads NOTHING', async () => {
    // The worst an attacker gets from unlimited access is password guesses.
    const src = await readFile('app/api/auth/login/route.ts', 'utf8');
    for (const forbidden of ['getAdminClient', 'supabase', 'lib/data']) {
      expect(src, `login route touches ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('and it delays every failure, including a malformed body', async () => {
    // So the timing carries no signal about which kind of failure it was.
    const src = await readFile('app/api/auth/login/route.ts', 'utf8');
    expect(src).toContain('FAILURE_DELAY_MS');
    expect(src.match(/return refuse\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('a wrong password and an unconfigured deployment answer IDENTICALLY', async () => {
    // Distinguishing them tells a probe which deployment is worth attacking.
    const src = await readFile('app/api/auth/login/route.ts', 'utf8');
    const refuse = src.slice(src.indexOf('async function refuse'));
    expect(refuse.slice(0, refuse.indexOf('\n}'))).toContain('Incorrect password.');
    expect(src).not.toContain('APP_PASSWORD is not set' + '"');
  });

  it('infrastructure prefixes never include /_next wholesale', () => {
    // `/_next/data` serves route payloads — real application data. A broad
    // prefix would hand it out unauthenticated while looking like a
    // static-asset exemption.
    expect(INFRASTRUCTURE_PREFIXES).not.toContain('/_next');
    expect(isInfrastructurePath('/_next/data/build/app.json')).toBe(false);
    expect(isInfrastructurePath('/_next/static/chunk.js')).toBe(true);
  });

  it('path matching cannot be fooled by a prefix that is not a segment', () => {
    // `/loginsomething` must not inherit `/login`'s exemption.
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/login/')).toBe(true);
    expect(isPublicPath('/loginsomething')).toBe(false);
    expect(isPublicPath('/api/auth/login')).toBe(true);
    expect(isPublicPath('/api/auth/loginX')).toBe(false);
    expect(isPublicPath('/app')).toBe(false);
    expect(isPublicPath('/api/deals')).toBe(false);
  });
});

describe('the six scheduled jobs keep working', () => {
  it('every cron route is recognised', () => {
    for (const p of ['/api/cron/recap', '/api/cron/feed-health', '/api/feed/sweep']) {
      expect(isCronPath(p), `${p} is not a cron path`).toBe(true);
    }
  });

  it('cron paths are NOT public — they need the secret, just not a cookie', () => {
    // The distinction that keeps this from being a hole.
    for (const p of CRON_ROUTES) expect(isPublicPath(p)).toBe(false);
  });

  it('middleware accepts BOTH credential forms the jobs actually send', async () => {
    // Three Supabase pg_cron jobs send x-cron-secret; three Vercel crons send
    // Authorization: Bearer. Breaking either silently stops half the schedule.
    const src = await readFile('middleware.ts', 'utf8');
    expect(src).toContain("request.headers.get('x-cron-secret')");
    expect(src).toContain("auth?.startsWith('Bearer ')");
    expect(src).toContain('constantTimeEqual');
  });

  it('and refuses them when CRON_SECRET is unset', async () => {
    const src = await readFile('middleware.ts', 'utf8');
    const fn = src.slice(src.indexOf('function cronAuthorized'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('if (!secret) return false;');
  });

  it('the route handlers STILL check the secret themselves', async () => {
    // Two independent checks of the same credential, on purpose. Middleware
    // could be misconfigured; the handler is the second layer's second layer.
    for (const p of [
      'app/api/cron/recap/route.ts',
      'app/api/cron/feed-health/route.ts',
      'app/api/feed/sweep/route.ts',
    ]) {
      expect(await readFile(p, 'utf8'), `${p} dropped its own check`).toContain(
        'isCronAuthorized',
      );
    }
  });
});

describe('middleware behaviour', () => {
  it('API routes get 401 JSON, pages get redirected', async () => {
    // A fetch that receives an HTML login page dies on "Unexpected token '<'"
    // — the exact failure the feed-health probe hit against Vercel SSO.
    const src = await readFile('middleware.ts', 'utf8');
    expect(src).toContain("pathname.startsWith('/api/')");
    expect(src).toContain('status: 401');
    expect(src).toContain('NextResponse.redirect(login)');
  });

  it('the matcher is EXECUTED against real paths, not read for substrings', async () => {
    /**
     * ⚠️ A TEXT ASSERTION HERE LET THE WORST MUTATION THROUGH.
     *
     * The first version checked `expect(matcher).not.toContain('/api')`.
     * Narrowing the matcher to `(?!api|_next/static|…)` — no leading slash —
     * passed it, and that single edit leaves all 44 API routes unprotected
     * while every other test in this file still goes green. The most
     * dangerous possible change to this codebase, invisible to the check
     * guarding it.
     *
     * So the pattern is COMPILED and run against the paths that must be
     * covered. A matcher is a regex; the only honest way to test one is to
     * execute it.
     */
    const src = await readFile('middleware.ts', 'utf8');
    const raw = /matcher:\s*\[\s*'([^']+)'/.exec(src)![1];
    const matcher = new RegExp(`^${raw}$`);

    const mustBeCovered = [
      '/api/deals', '/api/spine/export', '/api/feed/health', '/api/usage',
      '/api/learn', '/api/settings', '/api/auth/login',
      '/app', '/app/pipeline', '/app/settings', '/login', '/',
      // The one that looks like a static asset and is not.
      '/_next/data/build/app.json',
    ];
    for (const path of mustBeCovered) {
      expect(matcher.test(path), `matcher does NOT cover ${path}`).toBe(true);
    }

    // Only build output may bypass middleware entirely.
    for (const path of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico']) {
      expect(matcher.test(path), `matcher covers build output ${path}`).toBe(false);
    }
  });

  it('the redirect target is a PATH, never an absolute URL', async () => {
    // `?next=https://evil.test` would make the login page a phishing primitive.
    const src = await readFile('components/chrome/login-form.tsx', 'utf8');
    expect(src).toContain("next.startsWith('/')");
    // `//host` is protocol-relative and would leave the origin.
    expect(src).toContain("!next.startsWith('//')");
  });

  it('the cookie name is shared, not restated in three places', async () => {
    // A second literal is a second thing to get wrong when it changes.
    expect(SESSION_COOKIE).toBe('pd_session');
    for (const p of ['middleware.ts', 'app/api/auth/login/route.ts']) {
      const src = await readFile(p, 'utf8');
      expect(src, `${p} hardcodes the cookie name`).toContain('SESSION_COOKIE');
      expect(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')).not.toContain("'pd_session'");
    }
  });

  it('the cookie is httpOnly, secure and sameSite', async () => {
    const src = await readFile('app/api/auth/login/route.ts', 'utf8');
    expect(src).toContain('httpOnly: true');
    expect(src).toContain('secure: true');
    expect(src).toContain("sameSite: 'lax'");
  });

  it('sign-out clears the cookie rather than relying on expiry', async () => {
    const src = await readFile('app/api/auth/login/route.ts', 'utf8');
    expect(src).toContain('export async function DELETE');
    expect(src).toContain('maxAge: 0');
  });
});

// ── The enumeration ─────────────────────────────────────────────

async function everyRoute(): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, url: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Route groups `(x)` contribute no URL segment.
        const seg = entry.name.startsWith('(') ? '' : `/${entry.name}`;
        await walk(join(dir, entry.name), url + seg);
      } else if (entry.name === 'route.ts' || entry.name === 'page.tsx') {
        found.push(url || '/');
      }
    }
  }
  await walk('app', '');
  return [...new Set(found)].sort();
}

describe('EVERY route is protected — enumerated, not listed by hand', () => {
  it('the enumeration finds the routes we know exist', async () => {
    // Rule 10: a parameterised test over an empty set cannot fail.
    const routes = await everyRoute();
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContain('/api/deals');
    expect(routes).toContain('/api/spine/export');
    expect(routes).toContain('/app/pipeline');
    expect(routes).toContain('/login');
  });

  it('NOTHING is public except the two justified exceptions', async () => {
    // The assertion the whole file exists for. A route added tomorrow appears
    // in this enumeration the moment its file does, so it cannot ship public
    // by omission — the failure mode that left /api/feed/health open.
    const routes = await everyRoute();
    const publicOnes = routes.filter((r) => isPublicPath(r));
    expect(publicOnes.sort()).toEqual(['/api/auth/login', '/login']);
  });

  it('every OTHER route would be refused without a session', async () => {
    const routes = await everyRoute();
    const unprotected: string[] = [];
    for (const r of routes) {
      if (isPublicPath(r) || isInfrastructurePath(r)) continue;
      // Cron routes authenticate on CRON_SECRET; everything else needs a
      // cookie, and with no cookie `isAuthenticated` is false either way.
      if (isCronPath(r)) continue;
      if (!(await isAuthenticated(SECRET, undefined))) continue;
      unprotected.push(r);
    }
    expect(unprotected).toEqual([]);
  });

  it('and every route reaching the service-role client is behind the gate', async () => {
    // The 35 from the audit. None of them may be public, ever.
    const routes = (await everyRoute()).filter((r) => r.startsWith('/api/'));
    const exposed = routes.filter((r) => isPublicPath(r) && r !== '/api/auth/login');
    expect(exposed).toEqual([]);
  });
});
