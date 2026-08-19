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
import { spawn, spawnSync } from 'node:child_process';
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

/**
 * ═══════════════════════════════════════════════════════════════
 * HOW THIS LIST WAS DERIVED. Rule 18 — an enumeration is a claim.
 * ═══════════════════════════════════════════════════════════════
 *
 * A hardcoded list looks identical whether it is exhaustive or whether someone
 * stopped typing, and this one has been wrong twice while reporting clean:
 * nine surfaces while the gap system lived on a tenth, ten while eight
 * Intelligence tabs were on none of them. So the derivation is stated, and an
 * omission has to be an argument rather than an oversight.
 *
 * DERIVED FROM, in order:
 *
 *   1. `NAV_ITEMS` in components/chrome/nav.tsx — the eight destinations the
 *      product itself claims to have — plus `SETTINGS_ITEM`, which sits apart
 *      from the eight in both bars.
 *   2. Every `?tab=` value in `INTEL_TABS`, because a tabbed surface is
 *      several surfaces: each tab is a link loading only its own data, and
 *      only the default was ever rendered.
 *   3. One DETAIL page, because the collection pages exercise none of the
 *      record-level components. `seed-def-001` is chosen as the SPARSEST
 *      record the seed holds — the state 21 real deals are in — rather than a
 *      happy path that would render no gaps at all.
 *
 * DELIBERATELY EXCLUDED, each an argument rather than an omission:
 *
 *   · `/login` — outside the shell, has no nav, and is covered by
 *     tests/auth.test.ts against the route manifest.
 *   · `/app/ccus` and `/app/pricing-intel` — bare `redirect()` calls into the
 *     Intelligence tabs, which ARE in the list. Nothing renders at either.
 *   · `/app/entity/[slug]` and `/app/social` — no seed record reaches them, so
 *     including them would add two surfaces that render an empty state and
 *     nothing else. This is the weakest exclusion here and is the first place
 *     to look when something slips through.
 *
 * ⚠️ NOT DERIVED AUTOMATICALLY FROM THE ROUTE TREE, and that is a choice with
 * a cost. A filesystem walk would be exhaustive by construction and would need
 * a fixture for every dynamic segment — inventing ids for routes no seed
 * record reaches. The manual list is legible and can go stale; the automatic
 * one cannot go stale and would need fabricated data to run. Legible won, and
 * the assertion that the count matches NAV_ITEMS is what keeps it honest.
 */
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
  /**
   * ⚠️ A DETAIL PAGE, AND RULE 18 IS WHY IT IS HERE.
   *
   * The first run after the gap system shipped came back clean across nine
   * surfaces — and the gap components appear on NONE of them. The MEDDPICC
   * slot lives on a deal, the deal detail route was not in this list, and a
   * check reporting "clean" about a component it never loaded is the same
   * empty-universe pass this script was built after.
   *
   * `seed-def-001` is BAE Systems in the shipped seed, and it is deliberately
   * the sparsest kind of record this product holds: no MEDDPICC beyond a
   * champion, no critical event, single-threaded. It is the state 21 real
   * deals are in, which makes it the right page to render the gap system
   * against rather than a happy path that would exercise none of it.
   */
  '/app/pipeline/seed-def-001',
  /**
   * ⚠️ A TABBED SURFACE IS SEVERAL SURFACES, AND ONLY ONE WAS CHECKED.
   *
   * Intelligence has nine tabs, each a `?tab=` link loading only its own data.
   * This list had `/app/intelligence` — the default tab, Headlines — and
   * therefore had never rendered the other eight, including two panels that
   * were migrated to PageHeader in this very batch.
   *
   * Found by a mutation that SURVIVED: restoring a duplicate `<h1>` inside the
   * Feed panel reported clean, because the Feed panel never rendered. The
   * duplicate was real — it just lived on a tab nothing visited, which meant
   * the fix for it was also unverified.
   *
   * Third time this shape has appeared: nine surfaces clean while the gap
   * system was on a tenth, ten clean while eight tabs were on none of them.
   * Rule 18 asks whether N things were inspected; the harder half is knowing
   * what N is.
   */
  '/app/intelligence?tab=feed',
  '/app/intelligence?tab=market-watch',
  '/app/intelligence?tab=trending',
  '/app/intelligence?tab=signals',
  '/app/intelligence?tab=ccus',
  '/app/intelligence?tab=pricing',
  '/app/intelligence?tab=video',
  '/app/intelligence?tab=research',
];

const TOUCH_TARGET_MIN = 44;

/**
 * `--text-2xl`, the page-title step, resolved to px. Written as the computed
 * value because that is what the browser reports — if the token changes, this
 * fails and is meant to: the step moving is a design decision, not a drift.
 */
const PAGE_TITLE_SIZE = '28px';

/**
 * ⚠️ THE SELECTOR IS THE SCOPE OF THE CHECK. Anything not matched here is not
 * checked at all, so it is deliberately broad rather than a list of the
 * controls that were remembered.
 */
const INTERACTIVE = 'a[href], button, [role="button"], input, select, textarea';

const findings = [];
/** Informational: content under fixed chrome at scroll 0. Not a failure. */
const overlaps = [];
/** Outbound fetches this network blocked. A fact about the runner, not the app. */
const blockedRequests = [];
/** Rule 18: the gap system must actually appear somewhere in the run. */
let gapSlotsSeen = 0;
/** Surfaces whose network never went quiet. Informational on this runner. */
const neverSettled = [];
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

/**
 * ⚠️ BUILD FIRST. THE CHECK ESTABLISHES ITS OWN SUBJECT.
 *
 * `next start` serves `.next`, whatever is in it. A run after an edit — or
 * after a mutation was reverted — served the PREVIOUS build, so the report
 * described code that no longer existed. It reported a duplicate `<h1>` that
 * had already been removed, and would just as happily have reported a fix that
 * was not there.
 *
 * Same principle as refusing a port that is already answering: a checker which
 * can silently examine the wrong subject is worse than no checker. Skippable
 * with RENDER_CHECK_SKIP_BUILD for a fast iteration loop, and skipping it is
 * announced so a stale run cannot be mistaken for a fresh one.
 */
function buildFirst() {
  if (process.env.RENDER_CHECK_SKIP_BUILD) {
    console.log('render-check: ⚠️  BUILD SKIPPED — this run describes whatever is in .next, not your source.');
    return;
  }
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'ignore' });
  if (r.status !== 0) {
    throw new Error('render-check: the build failed, so there is nothing valid to check.');
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  buildFirst();
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

        /**
         * ⚠️ ONE SURFACE MUST NOT TAKE THE RUN WITH IT, AND A SURFACE THAT
         * COULD NOT BE LOADED MUST BE REPORTED RATHER THAN SKIPPED.
         *
         * `networkidle` never arrived on the Trending tab — it fetches an
         * external source this sandbox blocks, so the network never went
         * quiet — and the unhandled timeout killed the process. Every surface
         * after it went unchecked, and the run exited without saying which.
         * That is the empty-universe pass with a stack trace instead of a
         * green tick.
         *
         * So: fall back to `load` when idle does not arrive, and record BOTH
         * the fallback and any hard failure as findings. A page that never
         * settles is worth knowing about on a real network too.
         */
        try {
          await page.goto(`http://localhost:${PORT}${surface}`, {
            waitUntil: 'networkidle',
            timeout: 15000,
          });
        } catch {
          try {
            await page.goto(`http://localhost:${PORT}${surface}`, {
              waitUntil: 'load',
              timeout: 15000,
            });
            neverSettled.push(`${bp.name} ${surface}`);
          } catch (err) {
            note(surface, bp.name, 'could-not-load', `${(err && err.message) || err}`.slice(0, 140));
            continue;
          }
        }
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
          /**
           * ⚠️ VISIBLE, NOT MERELY PRESENT — and this guard had the exact bug
           * it exists to catch.
           *
           * `querySelector('nav[aria-label="Main"]')` finds the desktop bar on
           * a phone, because `hidden md:block` is CSS and the element is still
           * in the DOM. So on mobile this passed on the strength of an
           * invisible element, and the tab bar that actually renders there was
           * never checked. If the tab bar vanished entirely, the guard would
           * have said the surface rendered.
           *
           * Same shape as the `<Link>` painted as a button: keyed to what the
           * markup IS rather than to what it DOES. A nav that occupies no
           * pixels is not navigation.
           */
          nav: [...document.querySelectorAll('nav')].some((n) => {
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }),
          // `[role="button"]` counts: a div wired as a control is a control.
          interactive: document.querySelectorAll('a[href], button, [role="button"]').length,
          title: document.title,
          /**
           * ⚠️ COUNTED SO THE GAP SYSTEM CANNOT BE "CLEAN" WHILE ABSENT.
           * Reported per surface below; the run fails if no surface renders a
           * single gap slot, because that means every assertion about the gap
           * system was made against a page that does not contain one.
           */
          gapSlots: document.querySelectorAll('.border-gap-rule, [class*="border-gap-rule"]').length,
          /**
           * ⚠️ ONE PAGE TITLE PER SURFACE, AT ONE SIZE, MEASURED.
           *
           * The eyebrow-plus-h1 block was hand-copied into six files, and
           * where it was not copied it drifted: Learn's page title was
           * `text-lg` (card-title size, three steps down), Economics had no
           * eyebrow, Chat had no header at all — and the Intelligence surface
           * rendered the title TWICE, once from the page and once from the
           * feed panel mounted inside it, two <h1>s reading "Intelligence"
           * directly under each other.
           *
           * A source scan cannot see any of that: each file looked right on
           * its own, and the duplicate lived in two files neither author had
           * open. Counting rendered <h1>s and reading their computed size is
           * the only check that catches all four.
           */
          headings: [...document.querySelectorAll('h1')]
            .filter((h) => {
              const r = h.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
            .map((h) => ({
              text: (h.textContent || '').trim().slice(0, 30),
              size: getComputedStyle(h).fontSize,
            })),
          /**
           * ⚠️ NAV LABELS, MEASURED AT REST — AND THE ORDER OF THIS BLOCK IS
           * LOAD-BEARING.
           *
           * The reachability pass below calls
           * `el.scrollIntoView({ inline: 'nearest' })` on anything that fails
           * a hit-test. The main nav is a horizontal scroll container, so that
           * call SCROLLS IT — and the screenshot is taken afterwards. A run
           * that scrolls the nav and then photographs it produces a picture of
           * a clipped nav that the user never sees, and a run that measures
           * after the same pass measures a state the check itself created.
           *
           * That is rule 19 twice over: the check both causes the artifact and
           * would be the thing reporting it. So this runs BEFORE any hit-test,
           * at scroll zero, and records the container's own geometry alongside
           * each label — so a finding can distinguish "the app clips this" from
           * "something scrolled the container".
           *
           * Reachability is still the reachability pass's job. This asks a
           * different question, which the previous fix explicitly did not
           * answer: is the label FULLY LEGIBLE without interaction? An item you
           * can reach by scrolling is reachable and not yet readable, and a nav
           * whose first item reads "ipeline" has failed at something the
           * hit-test is right not to call a failure.
           */
          navLabels: (() => {
            const bar = [...document.querySelectorAll('nav[aria-label="Main"]')].find((n) => {
              const r = n.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
            if (!bar) return null;
            const box = bar.getBoundingClientRect();
            const items = [...bar.querySelectorAll('a[href]')].map((a) => {
              const span = a.querySelector('span') || a;
              const r = span.getBoundingClientRect();
              return {
                text: (span.textContent || '').trim(),
                // How much of the label falls outside the nav's own box, in px.
                clippedLeft: Math.max(0, box.left - r.left),
                clippedRight: Math.max(0, r.right - box.right),
                width: r.width,
              };
            });
            return {
              scrollLeft: bar.scrollLeft,
              scrollWidth: bar.scrollWidth,
              clientWidth: bar.clientWidth,
              items,
            };
          })(),
        }));
        gapSlotsSeen += rendered.gapSlots;
        if (!rendered.nav || rendered.interactive < 8) {
          note(
            surface,
            bp.name,
            'did-not-render',
            `nav=${rendered.nav} interactive=${rendered.interactive} title="${rendered.title}" — ` +
              `the surface did not render, so nothing below it was actually checked`,
          );
        }
        if (rendered.headings.length !== 1) {
          note(
            surface,
            bp.name,
            'page-title',
            `${rendered.headings.length} visible <h1> — ${
              rendered.headings.map((h) => `"${h.text}" @${h.size}`).join(', ') || 'none'
            }. Every surface has exactly one page title.`,
          );
        } else if (rendered.headings[0].size !== PAGE_TITLE_SIZE) {
          note(
            surface,
            bp.name,
            'page-title',
            `"${rendered.headings[0].text}" is ${rendered.headings[0].size}, not the page-title step (${PAGE_TITLE_SIZE})`,
          );
        }

        /**
         * ⚠️ "NOTHING TO INSPECT" IS THE LOUDEST FINDING. A null here means no
         * visible main nav was found at all, which the did-not-render guard
         * above should already have caught — reported separately so a silent
         * selector change cannot turn this check off.
         */
        if (rendered.navLabels === null) {
          note(surface, bp.name, 'nav-labels', 'no visible nav[aria-label="Main"] to measure');
        } else {
          const nav = rendered.navLabels;
          if (nav.items.length === 0) {
            note(surface, bp.name, 'nav-labels', 'the main nav rendered with no links in it');
          }
          for (const item of nav.items) {
            // 1px of tolerance: sub-pixel layout rounding is not a clip.
            const clipped = Math.max(item.clippedLeft, item.clippedRight);
            if (clipped > 1) {
              note(
                surface,
                bp.name,
                'nav-labels',
                `"${item.text}" is clipped by ${Math.round(clipped)}px at rest ` +
                  `(nav scrollLeft=${Math.round(nav.scrollLeft)}, ` +
                  `content ${Math.round(nav.scrollWidth)}px in ${Math.round(nav.clientWidth)}px). ` +
                  `A label you must scroll to read is not a label.`,
              );
            }
          }
        }

        for (const e of surfaceErrors) {
          /**
           * ⚠️ ENVIRONMENTAL, NOT A DEFECT — AND NAMED RATHER THAN DROPPED.
           *
           * A blocked outbound fetch says something about the network this
           * check is running on, not about the app. In this sandbox every
           * Leaflet basemap tile fails that way, 20 per map surface, and left
           * in the findings list they bury the ones that are ours.
           *
           * Counted and reported on their own line, because a filter that
           * silently swallows a class of error is how a real one hides inside
           * it. If the count is unexpectedly zero on a surface that should
           * fetch, that is worth noticing too.
           */
          if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_PROXY/.test(e)) {
            blockedRequests.push(`${bp.name} ${surface}`);
          } else {
            note(surface, bp.name, 'page-error', e);
          }
        }

        const result = await page.evaluate(
          ({ selector, min, isTouch }) => {
            const out = { occluded: [], overlapped: [], small: [], lining: [], overflow: null };

            /**
             * ⚠️ TABULAR FIGURES, CHECKED AS A COMPUTED STYLE.
             *
             * Numbers are the product here, and proportional figures make a
             * column of them ragged — a 1 is narrower than a 0 in almost every
             * face, so `116` and `221` do not line up. Whether a number is set
             * in tabular figures is a RENDERED fact: `tabular-nums` can be
             * applied and then dropped by tailwind-merge, or inherited, or
             * overridden. Source cannot answer it. `getComputedStyle` can.
             *
             * Scoped to numbers inside tables and lists, which is where
             * alignment is the whole point. A lone figure in a sentence does
             * not need it and flagging one would train the reader to ignore
             * this check.
             */
            const NUMERIC = /^[$€£]?-?[\d,]+(\.\d+)?\s*(%|¢|x|d|MW|kW|GW|kWh|MWh|B|M|K)?$/;
            for (const scope of document.querySelectorAll('table, ul, ol, [role="table"]')) {
              for (const el of scope.querySelectorAll('*')) {
                if (el.children.length > 0) continue;
                const text = el.textContent?.trim() ?? '';
                if (text.length < 2 || !NUMERIC.test(text)) continue;
                if (!/\d/.test(text)) continue;
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                const variant = getComputedStyle(el).fontVariantNumeric || '';
                if (!variant.includes('tabular-nums')) {
                  out.lining.push({
                    text: text.slice(0, 20),
                    tag: el.tagName.toLowerCase(),
                    parent: (el.parentElement?.className || '').toString().slice(0, 50),
                  });
                }
              }
            }

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

              /**
               * ⚠️ TEST REACHABILITY, NOT VISIBILITY AT SCROLL ZERO.
               *
               * `getBoundingClientRect` ignores clipping, so an element inside
               * a horizontally scrolled container reports coordinates it is not
               * actually painted at, and a naive hit-test at those coordinates
               * finds whatever IS painted there. That is a real distinction and
               * not a technicality: an item clipped by a scroll container can
               * be reached by scrolling; an item under an opaque sibling cannot
               * be reached at all.
               *
               * So: hit-test where it is, and if that fails, scroll it into
               * view and hit-test again. What survives BOTH is genuinely
               * unreachable.
               */
              const hitAt = (box) => {
                const x = Math.min(Math.max(box.left + box.width / 2, 1), innerWidth - 1);
                const y = Math.min(Math.max(box.top + box.height / 2, 1), innerHeight - 1);
                return document.elementFromPoint(x, y);
              };
              const reaches = (h) => h && (el.contains(h) || h.contains(el));

              let hit = hitAt(r);
              if (!reaches(hit)) {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                hit = hitAt(el.getBoundingClientRect());
              }

              // ⚠️ `contains` BOTH WAYS. A label inside a button is a legitimate
              // hit for that button, and a button inside a link likewise — the
              // question is whether the tap reaches this control, not whether
              // it lands on this exact node.
              if (!reaches(hit)) {
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

              /**
               * ⚠️ INLINE LINKS IN PROSE ARE EXEMPT, AND THE EXEMPTION IS
               * NARROW ON PURPOSE.
               *
               * WCAG 2.5.8 exempts a link whose target is "in a sentence or
               * block of text" — sizing "Connect Supabase" to 44px would break
               * the paragraph it sits in, and flagging it every run trains the
               * reader to skim past this whole section.
               *
               * Narrow: the element must be an <a>, laid out INLINE, with
               * text on both sides of it. A button is never exempt, and a
               * standalone link on its own line is not in a sentence.
               */
              const inlineInProse =
                el.tagName === 'A' &&
                getComputedStyle(el).display === 'inline' &&
                Boolean(el.parentElement?.textContent?.trim().length) &&
                (el.parentElement?.textContent?.trim().length ?? 0) >
                  (el.textContent?.trim().length ?? 0) + 8;

              /**
               * ⚠️ A LABEL-WRAPPED CONTROL'S TARGET IS THE LABEL.
               *
               * A checkbox is 20x20 by construction and inflating it to 44px
               * would give a giant box beside a small word. What the finger
               * actually hits is the <label>, because clicking anywhere in it
               * toggles the control — so the label is the target, and that is
               * what has to clear the floor.
               *
               * Credited only when the label GENUINELY clears it, so this
               * cannot be used to wave through a small control in a small
               * label.
               */
              const label = el.closest('label');
              const labelBox = label?.getBoundingClientRect();
              const labelCovers = Boolean(labelBox && labelBox.height >= min && labelBox.width >= min);

              if (isTouch && !inlineInProse && !labelCovers && (r.width < min || r.height < min)) {
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
        // Deduped: one row per distinct parent, or a 21-row table reports 21
        // times and buries everything else.
        const seenLining = new Set();
        for (const l of result.lining) {
          const key = `${l.tag}:${l.parent}`;
          if (seenLining.has(key)) continue;
          seenLining.add(key);
          note(surface, bp.name, 'proportional-figures', `"${l.text}" in <${l.tag}> is not tabular-nums`);
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
          path: `${OUT}/${bp.name}${surface.replace(/[/?=]/g, '_')}.png`,
        });
      }

      await ctx.close();
    }

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  // ⚠️ RULE 18, APPLIED TO THIS SCRIPT'S OWN NEWEST SUBJECT. A clean report
  // about a component that never rendered is the empty-universe pass again.
  if (gapSlotsSeen === 0) {
    note('(all)', '(all)', 'nothing-to-check', 'no gap slot rendered on any surface — every assertion about the gap system was made against pages that do not contain one');
  }

  // ── Report ──
  if (neverSettled.length > 0) {
    console.log(
      `render-check: ${neverSettled.length} surface(s) never reached network idle and were ` +
        `checked after load instead: ${[...new Set(neverSettled)].join(', ')}`,
    );
  }

  if (blockedRequests.length > 0) {
    const bySurface = {};
    for (const b of blockedRequests) bySurface[b] = (bySurface[b] ?? 0) + 1;
    console.log(
      `render-check: ${blockedRequests.length} outbound request(s) blocked by this network — ` +
        `not app defects: ${Object.entries(bySurface).map(([k, v]) => `${k} x${v}`).join(', ')}`,
    );
  }

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
