import { MEDDPICC_FIELDS, TERMINAL_STAGES, type Deal, type DealCompetitor, type DealStage } from '@/lib/types';
import { meddpiccResult } from '@/lib/deals';
import { healthComposition } from '@/lib/health-composition';
import type { SeedState } from '@/lib/seed-state';

/**
 * ═══════════════════════════════════════════════════════════════
 * SPINE EXPORT — the pipeline as markdown, READ-ONLY, DATE-STAMPED.
 * ═══════════════════════════════════════════════════════════════
 *
 * The pinned `Pipeline-Spine.md` in the Claude project is maintained by hand
 * and has already drifted: it records one account at 6/10 health while the database
 * computes 4 after the critical-event cap. A hand-maintained copy of a
 * computed number is a copy that is wrong from the first time the computation
 * changes — the same defect as the second stage ladder in `lib/deals.ts`, one
 * layer up and in a file a model reasons from.
 *
 * ══ READ-ONLY IS A STRUCTURAL PROPERTY, NOT AN INTENTION ══
 *
 * This module renders text. It has no client, no write, and nothing that
 * could acquire one without a reviewer seeing it. The route that serves it
 * exports GET and nothing else — no POST, no PATCH, no DELETE — and the suite
 * asserts that, because a chat surface that could update deals is exactly the
 * silent-write risk this build spent two weeks removing, wearing a friendly
 * interface. There is no audit trail here because there is nothing to audit.
 *
 * ══ IT NEVER RENDERS SEED DATA AS A PIPELINE ══
 *
 * `getDeals()` falls back to `SEED_DEALS` on a failed read. That is right for
 * a dashboard — something renders — and CATASTROPHIC here: a Spine pinned from
 * demonstration rows would have a model reasoning confidently about accounts
 * that do not exist. The export takes a `SeedState` and refuses to emit a deal
 * table for anything but real data, saying which state it is in instead.
 *
 * ══ THE STAMP IS THE POINT ══
 *
 * Every export leads with when it was generated and how many deals it covers.
 * A pinned artifact with no date is one nobody can tell is stale, which is how
 * the current one drifted without anyone noticing.
 *
 * PURE. Takes rows and a timestamp, returns a string.
 */

export interface SpineExportInput {
  deals: Deal[];
  /** Every competitor row across every deal. Indexed here, not queried here. */
  competitors: DealCompetitor[];
  /** ISO. Passed in so the output is testable and the clock is the caller's. */
  generatedAt: string;
  /** What the read actually did. Governs whether a table is emitted at all. */
  state: SeedState;
}

/**
 * Why a health score is what it is.
 *
 * The disagreement that prompted this export was a stored 4 against a pinned
 * 6, and the reason — the critical-event cap — was not visible anywhere. A
 * number a reader cannot account for is a number they will assume is wrong.
 *
 * Mirrors the caps in `computeHealthScore` and in `compute_health_score()`.
 */
export function healthCaps(deal: Deal): string[] {
  /**
   * ⚠️ "CAPPED AT 6" IS ONLY TRUE WHEN THE CAP IS BINDING, and for the whole
   * life of this export it was printed whenever the condition was absent.
   *
   * Twenty of twenty-one deals compute to 1.5. A cap at 6 holds nothing down
   * there — the sentence describes a rule that is not operating, and it reads
   * as the reason the number is low. A reader chasing it goes and finds a
   * second contact, and the number moves by nothing.
   *
   * So the two states get different sentences: the cap that is holding the
   * score down, and the condition that is simply absent.
   */
  const c = healthComposition(deal);
  return c.caps.map((cap) =>
    cap.binding
      ? `${cap.inline} — holding this at ${c.final}, from ${c.uncapped} on the terms (${cap.why})`
      : `${cap.inline} — not what is holding this back today; it scores ${c.final} before any cap (${cap.why})`,
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function fmt(value: string | number | null | undefined, unit = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${unit}`;
}

/** Group competitor rows by deal so each block resolves without a scan. */
export function competitorsByDeal(rows: DealCompetitor[]): Map<string, DealCompetitor[]> {
  const map = new Map<string, DealCompetitor[]>();
  for (const row of rows) {
    const list = map.get(row.deal_id) ?? [];
    list.push(row);
    map.set(row.deal_id, list);
  }
  return map;
}

function meddpiccBlock(deal: Deal, competitorCount: number): string {
  const result = meddpiccResult(deal, competitorCount);
  const label = (key: string) => MEDDPICC_FIELDS.find((f) => f.key === key)?.label ?? key;

  const lines = MEDDPICC_FIELDS.map((f) => {
    const known = result.known.includes(f.key);
    const unscored = result.unscored.includes(f.key);
    const mark = unscored ? '❓' : known ? '✅' : '⚠️';

    // The VALUE, not just the state. "Economic Buyer ✅" tells a reader a box
    // is ticked; "Economic Buyer ✅ Dana Reyes" tells them who to call.
    let value: string;
    if (f.key === 'competition') {
      value = competitorCount > 0 ? `${competitorCount} competitor row(s)` : 'none recorded';
    } else {
      const raw = deal[f.key as keyof Deal];
      value = typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : fmt(raw as string | null);
    }
    return `| ${label(f.key)} | ${mark} | ${value} |`;
  });

  return [
    `**MEDDPICC ${result.score}/8**`,
    '',
    '| Pillar | | Value |',
    '|---|---|---|',
    ...lines,
  ].join('\n');
}

function competitorBlock(rows: DealCompetitor[]): string {
  if (rows.length === 0) {
    // ⚠️ NOT "no competitors". Zero stored rows means the toggle grid is at
    // its defaults — do-nothing and the grid, both ON — which is the ordinary
    // deal rather than an uncontested one.
    return [
      '**Competitive** — no stored rows. That is the DEFAULT grid (do-nothing and',
      'the grid, both on), not an uncontested deal. Nothing has been recorded either way.',
    ].join('\n');
  }

  return [
    '**Competitive**',
    '',
    '| Competitor | Tier | Status | Our posture | What they said | What landed |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (c) =>
        `| ${c.competitor} | ${c.tier} | ${c.status} | ${fmt(c.posture)} | ${fmt(c.what_was_said)} | ${fmt(c.what_landed)} |`,
    ),
  ].join('\n');
}

function dealBlock(deal: Deal, competitors: DealCompetitor[]): string {
  const caps = healthCaps(deal);
  const terminal = TERMINAL_STAGES.includes(deal.stage as DealStage);

  const header = `### ${deal.deal_id} · ${deal.company}`;

  const facts = [
    '| | |',
    '|---|---|',
    `| Stage | ${deal.stage}${terminal ? ' *(terminal)*' : ''} · ${deal.days_in_stage} days in stage |`,
    `| Vertical | ${fmt(deal.vertical)} |`,
    `| Relationship | ${fmt(deal.relationship_type)} |`,
    `| Geography | ${fmt(deal.state)} · ${fmt(deal.geo_tier)} tier |`,
    `| Utility | ${fmt(deal.beachhead_utility ?? deal.utility)}${
      deal.beachhead_utility && deal.utility && deal.beachhead_utility !== deal.utility
        ? ` *(beachhead site; account-level is ${deal.utility})*`
        : ''
    } |`,
    `| Beachhead site | ${fmt(deal.beachhead_site)} |`,
    `| Value prop | ${fmt(deal.value_prop)} |`,
    `| Size | ${fmt(deal.size_mw, ' MW')} · ${fmt(deal.size_usd_m ? `$${deal.size_usd_m}M` : null)} |`,
    `| Multi-threaded | ${deal.multi_threaded ? 'yes' : '⚠️ NO'} |`,
    `| Decision process mapped | ${deal.decision_mapped ? 'yes' : '⚠️ no'} |`,
  ].join('\n');

  const health = [
    `**Health ${deal.health_score}/10**`,
    caps.length
      ? // The reason, inline. The pinned Spine said 6 and the database said 4;
        // neither number explained itself.
        `\n${caps.map((c) => `- ${c}`).join('\n')}`
      : '\n- No caps applied.',
  ].join('');

  const criticalEvent = deal.critical_event?.trim()
    ? `**Critical event** — ${deal.critical_event}${
        deal.critical_event_date ? ` (${fmtDate(deal.critical_event_date)})` : ' *(no date on record)*'
      }`
    : '**Critical event** — ⚠️ none. Nothing forces a decision on any date, and no-decision is the dominant loss mode.';

  const nextMove = `**Next move** — ${fmt(deal.next_move)}${
    deal.next_move_date ? ` by ${fmtDate(deal.next_move_date)}` : ''
  }`;

  const risk = deal.key_risk?.trim() ? `**Key risk** — ${deal.key_risk}` : null;

  const expansion =
    deal.landed_site || deal.next_target_site || deal.expansion_mw_captured > 0
      ? `**Land and expand** — landed: ${fmt(deal.landed_site)} · next target: ${fmt(
          deal.next_target_site,
        )} · captured ${fmt(deal.expansion_mw_captured, ' MW')} of ${fmt(
          deal.expansion_mw_addressable,
          ' MW',
        )} addressable`
      : null;

  const partner = deal.partner_notes?.trim() ? `**Partner notes** — ${deal.partner_notes}` : null;
  const notes = deal.notes?.trim() ? `**Notes** — ${deal.notes}` : null;

  return [
    header,
    '',
    facts,
    '',
    health,
    '',
    criticalEvent,
    '',
    meddpiccBlock(deal, competitors.length),
    '',
    competitorBlock(competitors),
    '',
    nextMove,
    risk,
    expansion,
    partner,
    notes,
  ]
    .filter((s) => s !== null)
    .join('\n');
}

/**
 * The portfolio line.
 *
 * Terminal deals are counted SEPARATELY rather than folded into the total. A
 * pipeline figure that includes closed and archived deals is a figure nobody
 * can act on, and `Archived` sitting last in `DEAL_STAGES` has already caused
 * two bugs from being treated as a position rather than an outcome.
 */
function snapshot(deals: Deal[]): string {
  const live = deals.filter((d) => !TERMINAL_STAGES.includes(d.stage as DealStage));
  const terminal = deals.filter((d) => TERMINAL_STAGES.includes(d.stage as DealStage));

  const sized = live.filter((d) => d.size_usd_m != null);
  const total = sized.reduce((n, d) => n + (d.size_usd_m ?? 0), 0);
  const mwSized = live.filter((d) => d.size_mw != null);
  const totalMw = mwSized.reduce((n, d) => n + (d.size_mw ?? 0), 0);

  const singleThreaded = live.filter((d) => !d.multi_threaded).length;
  const noCriticalEvent = live.filter((d) => !d.critical_event?.trim()).length;
  const stalled = live.filter((d) => d.days_in_stage > 30).length;

  return [
    '| | |',
    '|---|---|',
    `| Live deals | ${live.length} |`,
    `| Terminal (Closed-Won / Post-Sale / Archived) | ${terminal.length} |`,
    // Sized-only, and it says so. Summing a column with nulls in it and
    // presenting the result as the pipeline is a fabricated number.
    `| Pipeline value | $${total}M across ${sized.length} of ${live.length} live deals that carry a size |`,
    `| Capacity | ${totalMw} MW across ${mwSized.length} of ${live.length} |`,
    `| ⚠️ Single-threaded | ${singleThreaded} |`,
    `| ⚠️ No critical event | ${noCriticalEvent} |`,
    `| ⚠️ Over 30 days in stage | ${stalled} |`,
  ].join('\n');
}

const FOOTER = `---

## What this file is, and is not

**Generated, read-only, and a snapshot.** It is emitted by \`GET /api/spine/export\`,
which serves text and has no write handler of any kind. Nothing in a chat can
change a deal through this path — not this file, not the endpoint, not the
module that renders it. Editing this file by hand changes nothing in the
database; re-export instead.

**It supersedes any hand-maintained copy.** The previous pinned Spine recorded
one account at 6/10 health while the database computed 4 after the critical-event cap.
Health, MEDDPICC and days-in-stage are all DERIVED — a hand-kept copy of a
computed number is wrong from the first time the computation changes.

**Health caps are printed with the number.** A score a reader cannot account
for is a score they will assume is wrong.

**Absence is stated, never filled.** A missing size, a missing critical event
and an empty competitor grid all say so rather than showing a zero or a blank.
Zero stored competitor rows means the toggle grid is at its DEFAULTS, not that
the deal is uncontested.

**Pipeline value sums only deals that carry a size**, and says how many of the
live deals that is.`;

export function renderSpine(input: SpineExportInput): string {
  const { deals, competitors, generatedAt, state } = input;
  const stamp = generatedAt.replace('T', ' ').slice(0, 16);

  const head = [
    '# Pipeline Spine',
    '',
    `**Generated ${stamp} UTC** · ${deals.length} deal${deals.length === 1 ? '' : 's'}`,
    '',
    'Re-export before relying on this. Every figure below is a snapshot of the',
    'moment above, and health, MEDDPICC and days-in-stage all change without',
    'anyone editing a deal.',
  ].join('\n');

  // ⚠️ A FAILED READ NEVER RENDERS A TABLE. `getDeals()` substitutes SEED_DEALS
  // on error, which is right for a dashboard and catastrophic for a file a
  // model reasons from — it would produce confident analysis of accounts that
  // do not exist.
  if (state.kind === 'unreadable') {
    return [
      head,
      '',
      '## ⚠️ COULD NOT READ THE PIPELINE',
      '',
      `The query failed, so **nothing below is known** — this is not an empty pipeline.`,
      '',
      `> ${state.reason}`,
      '',
      '**Do not pin this file.** Fix the read and export again.',
      '',
      FOOTER,
    ].join('\n');
  }

  if (state.kind === 'seeded') {
    return [
      head,
      '',
      '## ⚠️ THIS IS SEED DATA, NOT YOUR PIPELINE',
      '',
      `All ${state.count} rows are demonstration material shipped with the platform.`,
      'A Spine pinned from these would have a model reasoning confidently about',
      'accounts that do not exist.',
      '',
      '**Do not pin this file.** Load real deals and export again.',
      '',
      FOOTER,
    ].join('\n');
  }

  if (deals.length === 0) {
    return [
      head,
      '',
      '## No deals',
      '',
      'The read succeeded and the pipeline is genuinely empty. This is a fact',
      'about the database, not a failure to load it.',
      '',
      FOOTER,
    ].join('\n');
  }

  const byDeal = competitorsByDeal(competitors);

  // Ordered by health, worst first — the same order the pipeline table uses,
  // so the file and the app agree about what is most urgent.
  const ordered = [...deals].sort(
    (a, b) => a.health_score - b.health_score || a.deal_id.localeCompare(b.deal_id),
  );

  const seedNote =
    state.kind === 'populated' && state.seeded > 0
      ? `\n\n⚠️ ${state.seeded} of these are seeded demonstration rows, not your data.`
      : '';

  return [
    head + seedNote,
    '',
    '## Portfolio',
    '',
    snapshot(deals),
    '',
    '## Deals',
    '',
    ordered.map((d) => dealBlock(d, byDeal.get(d.id) ?? [])).join('\n\n---\n\n'),
    '',
    FOOTER,
  ].join('\n');
}
