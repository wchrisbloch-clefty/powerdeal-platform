/**
 * ═══════════════════════════════════════════════════════════════
 * INSTRUMENTATION FOR THE USAGE WEEK.
 * ═══════════════════════════════════════════════════════════════
 *
 * The build stops and the platform gets used for a week. The question this
 * exists to answer: what did that week actually show, as opposed to what gets
 * remembered on Friday afternoon?
 *
 * Recollection is reliably wrong in three specific ways, and each one has a
 * counter here:
 *
 *   1. IT REMEMBERS WHAT WAS INTERESTING, NOT WHAT WAS USED. A surface opened
 *      once and thought about for ten minutes feels more used than one opened
 *      twenty times for eight seconds. `openedCount` and `totalMs` are both
 *      kept and never averaged into one number, because they answer different
 *      questions: how often did I reach for this, and did it hold me.
 *
 *   2. IT CANNOT SEE ABSENCE. The most useful finding of the week is which
 *      surfaces were never opened at all, and nobody remembers not doing
 *      something. `report()` takes the full list of surfaces that EXIST and
 *      emits a row for every one, so a zero is a visible row rather than a
 *      missing one. This is the "never run" lesson from agent health, applied
 *      to a human instead of a cron.
 *
 *   3. IT LOSES THE MOMENT OF FRICTION. "I wish it just…" is a complete
 *      thought for about ninety seconds and then becomes "the pipeline view is
 *      fine, I guess". Wishes are captured where and when they happen, with
 *      the surface attached, because a wish recorded on /app/pipeline is a
 *      fact about the pipeline view.
 *
 * ══ WHAT THIS DELIBERATELY DOES NOT DO ══
 *
 * No scoring. No engagement metric. No "健康度" of the operator. There is one
 * user, it is a week, and a derived index would be a number with no
 * denominator dressed up as a finding — exactly the fabrication rule this
 * build enforces everywhere else. Counts and durations only.
 *
 * ══ IT NEVER GATES AND NEVER COSTS THE USER ANYTHING ══
 *
 * Every write is best-effort and fire-and-forget. A failed usage write must
 * never interrupt what the operator was doing — instrumentation that can break
 * the thing it measures is worse than no instrumentation. It also stores in
 * `app_state`, so it needs no migration against a live table holding 21 real
 * deals.
 *
 * PURE — aggregation and copy only. The reading and writing live in the route.
 */

export interface SurfaceUsage {
  /** How many times this surface became the active view. */
  openedCount: number;
  /** Total foreground time, milliseconds. Never averaged into openedCount. */
  totalMs: number;
  firstAt: string;
  lastAt: string;
}

export type SurfaceMap = Record<string, SurfaceUsage>;

export interface Wish {
  text: string;
  /** The surface the operator was on. A wish is about somewhere. */
  path: string;
  at: string;
}

export interface ActionEvent {
  /** What was done — 'generate:brief', 'sweep', 'export:pptx'. */
  action: string;
  path: string;
  at: string;
  /** Set when the action failed, so friction and success are separable. */
  error?: string;
}

export interface UsageState {
  surfaces: SurfaceMap;
  wishes: Wish[];
  actions: ActionEvent[];
}

export const USAGE_KEY = 'usage:week';

export function emptyUsage(): UsageState {
  return { surfaces: {}, wishes: [], actions: [] };
}

/**
 * Caps. A week of one person cannot legitimately produce more than this, and
 * an unbounded array in a jsonb column is a row that eventually fails to write
 * for reasons nobody connects to instrumentation.
 *
 * Oldest entries are dropped, not newest — the recent ones are the ones that
 * still have context around them.
 */
export const MAX_WISHES = 300;
export const MAX_ACTIONS = 2000;

/**
 * Fold one surface visit into the state.
 *
 * `ms` of 0 is recorded as an OPEN with no dwell rather than discarded: a
 * surface opened and immediately left is a real signal, and arguably the
 * strongest one in the whole dataset.
 */
export function recordVisit(
  state: UsageState,
  path: string,
  ms: number,
  at: string,
): UsageState {
  const prev = state.surfaces[path];
  const safeMs = Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;

  return {
    ...state,
    surfaces: {
      ...state.surfaces,
      [path]: {
        openedCount: (prev?.openedCount ?? 0) + 1,
        totalMs: (prev?.totalMs ?? 0) + safeMs,
        firstAt: prev?.firstAt ?? at,
        lastAt: at,
      },
    },
  };
}

export function recordWish(state: UsageState, wish: Wish): UsageState {
  const text = wish.text.trim();
  // An empty wish is not a wish. Silently ignored rather than stored as a
  // blank row that pads the count and says nothing.
  if (!text) return state;
  return {
    ...state,
    wishes: [...state.wishes, { ...wish, text }].slice(-MAX_WISHES),
  };
}

export function recordAction(state: UsageState, event: ActionEvent): UsageState {
  return { ...state, actions: [...state.actions, event].slice(-MAX_ACTIONS) };
}

// ── The report ──────────────────────────────────────────────────

export interface SurfaceRow {
  path: string;
  label: string;
  openedCount: number;
  totalMs: number;
  lastAt: string | null;
  /**
   * TRUE means it was never opened. Named as its own field rather than
   * inferred from `openedCount === 0` at four call sites, because the whole
   * point of this row existing is that a zero is a finding.
   */
  neverOpened: boolean;
}

export interface UsageReport {
  surfaces: SurfaceRow[];
  neverOpened: SurfaceRow[];
  wishes: Wish[];
  actions: ActionEvent[];
  actionTally: { action: string; count: number; failures: number }[];
  totals: { surfacesExisting: number; surfacesOpened: number; totalMs: number };
}

export interface KnownSurface {
  path: string;
  label: string;
}

/**
 * Build the report from the state and the full list of surfaces that exist.
 *
 * `known` is passed in rather than derived from what was visited — deriving it
 * would make an unopened surface simply not appear, which is the exact failure
 * the agent-health table was built to avoid. A surface nobody opened is the
 * most actionable row in the report.
 */
export function report(state: UsageState, known: KnownSurface[]): UsageReport {
  const surfaces: SurfaceRow[] = known.map((s) => {
    const usage = state.surfaces[s.path];
    return {
      path: s.path,
      label: s.label,
      openedCount: usage?.openedCount ?? 0,
      totalMs: usage?.totalMs ?? 0,
      lastAt: usage?.lastAt ?? null,
      neverOpened: !usage || usage.openedCount === 0,
    };
  });

  // A visited path that is not in `known` still appears. The list can fall
  // behind the app, and dropping the row would hide real usage.
  for (const [path, usage] of Object.entries(state.surfaces)) {
    if (known.some((k) => k.path === path)) continue;
    surfaces.push({
      path,
      label: `${path} (not in the known list)`,
      openedCount: usage.openedCount,
      totalMs: usage.totalMs,
      lastAt: usage.lastAt,
      neverOpened: false,
    });
  }

  surfaces.sort((a, b) => b.totalMs - a.totalMs || b.openedCount - a.openedCount);

  const tallyMap = new Map<string, { count: number; failures: number }>();
  for (const a of state.actions) {
    const entry = tallyMap.get(a.action) ?? { count: 0, failures: 0 };
    entry.count += 1;
    if (a.error) entry.failures += 1;
    tallyMap.set(a.action, entry);
  }

  return {
    surfaces,
    neverOpened: surfaces.filter((s) => s.neverOpened),
    // Newest first: the freshest wish is the one still worth acting on.
    wishes: [...state.wishes].reverse(),
    actions: [...state.actions].reverse(),
    actionTally: [...tallyMap.entries()]
      .map(([action, v]) => ({ action, ...v }))
      .sort((a, b) => b.count - a.count),
    totals: {
      surfacesExisting: known.length,
      surfacesOpened: surfaces.filter((s) => !s.neverOpened).length,
      totalMs: surfaces.reduce((n, s) => n + s.totalMs, 0),
    },
  };
}

/** Human duration. Minutes and seconds — an hour of one surface is a lot. */
export function formatMs(ms: number): string {
  if (ms < 1000) return '0s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The sentence the report leads with.
 *
 * Leads with what was NOT opened, because that is the finding recollection
 * cannot produce and the one that changes what gets built next.
 */
export function reportHeadline(r: UsageReport): string {
  if (r.totals.surfacesOpened === 0) {
    return 'Nothing recorded yet. Not "the platform went unused" — no visit has been written.';
  }
  const unopened = r.neverOpened.length;
  const base =
    `${r.totals.surfacesOpened} of ${r.totals.surfacesExisting} surfaces opened, ` +
    `${formatMs(r.totals.totalMs)} total.`;
  if (unopened === 0) return base;
  return (
    `${base} ${unopened} never opened: ` +
    `${r.neverOpened.slice(0, 5).map((s) => s.label).join(', ')}` +
    `${unopened > 5 ? ` and ${unopened - 5} more` : ''}.`
  );
}
