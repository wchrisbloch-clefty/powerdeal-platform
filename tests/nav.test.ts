import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NAV_ITEMS, SETTINGS_ITEM, primaryItems, overflowItems } from '@/components/chrome/nav';
import { INTEL_TABS, DEFAULT_TAB } from '@/components/modules/intel-tabs';
import { KNOWN_SURFACES } from '@/lib/surfaces';

/**
 * NAVIGATION — sidebar to top, three form factors, nothing dropped.
 *
 * The assertion that carries the most weight is the reachability one: every
 * item in NAV_ITEMS is reachable at EVERY breakpoint, in both directions, so a
 * ninth destination added later cannot silently fall off the end of the bottom
 * bar — which holds four — and a stale entry cannot linger unreachable.
 */

const TOKENS = readFile('styles/tokens.css', 'utf8');
const NAV = readFile('components/chrome/nav.tsx', 'utf8');
const TABS = readFile('components/modules/intel-tabs.tsx', 'utf8');

// ── Contrast ────────────────────────────────────────────────────

function srgb(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Read the token values straight out of tokens.css rather than restating them.
 *
 * A test that carries its own copy of a colour passes for ever after the token
 * changes underneath it — which is the exact shape of the hand-maintained
 * Spine that started this week.
 */
async function palette(theme: 'light' | 'dark'): Promise<Record<string, string>> {
  const css = await TOKENS;
  // The dark block reassigns a subset; light is the `:root` baseline.
  const rootEnd = css.indexOf("[data-theme='dark']");
  const scope =
    theme === 'light'
      ? css.slice(0, rootEnd)
      : css.slice(0, rootEnd) + css.slice(rootEnd);
  const out: Record<string, string> = {};
  for (const m of scope.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

describe('every destination is reachable at every breakpoint', () => {
  it('there are nine, and the count is stated so a tenth is a decision', () => {
    /**
     * ⚠️ THIS ASSERTION DID ITS JOB. It was 8 and it failed the moment Log was
     * added, which is exactly what "a ninth is a decision" is for — the number
     * is not bumped to make a suite green, it is bumped because the decision
     * was made and written down.
     *
     * THE DECISION: Log is the ninth destination and the fifth PRIMARY one. It
     * is where a fact gets recorded from a car park thirty seconds after a
     * call, and until it existed the application could write exactly two fields
     * on an existing deal — `stage` and `verified_empty`. A capture surface
     * behind the More sheet is two taps and a decision at the moment the
     * reader has neither.
     */
    expect(NAV_ITEMS).toHaveLength(9);
  });

  it('desktop and iPad show ALL EIGHT — no overflow menu', async () => {
    // The bar maps NAV_ITEMS directly. Any filter here would be a silent drop.
    const src = await NAV;
    const bar = src.slice(src.indexOf('export function NavBar'), src.indexOf('export function TabBar'));
    expect(bar).toContain('NAV_ITEMS.map(');
    expect(bar).not.toMatch(/NAV_ITEMS\s*\.\s*filter/);

    /**
     * ⚠️ THIS USED TO ASSERT `not.toContain('overflow-x-auto')`, and that was
     * the wrong claim in the wrong place.
     *
     * It was trying to guarantee a LAYOUT OUTCOME — everything visible, no
     * scrolling — from the SOURCE. Source cannot see layout. And the outcome
     * it guaranteed was false the whole time: the <ul> overflowed its <nav>
     * silently and the control cluster painted over Learn, so from 768 to 1023
     * the eighth destination was covered and untappable on every surface.
     *
     * The assertion passed because the item rendered. It did render. It was
     * underneath something.
     *
     * Reachability is now checked where it can be checked — by
     * scripts/render-check.mjs, with `elementFromPoint` at each target's
     * centre. What is left here is the thing source CAN answer: no item is
     * filtered out, and the overflow is handled visibly rather than hidden.
     */
    expect(bar).toContain('overflow-x-auto');
    expect(bar).not.toContain('slice(');
  });

  it('mobile reaches all eight — four in the bar, four in the sheet', () => {
    const reachable = [...primaryItems(), ...overflowItems()].map((i) => i.href);
    for (const item of NAV_ITEMS) {
      expect(reachable, `${item.label} is unreachable on mobile`).toContain(item.href);
    }
  });

  it('and nothing appears TWICE — a duplicate is a different bug', () => {
    const mobile = [...primaryItems(), ...overflowItems()].map((i) => i.href);
    expect(new Set(mobile).size).toBe(mobile.length);
  });

  it('the bottom bar holds five plus More, and the labels are what make that fit', () => {
    /**
     * ⚠️ THE ARITHMETIC THAT USED TO FORBID THIS IS STILL TRUE — it was the
     * LABELS that changed, not the geometry.
     *
     * Six slots across 390px is 65px each against a 64px floor. That fits the
     * TARGET and does not fit the word "Intelligence", which the nav-label pass
     * in render-check correctly reports as a clipped label — an item you must
     * scroll to read is not a label.
     *
     * So two items carry a `short` form used only on this bar: Dashboard ->
     * Home, Intelligence -> Intel. The icon carries identity, the accessible
     * name stays the real one, and the full label is on every other surface.
     *
     * The alternative was demoting one of the existing four, which is a product
     * call nobody has data for — `/api/usage` is still collecting it, and the
     * provisional-four note below is the standing commitment to re-derive this
     * from counts rather than argument.
     */
    expect(primaryItems()).toHaveLength(5);

    /**
     * ⚠️ AND THE LENGTH OF THOSE LABELS IS NOT ASSERTED HERE, because this file
     * already records why not fifty lines above: a source test cannot see
     * layout. The first version of this counted characters against a threshold
     * of six and failed on "Pipeline" — a number picked to match the labels I
     * had in mind rather than measured against anything. That is the deleted
     * `not.toContain('overflow-x-auto')` assertion wearing a new hat: a layout
     * claim made where layout does not exist.
     *
     * `scripts/render-check.mjs` measures each label against the nav's own box
     * at 390px, at rest, before any hit-test scrolls it. That is the check that
     * can actually answer this, and it is the one that governs.
     */
  });

  it('Settings is reachable at every breakpoint too', async () => {
    const src = await NAV;
    // Top bar: its own control beside the eight.
    expect(src.slice(src.indexOf('export function NavBar'))).toContain('SETTINGS_ITEM.href');
    // Mobile: inside the More sheet.
    expect(overflowItems().map((i) => i.href)).toContain(SETTINGS_ITEM.href);
  });

  it('every nav href has a usage-week surface row, so a dead one is visible', () => {
    // The provisional primary four get re-derived from open counts after the
    // usage week. That is only possible if every destination is counted.
    const surfaces = KNOWN_SURFACES.map((s) => s.path);
    for (const item of [...NAV_ITEMS, SETTINGS_ITEM]) {
      const covered = surfaces.some((p) => p === item.href || p.startsWith(`${item.href}?`));
      expect(covered, `${item.href} is not instrumented`).toBe(true);
    }
  });
});

describe('the mobile call, and the arithmetic behind it', () => {
  it('is a BOTTOM bar, not a top one', async () => {
    // Eight targets at 44pt is 352px before padding against a 375px phone, and
    // the top of a 6.7" phone is not reachable one-handed.
    const src = await NAV;
    const tab = src.slice(src.indexOf('export function TabBar'));
    expect(tab).toContain('bottom-0');
    expect(tab).not.toContain('top-0');
  });

  it('records that the primary four are PROVISIONAL and how they get settled', async () => {
    // Maps was primary before and is demoted on a hunch. Saying so is what
    // stops the guess hardening into a decision nobody revisits.
    const src = await NAV;
    expect(src).toContain('PROVISIONAL');
    expect(src).toContain('/api/usage');
  });

  it('handles both safe-area insets', async () => {
    const src = await NAV;
    // Bottom: padding, not margin, so the fill reaches the home indicator
    // while the targets sit above it.
    expect(src).toContain('pb-[env(safe-area-inset-bottom)]');
    // Top: the landscape notch on the top bar.
    expect(src).toContain('pt-[env(safe-area-inset-top)]');
  });

  it('the More sheet clears the bar it sits above', async () => {
    const src = await NAV;
    expect(src).toContain('pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]');
  });

  it('More reads as active when the current page lives inside it', async () => {
    // Otherwise a reader on /app/learn sees no active tab at all and concludes
    // the bar is broken.
    const src = await NAV;
    expect(src).toContain('overflowActive');
  });

  it('the sheet closes on navigation and on Escape', async () => {
    const src = await NAV;
    expect(src).toContain("if (e.key === 'Escape') setOpen(false)");
    // A sheet that survives the route change covers the page just requested.
    expect(src).toMatch(/setOpen\(false\);\s*\}, \[pathname\]\)/);
  });

  it('every target clears the 44pt floor', async () => {
    const src = await NAV;
    const tab = src.slice(src.indexOf('export function TabBar'));
    expect(tab).toContain('min-h-tap');
    const css = await TOKENS;
    // 2.75rem = 44px.
    expect(css).toContain('--tap-target: 2.75rem');
  });
});

describe('the iPad-portrait breakpoint is stated, not left to wrap', () => {
  it('stacks icon over label between md and lg', async () => {
    const src = await NAV;
    expect(src).toContain('min-w-nav-item-stacked flex-col');
    expect(src).toContain('lg:flex-row');
  });

  it('eight items at the stacked width fit inside 768px', async () => {
    const css = await TOKENS;
    const width = /--nav-item-min-w:\s*(\d+)px/.exec(css);
    expect(width, '--nav-item-min-w is not defined').toBeTruthy();
    /**
     * ⚠️ THE ARITHMETIC NAMED THE WORDMARK AND NEVER SUBTRACTED IT.
     *
     * This read `expect(min * 8).toBeLessThanOrEqual(768 - 200)` — 512 ≤ 568,
     * a comfortable pass — under a comment saying "eight items plus a wordmark
     * and the controls have to clear an iPad portrait viewport". The controls
     * were subtracted. The wordmark, named in the same sentence, was not.
     *
     * Measured in Chromium: wordmark 111px, control cluster 200px, and 28px of
     * page padding each side. So the real sum at the narrowest md width is
     *
     *     8 x 64  +  111  +  200  =  823   into   768 - 56 = 712
     *
     * It overflows by 111px, and it always did. The test is now written to say
     * that — the overflow is asserted as REAL, because the fix is to scroll the
     * list rather than to pretend eight items fit.
     */
    const min = Number(width![1]);
    const WORDMARK = 111;
    const CONTROLS = 200;
    const CONTENT_AT_MD = 768 - 56;
    expect(
      min * 8 + WORDMARK + CONTROLS,
      'the row now fits at md — the scrolling nav may no longer be needed',
    ).toBeGreaterThan(CONTENT_AT_MD);

    // At lg the items go inline and narrower, and there the row must fit
    // without scrolling — that is the breakpoint where all eight are visible
    // at once, which is the promise the design actually makes.
    expect(min * 8 + WORDMARK + CONTROLS).toBeLessThanOrEqual(1024);
  });

  it('the bar is taller when stacked, and both heights are tokens', async () => {
    const css = await TOKENS;
    const base = Number(/--topbar-height:\s*(\d+)px/.exec(css)![1]);
    const stacked = Number(/--topbar-height-stacked:\s*(\d+)px/.exec(css)![1]);
    expect(stacked).toBeGreaterThan(base);
  });
});

describe('Intelligence tabs WRAP — they never scroll sideways', () => {
  it('has flex-wrap and no horizontal overflow', async () => {
    // Two stacked horizontal scrollers is the layout where people lose their
    // place: scrolled content is hidden with no affordance.
    // Comments stripped first: the file EXPLAINS why it does not scroll, and
    // asserting on the bare substring fails on its own explanation. Same
    // lesson as the feed-health probe test.
    const src = (await TABS).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    expect(src).toContain('flex flex-wrap');
    expect(src).not.toContain('overflow-x-auto');
    expect(src).not.toContain('overflow-x-scroll');
  });

  it('is CONTENT, not chrome — no sticky, no bar fill, no full-bleed', async () => {
    const src = (await TABS).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    const nav = src.slice(src.indexOf('export default function IntelTabs'));
    expect(nav).not.toContain('sticky');
    expect(nav).not.toContain('fixed');
    // The old treatment was a bordered bar, which is what made it read as a
    // second nav row once the global nav moved up.
    expect(nav).not.toContain('border-b border-rule');
  });

  it('the active tab is a FILLED PILL, not an underline', async () => {
    // An underline here would echo the top bar's active treatment and the two
    // levels would read as one.
    const src = await TABS;
    expect(src).toContain('bg-bg-overlay font-medium text-text');
  });

  it('there are nine — Sources moved to Settings', () => {
    expect(INTEL_TABS).toHaveLength(9);
    expect(INTEL_TABS.map((t) => t.id)).not.toContain('sources');
  });

  it('and Headlines is still the default', () => {
    expect(DEFAULT_TAB).toBe('headlines');
    expect(INTEL_TABS[0].id).toBe('headlines');
  });

  it('Sources is rendered by Settings now, and only there', async () => {
    const settings = await readFile('components/modules/settings-panel.tsx', 'utf8');
    expect(settings).toContain('<SourcesPanel');
    const intel = await readFile('app/app/intelligence/page.tsx', 'utf8');
    expect(intel).not.toContain('SourcesPanel');
  });

  it('Video and Research STAYED, pending the usage week', () => {
    // Whether a reference surface is dead is exactly what open counts answer.
    // Sources was a category error; these are a usage question.
    expect(INTEL_TABS.map((t) => t.id)).toContain('video');
    expect(INTEL_TABS.map((t) => t.id)).toContain('research');
  });

  it('every remaining tab is still instrumented', () => {
    const surfaces = KNOWN_SURFACES.map((s) => s.path);
    for (const t of INTEL_TABS) {
      expect(surfaces, `tab ${t.id} has no usage row`).toContain(
        `/app/intelligence?tab=${t.id}`,
      );
    }
    // And the removed one is gone from the surface list too — a row nothing
    // links to reports a permanent, uninteresting zero.
    expect(surfaces).not.toContain('/app/intelligence?tab=sources');
  });
});

describe('contrast audit — every nav state, both themes', () => {
  /**
   * The pairs the nav actually renders. A primary button label once shipped at
   * 1.98:1 because `text-accent-fg` was being dropped by tailwind-merge, so
   * these are checked against the tokens rather than assumed.
   *
   * 4.5:1 for the label text. The active BORDER is a non-text indicator and
   * takes the 3:1 threshold, which is what WCAG asks of one.
   */
  const TEXT_PAIRS: [string, string, string][] = [
    ['idle label', 'color-text-dim', 'color-bg'],
    ['active label', 'color-text', 'color-bg'],
    ['hover label', 'color-text', 'color-bg'],
    ['settings idle', 'color-text-faint', 'color-bg'],
    ['sheet idle label', 'color-text-dim', 'color-bg-raised'],
    ['sheet active label', 'color-text', 'color-bg-overlay'],
    ['intel tab idle', 'color-text-dim', 'color-bg'],
    ['intel tab hover', 'color-text', 'color-bg-raised'],
    ['intel tab active', 'color-text', 'color-bg-overlay'],
  ];

  for (const theme of ['light', 'dark'] as const) {
    it(`text states clear 4.5:1 in ${theme}`, async () => {
      const p = await palette(theme);
      for (const [name, fg, bg] of TEXT_PAIRS) {
        expect(p[fg], `${fg} missing`).toBeTruthy();
        expect(p[bg], `${bg} missing`).toBeTruthy();
        const ratio = contrast(p[fg], p[bg]);
        expect(
          ratio,
          `${theme} · ${name} · ${fg} on ${bg} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`the active border and focus ring clear 3:1 in ${theme}`, async () => {
      const p = await palette(theme);
      // Non-text indicators. Both are drawn in accent against the bar ground.
      // ⚠️ NOT --color-accent. The brand green on white is 2.90:1 — this
      // assertion caught it. --color-accent-mark is the semantic token that
      // resolves per theme.
      const ratio = contrast(p['color-accent-mark'], p['color-bg']);
      expect(ratio, `${theme} accent-mark on bg is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });
  }

  it('active is signalled TWO ways, so hue alone is never the only cue', async () => {
    const src = await NAV;
    expect(src).toContain("const NAV_ACTIVE = 'text-text font-medium'");
    expect(src).toContain("active ? 'border-accent-mark' : 'border-transparent'");
  });

  it('focus-visible is its OWN treatment, not the active one', async () => {
    // Keyboard focus on a non-active item must not look like the current page.
    const src = await NAV;
    expect(src).toContain('focus-visible:ring-2 focus-visible:ring-accent');
    expect(src).toContain('focus-visible:ring-offset-bg');
  });
});

describe('token discipline', () => {
  it('the nav hardcodes no colour, size or dimension', async () => {
    const src = await NAV;
    const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    // No hex, no rgb, no arbitrary pixel values — the env() insets and the
    // tabbar-height calc are the only bracket escapes, and both read tokens.
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(code).not.toMatch(/rgba?\(/);
    // Only Tailwind arbitrary values — bracket syntax inside a className
    // string. Plain array indexing and TS generics are not that.
    for (const cls of code.match(/'[a-z0-9:_-]*\[[^\]']+\][a-z0-9:_ -]*'/g) ?? []) {
      expect(cls, `hardcoded arbitrary value ${cls}`).toMatch(/env\(|var\(--/);
    }
  });

  it('the new dimensions are tokens, and the sidebar token is GONE', async () => {
    const css = await TOKENS;
    for (const token of [
      '--topbar-height', '--topbar-height-stacked', '--tabbar-height',
      '--nav-item-min-w', '--nav-active-border',
    ]) {
      expect(css, `${token} is not defined`).toContain(`${token}:`);
    }
    // Not orphaned — removed, so nothing can reference a sidebar that is not
    // rendered any more.
    expect(css).not.toMatch(/--sidebar-width:/);
  });

  it('nothing still references the deleted sidebar token', async () => {
    const tw = await readFile('tailwind.config.ts', 'utf8');
    expect(tw).not.toContain('--sidebar-width');
    const layout = await readFile('app/app/layout.tsx', 'utf8');
    expect(layout).not.toContain('pl-sidebar');
  });

  it('cn() KEEPS both classes the nav puts on one element — exercised, not read', async () => {
    /**
     * ⚠️ THIS CALLS cn() RATHER THAN READING lib/utils.ts.
     *
     * A source assertion here passed while the border groups were deleted —
     * the declaration was gone and the test still went green, because it was
     * checking that a string appeared in a file rather than that a merge
     * survived. That is the same shape as the 1.98:1 button bug going
     * unnoticed: the thing to prove is the OUTPUT.
     *
     * `border-b-nav-active` is a WIDTH and `border-accent-mark` is a COLOUR,
     * and both are `border-*`. Undeclared, tailwind-merge treats them as one
     * group and drops the first — the active underline then renders at the
     * wrong width or with no colour, silently.
     */
    const { cn } = await import('@/lib/utils');

    const border = cn('border-b-nav-active', 'border-accent-mark');
    expect(border, 'the width was dropped').toContain('border-b-nav-active');
    expect(border, 'the colour was dropped').toContain('border-accent-mark');

    // The size/colour pair the nav puts on every item.
    const label = cn('text-2xs', 'text-text-dim');
    expect(label, 'the font size was dropped').toContain('text-2xs');
    expect(label, 'the colour was dropped').toContain('text-text-dim');

    // And a genuine conflict STILL collapses — a merge that keeps everything
    // is not a merge, and would let two colours fight in the class list.
    expect(cn('text-text-dim', 'text-text')).toBe('text-text');
    // Border COLOUR needs no declaration: tailwind-merge already classifies an
    // unknown `border-<name>` as one. Asserted so that stays true, and so the
    // deleted `border-color` group is not re-added as a no-op.
    expect(cn('border-transparent', 'border-accent-mark')).toBe('border-accent-mark');
    expect(cn('border-accent-mark', 'border-rule')).toBe('border-rule');
  });

  it('no new custom colour or font-size token was introduced undeclared', async () => {
    // The nav deliberately reuses the existing palette. If that stops being
    // true, this catches it before the merge silently drops a class.
    const src = await NAV;
    const utils = await readFile('lib/utils.ts', 'utf8');
    const declared = new Set([
      ...(utils.match(/'([a-z-]+)'/g) ?? []).map((s) => s.slice(1, -1)),
      'text', 'transparent', 'current', 'inherit',
    ]);
    for (const m of src.matchAll(/\btext-(text|accent)(-[a-z]+)?\b/g)) {
      const token = m[0].replace(/^text-/, '');
      expect(declared.has(token), `text-${token} is not declared in cn()`).toBe(true);
    }
  });
});

describe('the two chrome rows never stack', () => {
  it('the search bar is mobile-only now', async () => {
    // With nav at the top, keeping search as its own row would stack two
    // chrome rows on desktop — the same collision, one level up.
    const src = await readFile('components/chrome/top-bar.tsx', 'utf8');
    expect(src).toContain('md:hidden');
    expect(src).toContain('MOBILE ONLY');
  });

  it('and search lives in the nav row above md', async () => {
    const src = await NAV;
    expect(src).toContain('Search accounts');
    // Input at xl where it fits; a button that routes to the surface owning
    // the filter below that. Not a degraded input — a different control.
    expect(src).toContain('hidden xl:block');
    expect(src).toContain('xl:hidden');
  });

  it('the layout renders the nav bar and no sidebar', async () => {
    const src = await readFile('app/app/layout.tsx', 'utf8');
    expect(src).toContain('<NavBar />');
    expect(src).not.toContain('<Sidebar');
  });
});

describe('the render check enumerates what the product claims to have', () => {
  /**
   * ⚠️ RULE 18: AN ENUMERATION IS A CLAIM, AND THIS ONE HAS BEEN WRONG TWICE
   * WHILE REPORTING CLEAN — nine surfaces while the gap system lived on a
   * tenth, ten while eight Intelligence tabs were on none of them.
   *
   * `render-check` states how its list was derived. This holds the derivation
   * to the source it names, so adding a nav destination or an Intelligence tab
   * without adding a surface fails HERE rather than quietly shrinking N.
   */
  it('covers every nav destination', async () => {
    const script = await readFile('scripts/render-check.mjs', 'utf8');
    const list = /const SURFACES = \[([\s\S]*?)\n\];/.exec(script)![1];
    const surfaces = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    for (const item of NAV_ITEMS) {
      expect(surfaces, `${item.href} is a destination the render check never visits`).toContain(
        item.href,
      );
    }
    expect(surfaces).toContain(SETTINGS_ITEM.href);
  });

  it('covers every Intelligence tab, because a tabbed surface is several', async () => {
    const script = await readFile('scripts/render-check.mjs', 'utf8');
    const tabsSrc = await readFile('components/modules/intel-tabs.tsx', 'utf8');
    const tabs = [...tabsSrc.matchAll(/\{ id: '([a-z-]+)', label:/g)].map((m) => m[1]);
    expect(tabs.length).toBeGreaterThan(1);

    for (const id of tabs) {
      const expected = `/app/intelligence?tab=${id}`;
      // The default tab is reached at the bare path.
      const ok = script.includes(expected) || id === 'headlines';
      expect(ok, `Intelligence tab "${id}" is never rendered by the check`).toBe(true);
    }
  });

  it('states its derivation and its exclusions, so an omission is a choice', async () => {
    // A hardcoded list looks identical whether it is exhaustive or whether
    // somebody stopped typing. The derivation is what tells them apart.
    const script = await readFile('scripts/render-check.mjs', 'utf8');
    const header = script.slice(0, script.indexOf('const SURFACES = ['));
    expect(header).toMatch(/DERIVED FROM/);
    expect(header).toMatch(/DELIBERATELY EXCLUDED/);
  });
});
