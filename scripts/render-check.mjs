/**
 * ═══════════════════════════════════════════════════════════════
 * THE RENDER CHECK. Rule 17, as a program.
 * ═══════════════════════════════════════════════════════════════
 *
 * The suite can read every property of a surface and still not know what it
 * looks like. Three defects in one batch proved it:
 *
 *   · the Dashboard's lead tile spanned two grid columns behind a
 *     two-character number — half a row of empty card, visibly broken, and
 *     every design-token assertion green. Correctly green: the type was right,
 *     the token applied, the contrast passed. The defect was in the
 *     relationship between the number and the space around it, which does not
 *     exist until the thing is drawn.
 *
 *   · `document.fonts.check('700 …')` returned true for weight 800, which was
 *     never loaded. It answers "would a face be used", not "is that face real".
 *
 *   · the feedback pill at z-40 covered the mobile tab bar at z-30, taking the
 *     taps for two of the four primary nav destinations. The nav suite asserts
 *     all eight render. All eight rendered.
 *
 * ══ WHAT IT ASKS ══
 *
 * OCCLUSION — `elementFromPoint` at each interactive target's centre must
 * return that element or something inside it. This is REACHABILITY, and it is
 * the assertion "does it render" can never be. An element underneath another
 * is present and unusable.
 *
 * TOUCH TARGETS — below the desktop breakpoint every interactive box clears
 * 44px, the floor already declared in tokens.css.
 *
 * HORIZONTAL OVERFLOW — `scrollWidth > clientWidth` on the document. Always a
 * defect, and invisible to every source-level test.
 *
 * ══ WHAT IT DELIBERATELY DOES NOT DO ══
 *
 * No screenshot diffing. A pixel baseline goes red on every legitimate change,
 * gets regenerated without being read, and becomes a rule-10 check that cannot
 * fail. It writes screenshots for a human to look at and asserts nothing about
 * them.
 *
 * ══ RUNNING IT ══
 *
 *   npm run build && npm run render-check
 *
 * Exits non-zero on any finding. It is part of the batch loop, not a spot
 * check at the end.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const PORT = Number(process.env.RENDER_CHECK_PORT ?? 3210);
const PASSWORD = 'render-check';
const OUT = process.env.RENDER_CHECK_OUT ?? '.render-check';

/** The three form factors the design system is specified against. */
const BREAKPOINTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'ipad', width: 834, height: 1112, touch: true },
  { name: 'mobile', width: 390, height: 844, touch: true },
];

/** Every surface with chrome on it. */
const SURFACES = [
  '/app',
  '/app/pipeline',
  '/app/intelligence',
  '/app/chat',
  '/app/maps',
  '/app/economics',
  '/app/forge',
  '/app/learn',
  '/app/settings',
];

const TOUCH_TARGET_MIN = 44;

/**
 * ⚠️ THE SELECTOR IS THE SCOPE OF THE CHECK. Anything not matched here is not
 * checked at all, so it is deliberately broad rather than a list of the
 * controls that were remembered.
 */
const INTERACTIVE = 'a[href], button, [role="button"], input, select, textarea';

const findings = [];
/** Informational: content under fixed chrome at scroll 0. Not a failure. */
const overlaps = [];
const note = (surface, breakpoint, kind, detail) =>
  findings.push({ surface, breakpoint, kind, detail });

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not answer on ${url} within ${timeoutMs}ms`);
}

/**
 * ⚠️ REFUSE A PORT THAT IS ALREADY ANSWERING.
 *
 * This check once reported "clean across 3 breakpoints x 9 surfaces" against
 * an app that threw a client-side exception on every page. A previous
 * `next start` was still bound to this port; the spawn below died on
 * EADDRINUSE with `stdio: 'ignore'` swallowing the reason; and the browser
 * talked to a STALE build whose chunks the rebuild had deleted.
 *
 * Every page was an error page. Error pages have no interactive elements, so
 * there was nothing to find, so the report said clean — a false pass that read
 * exactly like a real one.
 *
 * A checker that can silently examine the wrong server is worse than no
 * checker. This makes that state a hard stop rather than a green tick.
 */
async function refuseIfPortBusy() {
  try {
    await fetch(`http://localhost:${PORT}/login`, { redirect: 'manual' });
  } catch {
    return; // Nothing there. Good.
  }
  throw new Error(
    `Port ${PORT} is already answering. This check must start its own server, ` +
      `or it may test a stale build. Stop it (pkill -f "next start") or set ` +
      `RENDER_CHECK_PORT.`,
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await refuseIfPortBusy();

  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: { ...process.env, APP_PASSWORD: PASSWORD },
    stdio: 'ignore',
    detached: false,
  });

  try {
    await waitForServer(`http://localhost:${PORT}/login`);

    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    for (const bp of BREAKPOINTS) {
      const ctx = await browser.newContext({
        viewport: { width: bp.width, height: bp.height },
        hasTouch: bp.touch,
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();

      /**
       * The browser console is the only place some failures appear at all.
       * The service worker's "script resource is behind a redirect" — the auth
       * gate breaking PWA registration — was invisible everywhere else.
       */
      let surfaceErrors = [];
      page.on('pageerror', (e) => surfaceErrors.push(`uncaught: ${e.message.slice(0, 160)}`));
      page.on('console', (m) => {
        if (m.type() === 'error') surfaceErrors.push(`console: ${m.text().slice(0, 160)}`);
      });

      // The app is behind the password gate; sign in once per context.
      await page.goto(`http://localhost:${PORT}/login`);
      await page.fill('input[type=password]', PASSWORD);
      await page.click('button[type=submit]');
      await page.waitForURL(/\/app/, { timeout: 30000 });

      for (const surface of SURFACES) {
        surfaceErrors = [];
        await page.goto(`http://localhost:${PORT}${surface}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        // Client panels mount after hydration; give layout a beat to settle.
        await page.waitForTimeout(350);

        /**
         * ⚠️ PROVE THE SURFACE RENDERED BEFORE BELIEVING ANY FINDING ABOUT IT.
         *
         * Rule 4: this check could only fail in one direction. A blank error
         * page yields zero findings and reads as a pass. So every surface must
         * present the chrome it is supposed to have, and "nothing to check" is
         * itself the loudest finding.
         */
        const rendered = await page.evaluate(() => ({
          nav: Boolean(document.querySelector('nav[aria-label="Main"], nav[aria-label="Primary"]')),
          interactive: document.querySelectorAll('a[href], button').length,
          title: document.title,
        }));
        if (!rendered.nav || rendered.interactive < 8) {
          note(
            surface,
            bp.name,
            'did-not-render',
            `nav=${rendered.nav} interactive=${rendered.interactive} title="${rendered.title}" — ` +
              `the surface did not render, so nothing below it was actually checked`,
          );
        }
        for (const e of surfaceErrors) note(surface, bp.name, 'page-error', e);

        const result = await page.evaluate(
          ({ selector, min, isTouch }) => {
            const out = { occluded: [], overlapped: [], small: [], overflow: null };

            const doc = document.documentElement;
            if (doc.scrollWidth > doc.clientWidth) {
              out.overflow = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
            }

            const describe = (el) => {
              const label =
                el.getAttribute('aria-label') ||
                el.textContent?.trim().slice(0, 40) ||
                el.getAttribute('href') ||
                el.tagName.toLowerCase();
              return `${el.tagName.toLowerCase()}"${label}"`;
            };

            for (const el of document.querySelectorAll(selector)) {
              const r = el.getBoundingClientRect();
              // Off-screen, collapsed or display:none elements are not targets.
              if (r.width === 0 || r.height === 0) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
              // Only what is inside the viewport can be hit-tested at all.
              if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
              if (el.hasAttribute('disabled')) continue;
              // ⚠️ THIRD-PARTY CHROME IS OUT OF SCOPE, AND SAYING SO IS PART
              // OF THE CHECK. Leaflet draws its own zoom buttons, layer
              // toggles and attribution; their geometry is not ours to set and
              // the attribution links are a licence requirement, not a
              // decision. Counting them would bury our own findings under
              // thirteen we cannot act on. Named as a selector rather than
              // filtered out of the report, so the exclusion is visible.
              if (el.closest('.leaflet-container, .leaflet-control')) continue;

              const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
              const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
              const hit = document.elementFromPoint(cx, cy);

              // ⚠️ `contains` BOTH WAYS. A label inside a button is a legitimate
              // hit for that button, and a button inside a link likewise — the
              // question is whether the tap reaches this control, not whether
              // it lands on this exact node.
              if (hit && !el.contains(hit) && !hit.contains(el)) {
                /**
                 * ⚠️ ONLY PINNED TARGETS COUNT, and the distinction is the
                 * difference between a bug and a scroll position.
                 *
                 * Content in normal flow that happens to sit under fixed
                 * chrome right now is revealed by scrolling — the layout
                 * already reserves room for it (`pb-24` clears the tab bar).
                 * Reporting that is noise, and the first run produced plenty:
                 * a deal card "covered by" the tab bar simply because the page
                 * was at scroll 0.
                 *
                 * A target inside a fixed or sticky container cannot be
                 * scrolled clear. That is unreachable, permanently, and it is
                 * both defects this check was built for: the pill over the tab
                 * bar, and Learn under the search control.
                 */
                let pinned = false;
                for (let n = el; n && n !== document.body; n = n.parentElement) {
                  const pos = getComputedStyle(n).position;
                  if (pos === 'fixed' || pos === 'sticky') {
                    pinned = true;
                    break;
                  }
                }
                if (pinned) {
                  out.occluded.push({ target: describe(el), covering: describe(hit) });
                } else {
                  out.overlapped.push({ target: describe(el), covering: describe(hit) });
                }
              }

              if (isTouch && (r.width < min || r.height < min)) {
                out.small.push({
                  target: describe(el),
                  size: `${Math.round(r.width)}x${Math.round(r.height)}`,
                });
              }
            }
            return out;
          },
          { selector: INTERACTIVE, min: TOUCH_TARGET_MIN, isTouch: bp.touch },
        );

        for (const o of result.occluded) {
          note(surface, bp.name, 'occluded', `${o.target} is covered by ${o.covering}`);
        }
        // Reported, never failed on: see the note in the page evaluation.
        for (const o of result.overlapped) {
          overlaps.push(`${bp.name} ${surface}: ${o.target} sits under ${o.covering} at scroll 0`);
        }
        for (const s of result.small) {
          note(surface, bp.name, 'touch-target', `${s.target} is ${s.size}, under ${TOUCH_TARGET_MIN}px`);
        }
        if (result.overflow) {
          note(
            surface,
            bp.name,
            'overflow',
            `document scrolls horizontally: ${result.overflow.scrollWidth}px in ${result.overflow.clientWidth}px`,
          );
        }

        await page.screenshot({
          path: `${OUT}/${bp.name}${surface.replace(/\//g, '_')}.png`,
        });
      }

      await ctx.close();
    }

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  // ── Report ──
  if (overlaps.length > 0) {
    console.log(`render-check: ${overlaps.length} element(s) under fixed chrome at scroll 0 — informational, scrolling reveals them.`);
  }

  if (findings.length === 0) {
    console.log(
      `render-check: clean across ${BREAKPOINTS.length} breakpoints x ${SURFACES.length} surfaces.`,
    );
    console.log(`screenshots in ${OUT}/`);
    return;
  }

  const byKind = {};
  for (const f of findings) (byKind[f.kind] ??= []).push(f);

  console.error(`render-check: ${findings.length} finding(s).\n`);
  for (const [kind, list] of Object.entries(byKind)) {
    console.error(`── ${kind} (${list.length}) ──`);
    for (const f of list) console.error(`  ${f.breakpoint} ${f.surface}: ${f.detail}`);
    console.error('');
  }
  process.exitCode = 1;
}

await main();
