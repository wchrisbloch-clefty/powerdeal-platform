import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DOMAIN_TASKS, isDomainTask } from '@/lib/engine/model-routing';
import {
  MEETING_TYPES, gateBand, marketIntelRows, meetingType, openerBranches,
  timeBox, undatedIntel, walkOutChecklist,
} from '@/lib/meeting-prep';
import { buildMeetingPrepPrompt, meetingPrepDegradedHeader } from '@/lib/prompts/modules/meeting-prep';
import { DEAL_STAGES, type Deal, type MarketWatchEntry, type Signal } from '@/lib/types';

/**
 * MEETING PREP.
 *
 * The skill file holds the doctrine and is handed over verbatim. What is tested
 * here is the part that is arithmetic — the clock, the walk-out split, the
 * opener preconditions and the dating of intel — plus the one structural claim
 * that matters about the prompt: that everything computed here actually reaches
 * the model.
 *
 * The trap in testing a generator is asserting that a string was produced. A
 * generator that emits the eight block headings and nothing account-specific
 * passes that, and is exactly the useless brief this replaces. So the prompt
 * assertions check that the LIVE RECORD landed in the text, not that the
 * template did.
 */

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: 'uuid-1',
    deal_id: 'DEF-001',
    company: 'Acme Defense',
    vertical: 'Defense',
    relationship_type: 'Direct',
    geo_tier: 'Tier 1',
    state: 'TX',
    utility: 'Oncor',
    value_prop: 'Reliability',
    beachhead_site: 'Fort Worth',
    beachhead_utility: null,
    stage: 'Discovery',
    size_mw: 12,
    size_usd_m: 40,
    meddpicc_score: 3,
    health_score: 6,
    multi_threaded: false,
    decision_mapped: false,
    days_in_stage: 41,
    next_move: null,
    next_move_date: null,
    key_risk: null,
    critical_event: null,
    critical_event_date: null,
    metrics_known: false,
    economic_buyer: null,
    decision_criteria: null,
    decision_process: null,
    identified_pain: null,
    champion: null,
    competition: null,
    landed_site: null,
    next_target_site: null,
    expansion_mw_captured: 0,
    expansion_mw_addressable: null,
    partner_notes: null,
    notes: null,
    artifacts: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user_id: null,
    ...over,
  } as Deal;
}

function watch(over: Partial<MarketWatchEntry> = {}): MarketWatchEntry {
  return {
    id: 'w1',
    category: 'rate-move',
    source_name: 'RTO Insider',
    source_tier: 'reported',
    headline: 'Oncor files for a 9% distribution increase',
    summary: null,
    url: null,
    deal_ids: ['DEF-001'],
    outreach_hook: 'Their delivery charge moves before their contract renews.',
    peers_to_add: [],
    impact_rank: 8,
    swept_at: '2026-08-04T13:00:00Z',
    user_id: null,
    ...over,
  } as MarketWatchEntry;
}

function signal(over: Partial<Signal> = {}): Signal {
  return {
    id: 's1',
    signal_type: 'account',
    source_name: 'CB site walk',
    deal_ids: ['DEF-001'],
    account_meaning: null,
    business_meaning: null,
    so_what: 'Second shift is the constraint.',
    raw_signal: 'Plant added a second shift in July.',
    logged_at: '2026-07-30T00:00:00Z',
    user_id: null,
    ...over,
  } as Signal;
}

// ── The clock ───────────────────────────────────────────────────

describe('time-boxing', () => {
  /**
   * The invariant that makes the agenda usable. An allocation whose parts add
   * to 31 minutes for a 30-minute meeting is wrong in the way nobody notices
   * until they are eight minutes over and have not asked for the next meeting.
   *
   * Swept across the whole plausible range rather than spot-checked, because
   * rounding bugs live at specific totals and a three-value test walks past
   * them.
   */
  it('segments sum to exactly the total, at every length', () => {
    for (let n = 1; n <= 180; n++) {
      const box = timeBox(n);
      const sum = box.segments.reduce((a, s) => a + s.minutes, 0);
      expect(sum, `${n} minutes allocated to ${sum}`).toBe(n);
    }
  });

  it('never allocates a negative segment', () => {
    for (let n = 1; n <= 180; n++) {
      for (const s of timeBox(n).segments) {
        expect(s.minutes, `${n} min → ${s.key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  const close = (n: number) => timeBox(n).segments.find((s) => s.key === 'close')!.minutes;

  it('protects the close before anything else gets minutes', () => {
    // Running out of time costs the multi-thread ask and the dated next step —
    // two of the five must-walk-out items. Running out on an implication
    // question costs one question.
    for (let n = 4; n <= 180; n++) {
      expect(close(n), `${n} minutes left the close at ${close(n)}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('takes the close out of the meeting itself when the slot is tiny', () => {
    // 3 minutes cannot fund a 4-minute floor. It gets what exists, not a
    // fabricated 4 that breaks the sum.
    expect(close(3)).toBe(3);
    expect(timeBox(3).segments.reduce((a, s) => a + s.minutes, 0)).toBe(3);
  });

  it('scales the question count with the clock', () => {
    expect(timeBox(30).coreQuestions).toBeLessThan(timeBox(90).coreQuestions);
    expect(timeBox(90).coreQuestions).toBeLessThanOrEqual(10);
    expect(timeBox(60).coreQuestions).toBeGreaterThanOrEqual(6);
  });

  it('warns when the skill range does not fit, and stays quiet when it does', () => {
    // Both directions. A warning that always fires is not a warning.
    expect(timeBox(15).warnings.join(' ')).toContain('6–10 range does not');
    expect(timeBox(60).warnings).toEqual([]);
  });

  it('warns when their questions get squeezed to nothing', () => {
    const tiny = timeBox(12);
    expect(tiny.segments.find((s) => s.key === 'their-questions')!.minutes).toBe(0);
    expect(tiny.warnings.join(' ')).toContain('their questions');
    expect(timeBox(60).warnings.join(' ')).not.toContain('No time budgeted');
  });

  it('produces a brief with no length supplied rather than refusing', () => {
    const none = timeBox(0);
    expect(none.total).toBe(0);
    expect(none.warnings).toHaveLength(1);
    expect(none.segments).toHaveLength(5);
  });
});

// ── The two axes ────────────────────────────────────────────────

describe('gate translation', () => {
  it('answers for every stage in the ladder', () => {
    for (const s of DEAL_STAGES) expect(gateBand(s)).not.toBe('unknown');
  });

  it('says unknown rather than guessing at a stage it does not have', () => {
    expect(gateBand('Somebody Renamed This')).toBe('unknown');
  });

  it('returns a band where the mapping is lossy, not a single gate', () => {
    // Collapsing a commercial stage onto one engineering gate would be
    // inventing a fact. Contracting spans G4 to G6 and says so.
    expect(gateBand('Contracting')).toContain('–');
    expect(gateBand('Solution Design')).toContain('–');
  });
});

describe('the meeting router', () => {
  it('carries every row of the skill', () => {
    expect(MEETING_TYPES).toHaveLength(16);
  });

  it('resolves a key and returns undefined for one it does not have', () => {
    expect(meetingType('cfo')?.label).toBe('CFO / Finance');
    expect(meetingType('brunch')).toBeUndefined();
  });
});

// ── Walk-out checklist ──────────────────────────────────────────

describe('walk-out checklist reads the live record', () => {
  it('always carries the skill’s five', () => {
    const keys = walkOutChecklist(deal({
      metrics_known: true, identified_pain: 'p', multi_threaded: true, champion: 'c',
      decision_criteria: 'dc', decision_mapped: true, decision_process: 'dp',
      next_move: 'n', next_move_date: '2026-09-01',
      economic_buyer: 'eb', critical_event: 'ce',
    })).map((i) => i.key);
    expect(keys).toEqual([
      'pain-number', 'new-stakeholder', 'decision-driver', 'decision-process', 'next-step',
    ]);
  });

  it('marks an empty deal entirely open, and adds the two account holes', () => {
    const items = walkOutChecklist(deal());
    expect(items.every((i) => i.status === 'open')).toBe(true);
    expect(items.map((i) => i.key)).toContain('economic-buyer');
    expect(items.map((i) => i.key)).toContain('critical-event');
  });

  const status = (key: string, over: Partial<Deal>) =>
    walkOutChecklist(deal(over)).find((i) => i.key === key)!.status;

  it('a next move with no date is not a next step', () => {
    // The whole defect this item exists to catch.
    expect(status('next-step', { next_move: 'Send the one-pager' })).toBe('open');
    expect(status('next-step', { next_move: 'Send the one-pager', next_move_date: '2026-09-01' })).toBe('known');
  });

  it('a named champion on a single-threaded deal is still an open ask', () => {
    // The ask exists to create multi-threading. One name is one point of failure.
    expect(status('new-stakeholder', { champion: 'Dana Reyes' })).toBe('open');
    expect(status('new-stakeholder', { champion: 'Dana Reyes', multi_threaded: true })).toBe('known');
  });

  it('pain text without the metrics flag is not a quantified number', () => {
    expect(status('pain-number', { identified_pain: 'outages hurt' })).toBe('open');
    expect(status('pain-number', { identified_pain: 'outages hurt', metrics_known: true })).toBe('known');
  });

  it('a mapped process needs both the flag and the text', () => {
    expect(status('decision-process', { decision_process: 'IC in Q4' })).toBe('open');
    expect(status('decision-process', { decision_mapped: true })).toBe('open');
    expect(status('decision-process', { decision_process: 'IC in Q4', decision_mapped: true })).toBe('known');
  });

  it('treats whitespace as absent', () => {
    expect(status('decision-driver', { decision_criteria: '   ' })).toBe('open');
    expect(status('decision-driver', { decision_criteria: 'uptime' })).toBe('known');
  });

  it('carries what the Spine already holds, so the rep confirms instead of re-asking', () => {
    const item = walkOutChecklist(deal({ decision_criteria: 'uptime first, then $' }))
      .find((i) => i.key === 'decision-driver')!;
    expect(item.have).toBe('uptime first, then $');
  });

  it('names Spine fields as the Spine names them', () => {
    const fields = walkOutChecklist(deal()).flatMap((i) => i.fields);
    for (const f of ['identified_pain', 'champion', 'decision_process', 'next_move_date', 'critical_event']) {
      expect(fields).toContain(f);
    }
  });
});

// ── Market intel ────────────────────────────────────────────────

describe('market intel is dated', () => {
  it('dates each row from the record and puts market watch first', () => {
    const rows = marketIntelRows([watch()], [signal()]);
    expect(rows[0].recordedOn).toBe('2026-08-04');
    expect(rows[1].recordedOn).toBe('2026-07-30');
    expect(rows[0].hook).toBe('Their delivery charge moves before their contract renews.');
  });

  it('keeps an undated row and marks it, rather than dropping it', () => {
    // Dropping it hides a gap a rep could close with one search.
    const rows = marketIntelRows([watch({ swept_at: '' as unknown as string })], []);
    expect(rows).toHaveLength(1);
    expect(undatedIntel(rows)).toHaveLength(1);
  });

  it('finds nothing to flag when every row is dated', () => {
    expect(undatedIntel(marketIntelRows([watch()], [signal()]))).toEqual([]);
  });

  it('does not lose a signal that has no raw text', () => {
    const rows = marketIntelRows([], [signal({ raw_signal: null, signal_type: 'rate-move' })]);
    expect(rows[0].signal).toContain('rate-move');
  });

  it('caps the list', () => {
    expect(marketIntelRows(Array.from({ length: 20 }, () => watch()), [], 3)).toHaveLength(3);
  });

  it('is empty for an account with nothing mapped', () => {
    expect(marketIntelRows([], [])).toEqual([]);
  });
});

// ── Opener branches ─────────────────────────────────────────────

describe('openers branch on the record', () => {
  it('always offers three, each with a selection condition', () => {
    const b = openerBranches(deal(), []);
    expect(b.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    for (const x of b) expect(x.selectWhen.length).toBeGreaterThan(20);
  });

  it('grounds the Challenger open in the freshest dated signal', () => {
    const rows = marketIntelRows([watch()], []);
    const a = openerBranches(deal(), rows)[0];
    expect(a.grounding).toContain('Oncor files for a 9% distribution increase');
    expect(a.grounding).toContain('2026-08-04');
    expect(a.gap).toBeNull();
  });

  it('tells the rep NOT to use it when nothing dated grounds it', () => {
    const a = openerBranches(deal(), [])[0];
    expect(a.grounding).toBeNull();
    expect(a.selectWhen).toContain('Do NOT');
    expect(a.gap).toContain('market-watch');
  });

  it('ignores an undated row for grounding purposes', () => {
    // An undated hook invites "when?" — it cannot carry a Challenger open.
    const rows = marketIntelRows([watch({ swept_at: '' as unknown as string })], []);
    expect(openerBranches(deal(), rows)[0].grounding).toBeNull();
  });

  it('reads the room from the meeting type for the mission open', () => {
    expect(openerBranches(deal(), [], 'technical')[1].selectWhen).toContain('technical or operational');
    expect(openerBranches(deal(), [], 'cfo')[1].selectWhen).not.toContain('technical or operational');
  });

  it('names the pain when the record has one, and the gap when it does not', () => {
    expect(openerBranches(deal({ identified_pain: 'two outages last summer' }), [])[1].grounding)
      .toContain('two outages last summer');
    expect(openerBranches(deal(), [])[1].gap).toContain('No identified pain');
  });

  it('makes the soft open the default on a cold room, and a fallback otherwise', () => {
    expect(openerBranches(deal(), [])[2].selectWhen).toContain('safe default');
    const warm = openerBranches(deal({ champion: 'Dana', multi_threaded: true }), [])[2];
    expect(warm.selectWhen).not.toContain('safe default');
  });
});

// ── What actually reaches the model ─────────────────────────────

describe('the prompt carries the computed facts, not just the template', () => {
  const built = buildMeetingPrepPrompt({
    deal: deal({ decision_criteria: 'uptime first', champion: 'Dana Reyes' }),
    marketWatch: [watch()],
    signals: [signal()],
    meetingTypeKey: 'cfo',
    attendees: 'Ana Liu, CFO',
    minutes: 45,
    meetingDate: '2026-09-03',
  });

  it('embeds the skill doctrine verbatim, not a paraphrase', () => {
    // A distinctive line from the middle of the skill file. If the module ever
    // starts summarising, this is what notices.
    expect(built.user).toContain('MEETING PREP — Master Skill');
    expect(built.user).toContain('PERSONA 12: SECURITY DIRECTOR');
    expect(built.user).toContain('Never say "Class I REC-eligible" without the fuel-pathway condition');
  });

  it('prints the allocated clock', () => {
    const box = timeBox(45);
    expect(built.user).toContain('TIME BUDGET — 45 minutes');
    for (const s of box.segments) expect(built.user).toContain(s.label);
  });

  it('splits the walk-out list into what is on record and what is open', () => {
    expect(built.user).toContain('[ON RECORD]');
    expect(built.user).toContain('uptime first');
    expect(built.user).toContain('[OPEN]');
  });

  it('carries the three opener branches with their conditions', () => {
    expect(built.user).toContain('OPTION A');
    expect(built.user).toContain('OPTION C');
    expect(built.user).toContain('SELECT WHEN:');
    expect(built.user).toContain('Oncor files for a 9% distribution increase');
  });

  it('asks for the Signal / Use As / Timing table with dated rows', () => {
    expect(built.user).toContain('| Signal | Use As | Timing |');
    expect(built.user).toContain('2026-08-04');
    expect(built.user).toContain('DATES ARE RECORD DATES');
  });

  it('demands the five fillers', () => {
    expect(built.user).toContain('FILLERS — five');
  });

  it('carries the provenance and return-path rules', () => {
    expect(built.user).toContain('INLINE SOURCE AND DATE');
    expect(built.user).toContain('What this should update');
  });

  it('keeps the two stage axes apart', () => {
    expect(built.user).toContain('Spine stage      : Discovery');
    expect(built.user).toContain('Engineering gate : G0');
  });

  it('names the gap instead of refusing when the meeting is unspecified', () => {
    const thin = buildMeetingPrepPrompt({ deal: deal() });
    expect(thin.user).toContain('no router entry');
    expect(thin.user).toContain('not supplied');
    // No market intel mapped is a finding, not an empty section.
    expect(thin.user).toContain('run market-watch');
    expect(thin.user.length).toBeGreaterThan(5000);
  });

  it('runs on the full methodology, so no degraded header is emitted', () => {
    // The other direction of this is covered in tests/skills.test.ts, where
    // every awaited skill must produce a block that names its own absence.
    expect(meetingPrepDegradedHeader()).toBeUndefined();
  });
});

// ── Reachability ────────────────────────────────────────────────

/**
 * A GENERATOR NOTHING CALLS IS A FEATURE THAT DOES NOT EXIST.
 *
 * This build has shipped that defect three times — the stage field, the
 * `log_win_loss` function, and the PDF route each worked server-side for weeks
 * with no caller. Every one of them passed its own tests. So the path from the
 * panel to the prompt is asserted here, end to end.
 */
describe('the generator is reachable', () => {
  it('is a domain task — Claude or nothing', () => {
    // Output quality IS the product here. A brief downgraded to a cheap model
    // to save a few cents gets carried into a live meeting.
    expect(isDomainTask('meeting-prep')).toBe(true);
    expect(DOMAIN_TASKS).toContain('meeting-prep');
  });

  it('the API route accepts the task and loads the deal for it', async () => {
    const src = await readFile('app/api/ai/route.ts', 'utf8');
    // In the task enum, in the needs-a-deal list, and dispatched.
    expect(src).toContain("'meeting-prep'");
    expect(src).toContain('buildMeetingPrepPrompt');
    expect(src).toContain('meetingPrepDegradedHeader');
  });

  it('the route forwards all four inputs rather than defaulting them', async () => {
    const src = await readFile('app/api/ai/route.ts', 'utf8');
    for (const field of ['meetingTypeKey', 'attendees', 'meetingMinutes', 'meetingDate']) {
      expect(src, `route drops ${field}`).toContain(field);
    }
  });

  it('the deal page mounts the panel and wires it to the stream', async () => {
    const src = await readFile('components/modules/deal-detail.tsx', 'utf8');
    expect(src).toContain('MeetingPrepPanel');
    expect(src).toContain("task: 'meeting-prep'");
  });

  it('the panel sends the length, which is the input that changes the document', async () => {
    const src = await readFile('components/modules/meeting-prep-panel.tsx', 'utf8');
    expect(src).toContain('meetingMinutes');
    // The preview reads the same pure module the prompt does, so what the rep
    // sees before generating is what the brief will say.
    expect(src).toContain('timeBox');
    expect(src).toContain('walkOutChecklist');
  });

  it('the client hook carries the fields the panel sends', async () => {
    const src = await readFile('lib/use-ai-stream.ts', 'utf8');
    for (const field of ['meetingTypeKey', 'attendees', 'meetingMinutes', 'meetingDate']) {
      expect(src, `AiStreamRequest cannot carry ${field}`).toContain(field);
    }
  });
});
