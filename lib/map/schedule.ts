/**
 * MAP v2 — the live schedule object.
 *
 * The thing that makes a buyer treat a MAP as a resource rather than homework
 * is watching a slip propagate. When a milestone moves and the energize date
 * moves with it, the document stops being our timeline and becomes their
 * problem — which is the entire point of a mutual action plan.
 *
 * Pure functions, no I/O. Same reasoning as lib/economics/lcoe.ts: the export,
 * the live view and the health read all need the same answer, and three
 * implementations drift.
 */

export const MILESTONE_STATUSES = ['pending', 'in-progress', 'done', 'blocked'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface Milestone {
  id: string;
  label: string;
  /** Who owns it. Free text — often someone on the buyer's side. */
  owner: string | null;
  /** Committed date, ISO yyyy-mm-dd. Null when not yet dated. */
  date: string | null;
  /** Milestone ids this one cannot start before. */
  dependsOn: string[];
  status: MilestoneStatus;
  /** Working days this milestone takes. Drives propagation. */
  durationDays: number;
  notes?: string | null;
}

export interface MapPlan {
  milestones: Milestone[];
  /** The date the whole plan is pointed at. */
  targetEnergizeDate: string | null;
  updatedAt: string;
  /** Champion engagement — a read, never a rule. See championSignal(). */
  championViewedAt?: string | null;
  championEditedAt?: string | null;
  shareToken?: string | null;
}

// ── Date helpers ───────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function parseDate(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const t = parseDate(iso);
  if (t === null) return iso;
  return toIso(t + days * DAY_MS);
}

export function daysBetween(a: string, b: string): number | null {
  const ta = parseDate(a);
  const tb = parseDate(b);
  if (ta === null || tb === null) return null;
  return Math.round((tb - ta) / DAY_MS);
}

// ── Propagation ────────────────────────────────────────────────────

export interface SlipImpact {
  /** Milestones whose dates move, with their before/after. */
  shifted: { id: string; label: string; from: string | null; to: string }[];
  /** Days the target energize date moves. Positive = later. */
  energizeShiftDays: number | null;
  newEnergizeDate: string | null;
  /** Set when the graph is malformed. Reported, not thrown. */
  error: string | null;
}

/**
 * Topological order of the milestone graph.
 *
 * Returns null on a cycle rather than throwing or looping. A cycle is a data
 * problem the user created by wiring dependencies in a circle, and the right
 * response is to say so on the row — not to crash the deal page.
 */
export function topoOrder(milestones: Milestone[]): Milestone[] | null {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const state = new Map<string, 'visiting' | 'done'>();
  const out: Milestone[] = [];
  let cycle = false;

  function visit(m: Milestone) {
    if (cycle) return;
    const s = state.get(m.id);
    if (s === 'done') return;
    if (s === 'visiting') {
      cycle = true;
      return;
    }
    state.set(m.id, 'visiting');
    for (const depId of m.dependsOn) {
      const dep = byId.get(depId);
      // A dangling dependency id is ignored rather than fatal — it happens when
      // a milestone is deleted, and losing the whole schedule over it would be
      // a worse outcome than one row losing a constraint.
      if (dep) visit(dep);
    }
    state.set(m.id, 'done');
    out.push(m);
  }

  for (const m of milestones) visit(m);
  return cycle ? null : out;
}

/**
 * Recompute the schedule after one milestone's date changes.
 *
 * A dependent milestone moves only when it would otherwise start before its
 * predecessor finishes. Milestones with float absorb the slip and do not move,
 * which is what makes the propagation credible — a plan where every date shifts
 * in lockstep is obviously mechanical and gets discounted on sight.
 *
 * Completed milestones never move. Their date is a fact, not a plan.
 */
export function propagate(
  plan: MapPlan,
  changedId: string,
  newDate: string,
): SlipImpact {
  const ordered = topoOrder(plan.milestones);
  if (!ordered) {
    return {
      shifted: [],
      energizeShiftDays: null,
      newEnergizeDate: plan.targetEnergizeDate,
      error: 'Dependencies form a cycle — no schedule can be computed until it is broken.',
    };
  }

  const dates = new Map<string, string | null>();
  for (const m of plan.milestones) dates.set(m.id, m.date);
  dates.set(changedId, newDate);

  const shifted: SlipImpact['shifted'] = [];

  for (const m of ordered) {
    if (m.id === changedId) continue;
    if (m.status === 'done') continue;

    let earliest: string | null = null;
    for (const depId of m.dependsOn) {
      const depDate = dates.get(depId);
      const dep = plan.milestones.find((x) => x.id === depId);
      if (!depDate || !dep) continue;
      const finish = addDays(depDate, dep.durationDays);
      if (earliest === null || finish > earliest) earliest = finish;
    }

    if (earliest === null) continue;

    const currentDate = dates.get(m.id) ?? null;
    // Only push forward. A milestone with float keeps its date.
    if (currentDate === null || currentDate < earliest) {
      shifted.push({ id: m.id, label: m.label, from: currentDate, to: earliest });
      dates.set(m.id, earliest);
    }
  }

  // The energize date moves with the latest finish across the whole graph.
  const finishes = plan.milestones
    .map((m) => {
      const d = dates.get(m.id);
      return d ? addDays(d, m.durationDays) : null;
    })
    .filter((d): d is string => Boolean(d));

  const latestFinish = finishes.length > 0 ? finishes.reduce((a, b) => (a > b ? a : b)) : null;

  let energizeShiftDays: number | null = null;
  let newEnergizeDate = plan.targetEnergizeDate;

  if (latestFinish && plan.targetEnergizeDate) {
    // Only a finish that runs PAST the target moves it. A plan finishing early
    // does not pull the energize date forward — that date is usually fixed by
    // something outside this schedule.
    if (latestFinish > plan.targetEnergizeDate) {
      energizeShiftDays = daysBetween(plan.targetEnergizeDate, latestFinish);
      newEnergizeDate = latestFinish;
    } else {
      energizeShiftDays = 0;
    }
  } else if (latestFinish && !plan.targetEnergizeDate) {
    newEnergizeDate = latestFinish;
  }

  return { shifted, energizeShiftDays, newEnergizeDate, error: null };
}

/** Apply a propagation result, returning a new plan. */
export function applySlip(plan: MapPlan, changedId: string, newDate: string): MapPlan {
  const impact = propagate(plan, changedId, newDate);
  if (impact.error) return plan;

  const shiftedById = new Map(impact.shifted.map((s) => [s.id, s.to]));

  return {
    ...plan,
    milestones: plan.milestones.map((m) =>
      m.id === changedId
        ? { ...m, date: newDate }
        : shiftedById.has(m.id)
          ? { ...m, date: shiftedById.get(m.id)! }
          : m,
    ),
    targetEnergizeDate: impact.newEnergizeDate,
    updatedAt: new Date().toISOString(),
  };
}

// ── Champion engagement ────────────────────────────────────────────

export type ChampionSignal = 'never-opened' | 'viewed' | 'engaged' | 'not-shared';

/**
 * How the champion has engaged with the plan.
 *
 * A READ, deliberately not a rule. It does not touch the health score and does
 * not gate anything. A champion who redlines your timeline and adds their own
 * internal deadlines is real; one who never opens it is information — but it is
 * information with plenty of innocent explanations, and turning it into a
 * scored penalty would manufacture false signal from a quiet week.
 */
export function championSignal(plan: MapPlan): ChampionSignal {
  if (!plan.shareToken) return 'not-shared';
  if (plan.championEditedAt) return 'engaged';
  if (plan.championViewedAt) return 'viewed';
  return 'never-opened';
}

export function championSignalLabel(signal: ChampionSignal): string {
  switch (signal) {
    case 'engaged':
      return 'Champion has edited the plan — they are treating it as theirs.';
    case 'viewed':
      return 'Champion has opened the plan but not edited it.';
    case 'never-opened':
      return 'Shared, not yet opened. Information, not a verdict.';
    case 'not-shared':
      return 'Not shared with the champion yet.';
  }
}

/** Milestones past their date and not done. */
export function overdue(plan: MapPlan, today = toIso(Date.now())): Milestone[] {
  return plan.milestones.filter(
    (m) => m.status !== 'done' && m.date !== null && m.date < today,
  );
}


// ── Starter plan ───────────────────────────────────────────────────

/**
 * A starting plan.
 *
 * Solo mode has to be genuinely useful with no champion involved, so a new MAP
 * is not empty — it is the stage sequence this business actually runs, dated
 * relative to today and fully editable. An empty grid with an "add milestone"
 * button is a form, not a stage guide.
 *
 * Durations are working-day estimates for the SEQUENCE, not claims about any
 * particular utility or jurisdiction. They exist to make the dependency graph
 * compute on day one; every one is editable and none is presented as sourced.
 */
export function starterPlan(): MapPlan {
  const at = (offset: number) => toIso(Date.now() + offset * 86_400_000);

  const milestones: Milestone[] = [
    { id: 'discovery', label: 'Technical discovery complete', owner: null, date: at(14), dependsOn: [], durationDays: 14, status: 'pending' },
    { id: 'load-profile', label: 'Load profile + site data received', owner: null, date: at(21), dependsOn: ['discovery'], durationDays: 10, status: 'pending' },
    { id: 'economics', label: 'Economics modelled and agreed', owner: null, date: at(35), dependsOn: ['load-profile'], durationDays: 10, status: 'pending' },
    { id: 'business-case', label: 'Business case circulated internally', owner: null, date: at(49), dependsOn: ['economics'], durationDays: 14, status: 'pending' },
    { id: 'interconnect', label: 'Interconnection application filed', owner: null, date: at(56), dependsOn: ['load-profile'], durationDays: 90, status: 'pending' },
    { id: 'approval', label: 'Internal approval / capital committed', owner: null, date: at(90), dependsOn: ['business-case'], durationDays: 21, status: 'pending' },
    { id: 'contract', label: 'Contract executed', owner: null, date: at(120), dependsOn: ['approval'], durationDays: 30, status: 'pending' },
    { id: 'permit', label: 'Permits secured', owner: null, date: at(150), dependsOn: ['interconnect'], durationDays: 60, status: 'pending' },
    { id: 'install', label: 'Installation', owner: null, date: at(240), dependsOn: ['contract', 'permit'], durationDays: 90, status: 'pending' },
    { id: 'energize', label: 'Energize', owner: null, date: at(340), dependsOn: ['install'], durationDays: 14, status: 'pending' },
  ];

  return {
    milestones,
    targetEnergizeDate: at(354),
    updatedAt: new Date().toISOString(),
    championViewedAt: null,
    championEditedAt: null,
    shareToken: null,
  };
}
