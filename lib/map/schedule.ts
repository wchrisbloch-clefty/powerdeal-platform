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
  /**
   * DERIVED, never stored — see energizeDate().
   *
   * This used to be a field. It drifted immediately: the header carried a
   * separately-stored value while the Energize row carried the milestone's own
   * date, and one Williams export shipped with 2027-08-26 in the header and
   * 2027-08-12 in the table. Two energize dates in one document is worse than
   * a wrong one, because the reader cannot tell which is the commitment.
   *
   * Stored plans from before this change may still carry the key. It is
   * ignored on read.
   */
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

// ── Derived energize date ──────────────────────────────────────────

/**
 * Milestones nothing else depends on — the end of the chain.
 *
 * Falls back to the whole list when every milestone is depended upon, which
 * only happens in a cycle; propagate() reports that separately rather than
 * relying on this.
 */
export function terminalMilestones(milestones: Milestone[]): Milestone[] {
  const depended = new Set(milestones.flatMap((m) => m.dependsOn));
  const terminals = milestones.filter((m) => !depended.has(m.id));
  return terminals.length > 0 ? terminals : milestones;
}

/**
 * The date the plan is pointed at, computed from the final milestone.
 *
 * The terminal milestone's own date — not its date plus duration. The headline
 * answers "when do we energize", and the row the reader checks it against is
 * the Energize row, so the two have to be the same number by construction.
 */
export function energizeDate(plan: Pick<MapPlan, 'milestones'>): string | null {
  const dates = terminalMilestones(plan.milestones)
    .map((m) => m.date)
    .filter((d): d is string => Boolean(d));
  return dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

// ── Consistency ────────────────────────────────────────────────────

export interface PlanIssue {
  milestoneId: string;
  label: string;
  kind: 'done-in-future';
  message: string;
}

/**
 * A milestone can only be complete if its date has passed.
 *
 * This is not cosmetic. propagate() freezes completed milestones — their date
 * is a fact, not a plan — so a milestone wrongly marked done pins a date that
 * should still be sliding, and the slip it should have caused silently
 * disappears. Checked in code rather than trusted from the record.
 */
export function isEffectivelyDone(m: Milestone, today: string): boolean {
  return m.status === 'done' && m.date !== null && m.date <= today;
}

export function validate(
  plan: Pick<MapPlan, 'milestones'>,
  today = toIso(Date.now()),
): PlanIssue[] {
  return plan.milestones
    .filter((m) => m.status === 'done' && m.date !== null && m.date > today)
    .map((m) => ({
      milestoneId: m.id,
      label: m.label,
      kind: 'done-in-future' as const,
      message: `Marked done but dated ${m.date}, which is in the future. Its date is still moving with the schedule until the status or the date is corrected.`,
    }));
}

/**
 * Chronological order, undated last.
 *
 * The table is scanned at speed by someone looking for their own name and their
 * own date. Dependency order is a graph property and belongs in its own column;
 * it is not a reading order.
 */
export function inDateOrder(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  });
}

/** Owner fallback — GRACEFUL NO-CONTACT. An em-dash reads as "none needed". */
export const UNOWNED = 'not yet identified';

export function ownerOf(m: Milestone): string {
  return m.owner?.trim() ? m.owner : UNOWNED;
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
  today = toIso(Date.now()),
): SlipImpact {
  const ordered = topoOrder(plan.milestones);
  if (!ordered) {
    return {
      shifted: [],
      energizeShiftDays: null,
      newEnergizeDate: energizeDate(plan),
      error: 'Dependencies form a cycle — no schedule can be computed until it is broken.',
    };
  }

  const dates = new Map<string, string | null>();
  for (const m of plan.milestones) dates.set(m.id, m.date);
  dates.set(changedId, newDate);

  const shifted: SlipImpact['shifted'] = [];

  for (const m of ordered) {
    if (m.id === changedId) continue;
    // Only a GENUINELY completed milestone is frozen. One marked done with a
    // future date is still a plan, and pinning it would swallow the slip.
    if (isEffectivelyDone(m, today)) continue;

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

  // Both dates are DERIVED from the same terminal-milestone rule — the one
  // before the change and the one after — so the reported shift is always the
  // difference between two numbers computed the same way. The old version
  // compared a stored target against a latest-finish, which is how the header
  // and the Energize row ended up disagreeing by fourteen days.
  const before = energizeDate(plan);
  const after = energizeDate({
    milestones: plan.milestones.map((m) => ({ ...m, date: dates.get(m.id) ?? m.date })),
  });

  return {
    shifted,
    energizeShiftDays: before && after ? daysBetween(before, after) : null,
    newEnergizeDate: after,
    error: null,
  };
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
    updatedAt: new Date().toISOString(),
    championViewedAt: null,
    championEditedAt: null,
    shareToken: null,
  };
}
