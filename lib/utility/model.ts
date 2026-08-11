/**
 * THE UTILITY LAYER — four levels, none of which blocks the one before it.
 *
 * The old model was deal-bound and name-bound, and both assumptions break.
 *
 * DEAL-BOUND: a market review of a prospect that is not in the pipeline has no
 * deal row, so utility resolution could not be reached at all. Origination has
 * to work from a state and nothing else. Nothing in this module touches a deal,
 * and nothing here joins one — resolve() takes plain fields.
 *
 * NAME-BOUND: the utility's NAME is not what decides the argument, its
 * STRUCTURE is. A regulated IOU, a deregulated wires-only TDU, a muni, a
 * distribution co-op and an IPP are five different conversations, and knowing
 * you are talking to "CenterPoint" tells you nothing until you know it is
 * wires-only inside ERCOT.
 *
 * Each level sharpens the argument. None gates the one below it, the same
 * standard as no-contact account plans and no-hard-gates artifacts: an
 * unanswered level is a NAMED GAP in the output, never a refusal to produce it.
 *
 *   Level 0  state market structure   — zero research, any prospect anywhere
 *   Level 1  utility named, with a type
 *   Level 2  service model            — does rate escalation split in two?
 *   Level 3  tariff                   — standby, departing load, exit fees
 */

export const MARKET_STRUCTURES = ['regulated', 'deregulated', 'hybrid'] as const;
export type MarketStructure = (typeof MARKET_STRUCTURES)[number];

export const MARKET_STRUCTURE_LABELS: Record<MarketStructure, string> = {
  regulated: 'Regulated — vertically integrated incumbent',
  deregulated: 'Deregulated — retail choice',
  hybrid: 'Hybrid — partial or large-load-only choice',
};

/** Level 1. Typed, never free text: the type is what changes the argument. */
export const UTILITY_TYPES = ['iou', 'muni', 'coop', 'wires-only', 'ipp'] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

export const UTILITY_TYPE_LABELS: Record<UtilityType, string> = {
  iou: 'Investor-owned utility',
  muni: 'Municipal utility',
  coop: 'Rural electric co-op',
  'wires-only': 'Wires-only (TDU / EDC)',
  ipp: 'Independent power producer',
};

/**
 * Level 2. Determines whether rate escalation is ONE story or TWO.
 *
 * Against a vertically integrated utility the pitch is a single all-in $/MWh.
 * Against a wires-only TDU the bill splits into a regulated delivery charge
 * that BTM generation barely touches and a competitive energy charge that it
 * displaces entirely — and quoting an all-in number at a customer who buys
 * energy from a REP is quoting a number they do not recognise.
 */
export const SERVICE_MODELS = ['vertically-integrated', 'wires-only', 'gnt-member'] as const;
export type ServiceModel = (typeof SERVICE_MODELS)[number];

export const SERVICE_MODEL_LABELS: Record<ServiceModel, string> = {
  'vertically-integrated': 'Vertically integrated — generation, transmission and delivery',
  'wires-only': 'Wires-only — delivery regulated, energy competitive',
  'gnt-member': 'G&T member — buys wholesale under an all-requirements contract',
};

/**
 * ISOs and RTOs, guarded BY NAME.
 *
 * Two deals in the book carry 'ERCOT' in Utility Territory. ERCOT is a market
 * operator; it does not bill anyone and it is not who a BTM project displaces.
 *
 * The guard DETECTS and DECLINES. It never autocorrects an ISO to a utility —
 * "ERCOT" does not become "Oncor", because which TDU serves a given site is a
 * fact about the site that this function cannot know, and guessing it would put
 * a fabricated counterparty on a customer-facing card. It falls back to the
 * generic label and names the gap instead. Detection in code, resolution human.
 */
export const KNOWN_ISOS = [
  'ERCOT', 'PJM', 'MISO', 'CAISO', 'CAL ISO', 'CALIFORNIA ISO',
  'SPP', 'ISO-NE', 'ISO NE', 'ISONE', 'NEISO', 'NYISO', 'NEW YORK ISO',
] as const;

const ISO_SET = new Set<string>(KNOWN_ISOS.map((s) => s.toUpperCase()));

export function isIso(name: string | null | undefined): boolean {
  return ISO_SET.has((name ?? '').trim().toUpperCase());
}

/**
 * Values that occupy the field without naming anything.
 *
 * 'multi' is by far the most common — 13 of the 21 deals in the seed book carry
 * it — and it means the account spans several territories, so no single utility
 * can be named. One deal carries it in the STATE field too.
 */
const PLACEHOLDERS = new Set([
  'multi', 'multiple', 'various', 'n/a', 'na', 'tbd', 'unknown', 'none', '-', '—',
]);

function isPlaceholder(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return s === '' || PLACEHOLDERS.has(s.toLowerCase());
}

/** The generic label, used wherever a specific counterparty cannot be named. */
export const GENERIC_GRID_LABEL = 'the grid';

// ═══════════════════════════════════════════════════════
// Level 0 — state market structure
// ═══════════════════════════════════════════════════════

export interface StateMarketStructure {
  state: string;
  structure: MarketStructure;
  /** Why it is not the obvious answer, where that is the case. */
  note?: string;
}

/**
 * The seed, and the offline fallback.
 *
 * The table in the database is authoritative at runtime — the point of storing
 * ~50 rows that change once a decade is that a reclassification is an UPDATE
 * rather than a deploy. This constant is what seeds it, and what Level 0
 * answers from when Supabase is not configured, because origination working
 * from a state alone is the whole reason this level exists.
 *
 * PROVENANCE: reported, not verified. This is the shape of US retail
 * restructuring as generally understood, not a reading of any single source,
 * and the boundary cases below are genuinely contested rather than simply
 * unlooked-up. Treat 'hybrid' as "ask before you argue", which is exactly what
 * the resolver does with it.
 */
export const STATE_MARKET_STRUCTURE: StateMarketStructure[] = [
  // ── Deregulated: retail choice for commercial and industrial load ──
  { state: 'CT', structure: 'deregulated' },
  { state: 'DC', structure: 'deregulated' },
  { state: 'DE', structure: 'deregulated' },
  { state: 'IL', structure: 'deregulated' },
  { state: 'MA', structure: 'deregulated' },
  { state: 'MD', structure: 'deregulated' },
  { state: 'ME', structure: 'deregulated' },
  { state: 'NH', structure: 'deregulated' },
  { state: 'NJ', structure: 'deregulated' },
  { state: 'NY', structure: 'deregulated' },
  { state: 'OH', structure: 'deregulated' },
  { state: 'PA', structure: 'deregulated' },
  { state: 'RI', structure: 'deregulated' },
  {
    state: 'TX',
    structure: 'deregulated',
    note: 'ERCOT only. El Paso, and the parts of East Texas inside SPP or MISO, remain vertically integrated.',
  },

  // ── Hybrid: partial, suspended, or large-load-only choice ──
  {
    state: 'CA',
    structure: 'hybrid',
    note: 'Direct access is capped and largely closed; CCA load departure is the live mechanism, and departing-load charges follow it.',
  },
  {
    state: 'GA',
    structure: 'hybrid',
    note: 'Choice exists only for new loads above roughly 900 kW.',
  },
  { state: 'MI', structure: 'hybrid', note: 'Choice is capped near 10% of load.' },
  { state: 'MT', structure: 'hybrid', note: 'Choice retained by large customers only.' },
  { state: 'NV', structure: 'hybrid', note: 'Large customers may exit via an approved impact fee.' },
  { state: 'OR', structure: 'hybrid', note: 'Non-residential choice only, on capped schedules.' },
  {
    state: 'VA',
    structure: 'hybrid',
    note: 'Limited choice for large loads and for aggregated 100% renewable supply.',
  },

  // ── Regulated: vertically integrated incumbent ──
  { state: 'AK', structure: 'regulated' },
  { state: 'AL', structure: 'regulated' },
  { state: 'AR', structure: 'regulated' },
  { state: 'AZ', structure: 'regulated' },
  { state: 'CO', structure: 'regulated' },
  { state: 'FL', structure: 'regulated' },
  { state: 'HI', structure: 'regulated' },
  { state: 'IA', structure: 'regulated' },
  { state: 'ID', structure: 'regulated' },
  { state: 'IN', structure: 'regulated' },
  { state: 'KS', structure: 'regulated' },
  { state: 'KY', structure: 'regulated' },
  { state: 'LA', structure: 'regulated' },
  { state: 'MN', structure: 'regulated' },
  { state: 'MO', structure: 'regulated' },
  { state: 'MS', structure: 'regulated' },
  { state: 'NC', structure: 'regulated' },
  { state: 'ND', structure: 'regulated' },
  { state: 'NE', structure: 'regulated', note: 'Entirely public power — no investor-owned utility in the state.' },
  { state: 'NM', structure: 'regulated' },
  { state: 'OK', structure: 'regulated' },
  { state: 'SC', structure: 'regulated' },
  { state: 'SD', structure: 'regulated' },
  { state: 'TN', structure: 'regulated', note: 'TVA territory — distributors buy wholesale under long-term contracts.' },
  { state: 'UT', structure: 'regulated' },
  { state: 'VT', structure: 'regulated' },
  { state: 'WA', structure: 'regulated' },
  { state: 'WI', structure: 'regulated' },
  { state: 'WV', structure: 'regulated' },
  { state: 'WY', structure: 'regulated' },
];

export const STATE_STRUCTURE_BY_CODE = new Map(
  STATE_MARKET_STRUCTURE.map((s) => [s.state, s]),
);

export function structureForState(state: string | null | undefined): StateMarketStructure | null {
  const key = (state ?? '').trim().toUpperCase();
  if (!key) return null;
  return STATE_STRUCTURE_BY_CODE.get(key) ?? null;
}

// ═══════════════════════════════════════════════════════
// Levels 1–3 — the utility record
// ═══════════════════════════════════════════════════════

export interface UtilityRecord {
  /** Stable slug. Identity, not display. */
  key: string;
  name: string;
  state: string;
  type: UtilityType;
  /** Level 2. Null where it has not been established. */
  serviceModel: ServiceModel | null;
  iso: string | null;
  /**
   * Level 3. NULL IS THE HONEST DEFAULT and is why every seeded utility ships
   * with it unset: inventing a standby charge to fill the field would be worse
   * than the gap it filled, because a pricing argument built on a fabricated
   * tariff loses the deal on the day somebody checks.
   */
  standbyTariff: string | null;
  departingLoadCharge: string | null;
  exitFee: string | null;
  minimumTake: string | null;
  /**
   * Co-op only. An all-requirements contract with a G&T can prohibit BTM
   * generation outright. Null means UNKNOWN, not absent — see coopRisk().
   */
  allRequirementsContract: boolean | null;
  notes: string | null;
}

// ═══════════════════════════════════════════════════════
// Structural risks — qualification-stage, not late diligence
// ═══════════════════════════════════════════════════════

export type RiskSeverity = 'no-go-candidate' | 'open-question';

export interface StructuralRisk {
  key: 'coop-all-requirements' | 'standby-departing-load';
  /** The level at which it becomes discoverable. */
  level: 0 | 1 | 2 | 3;
  severity: RiskSeverity;
  label: string;
  detail: string;
  /** The one question that closes it. */
  question: string;
  answered: boolean;
}

/**
 * CO-OP ALL-REQUIREMENTS CONTRACTS — surfaced the moment a co-op is identified.
 *
 * Many distribution co-ops buy all their power from a G&T under contracts that
 * run for decades and either prohibit behind-the-meter generation outright or
 * price an exit punitively. That is a 🔴 NO-GO risk, and it is discoverable at
 * LEVEL 1 — the moment the type field says 'coop' — which makes it a
 * qualification question rather than something found in month five.
 *
 * Note the asymmetry the null carries: unknown is treated as a live risk, not
 * as absence. A co-op whose contract nobody has checked is exactly the deal
 * this flag exists for.
 */
export function coopRisk(u: Pick<UtilityRecord, 'type' | 'allRequirementsContract'>): StructuralRisk | null {
  if (u.type !== 'coop') return null;

  const answered = u.allRequirementsContract === false;
  return {
    key: 'coop-all-requirements',
    level: 1,
    severity: 'no-go-candidate',
    label:
      u.allRequirementsContract === true
        ? 'All-requirements contract confirmed — NO-GO candidate'
        : 'All-requirements contract unverified — NO-GO candidate',
    detail:
      'Distribution co-ops commonly buy all their power from a G&T under long-term all-requirements contracts. Many prohibit behind-the-meter generation outright, and those that permit it often price the exit punitively. Nothing downstream of this — economics, MAP, pricing defense — survives a contract that forbids the project.',
    question:
      'Does the co-op hold an all-requirements contract with its G&T, and what does it say about member-sited generation and exit?',
    answered,
  };
}

/**
 * STANDBY AND DEPARTING-LOAD TARIFFS — the largest silent risk in any pricing
 * argument.
 *
 * An IOU's standby charge bills the customer for the capacity the utility must
 * hold in reserve behind an onsite generator, and it can erase BTM economics
 * outright. It is genuinely a Level 3 question — it needs the actual tariff —
 * which is precisely why it has to be named rather than waited for. Every
 * pricing defense card carries it as an explicit gap until it is answered.
 *
 * Same no-hard-gates standard as every other missing input: the card generates,
 * and says what it does not know.
 */
export function standbyRisk(
  u: Pick<UtilityRecord, 'type' | 'standbyTariff' | 'departingLoadCharge'> | null,
): StructuralRisk {
  const answered = Boolean(u && (u.standbyTariff || u.departingLoadCharge));
  return {
    key: 'standby-departing-load',
    level: 3,
    severity: 'open-question',
    label: answered
      ? 'Standby / departing-load terms on record'
      : 'Standby / departing-load charge unquantified',
    detail:
      'A standby charge bills for the capacity the utility holds in reserve behind an onsite generator, and a departing-load or exit charge bills for leaving. Either can erase the savings a BTM case is built on. Unquantified, it is the single largest silent risk in a pricing argument — the number looks right until the tariff is read.',
    question:
      'What is the applicable standby rate schedule, and are departing-load or exit charges triggered by onsite generation at this service level?',
    answered,
  };
}

// ═══════════════════════════════════════════════════════
// The resolver
// ═══════════════════════════════════════════════════════

export interface ResolveInput {
  /** Two-letter code. Level 0 needs nothing else. */
  state?: string | null;
  /**
   * Site-level territory, which WINS over the account-level field. A national
   * account's Utility Territory describes the company; the beachhead is where
   * the electrons and the tariff actually are.
   */
  siteUtility?: string | null;
  /** Account-level Utility Territory, from `deals.utility`. */
  accountUtility?: string | null;
  /** The Level 1–3 record, when one has been resolved. */
  record?: UtilityRecord | null;
  /** Level 0 row, when the table has been read. Falls back to the seed. */
  stateStructure?: StateMarketStructure | null;
}

export interface UtilityContext {
  /** How far the record gets. 0 is always reachable; nothing below it blocks. */
  level: 0 | 1 | 2 | 3;
  state: string | null;
  marketStructure: MarketStructure | null;
  marketStructureNote: string | null;
  /** What the grid posture is CALLED. Never an ISO, never a placeholder. */
  gridLabel: string;
  /** Where the name came from, or why there is not one. */
  nameSource: 'site' | 'account' | 'none';
  utilityName: string | null;
  utilityType: UtilityType | null;
  serviceModel: ServiceModel | null;
  /** Set when the field held a market operator rather than a utility. */
  isoInField: string | null;
  /** Named, never silently skipped. One line each. */
  gaps: string[];
  risks: StructuralRisk[];
}

/**
 * Resolve as far as the record allows, and name the rest.
 *
 * NOTHING HERE TAKES A DEAL. A market review of a company nobody has entered
 * resolves at Level 0 from a two-letter state code, which is the whole point:
 * if a deals join were the only path, origination would get nothing.
 */
export function resolveUtility(input: ResolveInput = {}): UtilityContext {
  const gaps: string[] = [];
  const risks: StructuralRisk[] = [];

  // ── Level 0 ──
  // A placeholder in the state field is NOT an unknown jurisdiction. One seed
  // deal carries state 'multi'; treating it as a missing reference row would
  // report a gap in the lookup table when the gap is in the deal.
  const rawState = (input.state ?? '').trim();
  const state = isPlaceholder(rawState) ? null : rawState.toUpperCase();
  const stateRow = input.stateStructure ?? structureForState(state);
  if (!state) {
    gaps.push(
      'No state on record. Market structure is the one thing available for any prospect anywhere with no research at all — a two-letter code unlocks it.',
    );
  } else if (!stateRow) {
    gaps.push(
      `No market structure on record for ${state}. Every US jurisdiction should have one; this is a gap in the reference table rather than in the deal.`,
    );
  } else if (stateRow.structure === 'hybrid') {
    gaps.push(
      `${state} is a hybrid market${stateRow.note ? ` — ${stateRow.note}` : ''}. Whether this customer can actually buy competitively is a question to ask, not to assume.`,
    );
  }

  // ── Name resolution: site first, then account, then generic ──
  const rawSite = input.siteUtility ?? null;
  const rawAccount = input.accountUtility ?? null;

  let isoInField: string | null = null;
  let picked: string | null = null;
  let nameSource: UtilityContext['nameSource'] = 'none';

  for (const [value, source] of [
    [rawSite, 'site'],
    [rawAccount, 'account'],
  ] as [string | null, 'site' | 'account'][]) {
    if (isPlaceholder(value)) continue;
    if (isIso(value)) {
      // Detected, declined, NOT corrected. Which TDU serves a given site is a
      // fact about the site, and inventing one would put a fabricated
      // counterparty on a customer-facing card.
      isoInField = value!.trim();
      continue;
    }
    picked = value!.trim();
    nameSource = source;
    break;
  }

  const record = input.record ?? null;
  const utilityName = record?.name ?? picked;
  const gridLabel = utilityName ?? GENERIC_GRID_LABEL;

  if (isoInField && !utilityName) {
    gaps.push(
      `Utility Territory reads “${isoInField}”, which is a market operator rather than the utility that bills this site. The grid argument stays generic until the serving utility is named — it is not inferred, because which one serves a given site is a fact about the site.`,
    );
  }
  if (!utilityName && !isoInField) {
    gaps.push(
      'No utility named. The grid argument is generic — “your rate escalates” rather than a rate this buyer recognises on their own bill.',
    );
  }

  // ── Levels 1–3 ──
  let level: UtilityContext['level'] = 0;
  if (record) {
    level = 1;
    if (record.serviceModel) level = 2;
    if (record.standbyTariff || record.departingLoadCharge) level = 3;

    if (!record.serviceModel) {
      gaps.push(
        `Service model unknown for ${record.name}. It decides whether rate escalation is one story or two — against a wires-only utility the bill splits into regulated delivery and competitive energy, and an all-in $/MWh is a number the buyer does not recognise.`,
      );
    }

    const coop = coopRisk(record);
    if (coop) risks.push(coop);
  } else if (utilityName) {
    // Named but untyped is still Level 0: the name alone decides nothing.
    gaps.push(
      `“${utilityName}” is named but not typed. IOU, muni, co-op, wires-only and IPP are five different conversations, and the type is what selects which one.`,
    );
  }

  // Level 3 is open until answered, always, and on every pricing argument.
  const standby = standbyRisk(record);
  risks.push(standby);
  if (!standby.answered) {
    gaps.push(
      `Standby and departing-load charges unquantified${utilityName ? ` for ${utilityName}` : ''}. This is the largest silent risk in the pricing argument: the savings number looks right until the tariff is read.`,
    );
  }

  return {
    level,
    state,
    marketStructure: stateRow?.structure ?? null,
    marketStructureNote: stateRow?.note ?? null,
    gridLabel,
    nameSource,
    utilityName,
    utilityType: record?.type ?? null,
    serviceModel: record?.serviceModel ?? null,
    isoInField,
    gaps,
    risks,
  };
}

/** Risks that belong on the qualification surface rather than in diligence. */
export function qualificationRisks(ctx: UtilityContext): StructuralRisk[] {
  return ctx.risks.filter((r) => !r.answered && r.severity === 'no-go-candidate');
}
