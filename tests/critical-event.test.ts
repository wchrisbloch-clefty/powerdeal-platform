import { describe, expect, it } from 'vitest';
import { computeHealthScore, hasCriticalEvent, riskFlags } from '@/lib/deals';
import { mapToMarkdown } from '@/lib/map/export';
import { starterPlan } from '@/lib/map/schedule';
import type { Deal } from '@/lib/types';

/**
 * CRITICAL EVENT — the forcing function, and its absence.
 *
 * The trap this file is built to avoid: asserting the cap only against deals
 * that are ALREADY capped for another reason. A single-threaded deal is capped
 * at 6 regardless, so testing the critical-event cap on one proves nothing —
 * the same shape as proving forAudience() blocked internal without ever proving
 * it passed external, and as a luminance check that classified green as a dark
 * neutral. The fixture below is therefore perfect on every other axis, so the
 * ONLY thing that can hold it down is the missing event.
 */

/**
 * A deal that would score 10 if the critical event were present. Multi-threaded,
 * full MEDDPICC, named economic buyer, fresh in stage, decision mapped,
 * champion known.
 */
function perfectExceptEvent(): Deal {
  return {
    id: 'test-1',
    deal_id: 'OG-019',
    company: 'Williams',
    vertical: 'O&G-Mid',
    relationship_type: 'Direct',
    geo_tier: 'Secondary',
    state: 'OK',
    utility: 'multi',
    value_prop: 'Both',
    beachhead_site: null,
    beachhead_utility: null,
    stage: 'Solution Design',
    size_mw: 12,
    size_usd_m: null,
    meddpicc_score: 8,
    health_score: 10,
    multi_threaded: true,
    decision_mapped: true,
    days_in_stage: 5,
    next_move: null,
    next_move_date: null,
    key_risk: null,
    critical_event: null,
    critical_event_date: null,
    metrics_known: true,
    economic_buyer: 'D. Prewitt',
    decision_criteria: 'Cost and reliability',
    decision_process: 'Committee, Q3',
    identified_pain: 'Compression reliability',
    champion: 'R. Okafor',
    competition: 'Grid, recip',
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
  };
}

describe('the cap is real and is isolated', () => {
  it('holds an otherwise-perfect deal at 6', () => {
    // If this ever returns > 6, the cap is not applied. If it returns <= 6 for
    // a reason OTHER than the event, the next test catches that.
    expect(computeHealthScore(perfectExceptEvent())).toBe(6);
  });

  it('releases to 10 when a critical event is set, nothing else changed', () => {
    // This is the assertion that isolates the cause. Same deal, one field.
    const withEvent = { ...perfectExceptEvent(), critical_event: 'FID gate, Q4 budget' };
    expect(computeHealthScore(withEvent)).toBe(10);
  });

  it('does not require a date to release the cap', () => {
    // Requiring both would push people to invent a date to clear the cap,
    // which turns a diagnostic field into a formality.
    const noDate = { ...perfectExceptEvent(), critical_event: 'Expiring supply contract' };
    expect(noDate.critical_event_date).toBeNull();
    expect(computeHealthScore(noDate)).toBe(10);
  });

  it('does not penalise twice — missing both caps still lands at 6', () => {
    const both = { ...perfectExceptEvent(), multi_threaded: false };
    expect(computeHealthScore(both)).toBe(6);
  });

  it('treats whitespace as absent', () => {
    const blank = { ...perfectExceptEvent(), critical_event: '   ' };
    expect(hasCriticalEvent(blank)).toBe(false);
    expect(computeHealthScore(blank)).toBe(6);
  });
});

describe('risk flag', () => {
  it('raises no-critical-event, at danger when the deal otherwise looks healthy', () => {
    const flag = riskFlags(perfectExceptEvent()).find((f) => f.key === 'no-critical-event');
    expect(flag).toBeDefined();
    // The dangerous case is the deal that scores well and has no reason to
    // close — same reasoning as the single-thread flag.
    expect(flag!.severity).toBe('danger');
  });

  it('clears once an event is set', () => {
    const ok = { ...perfectExceptEvent(), critical_event: 'Program deadline' };
    expect(riskFlags(ok).some((f) => f.key === 'no-critical-event')).toBe(false);
  });

  it('stays quiet on terminal deals', () => {
    const won = { ...perfectExceptEvent(), stage: 'Closed-Won' };
    expect(riskFlags(won).some((f) => f.key === 'no-critical-event')).toBe(false);
  });
});

describe('the MAP states absence rather than omitting it', () => {
  const plan = starterPlan();
  const base = { company: 'Williams', dealId: 'OG-019', today: '2026-08-10' };

  it('renders the section even with no critical event', () => {
    // The failure this guards against is a MAP that simply has fewer sections
    // when the field is empty — a tidy plan with no visible reason it has to
    // happen on these dates.
    const md = mapToMarkdown(plan, base);
    expect(md).toContain('Why these dates');
    expect(md).toContain('No critical event on record');
  });

  it('says plainly that the dates are a sequence, not a deadline', () => {
    const md = mapToMarkdown(plan, base);
    expect(md).toContain('a sequence, not a deadline');
  });

  it('names the event and its date when both are present', () => {
    const md = mapToMarkdown(plan, {
      ...base,
      criticalEvent: 'Compressor overhaul window closes',
      criticalEventDate: '2027-03-01',
    });
    expect(md).toContain('Compressor overhaul window closes');
    expect(md).toContain('Lands 2027-03-01');
    expect(md).not.toContain('No critical event on record');
  });

  it('names the event and flags the missing date when only the event is known', () => {
    const md = mapToMarkdown(plan, { ...base, criticalEvent: 'Budget cycle' });
    expect(md).toContain('Budget cycle');
    expect(md).toContain('No date on record for it yet');
    expect(md).not.toContain('No critical event on record');
  });

  it('treats a whitespace-only event as absent in the document too', () => {
    const md = mapToMarkdown(plan, { ...base, criticalEvent: '  ' });
    expect(md).toContain('No critical event on record');
  });
});

describe('the migration and the TypeScript scorer agree', () => {
  /**
   * computeHealthScore() in lib/deals.ts mirrors compute_health_score() in SQL.
   * They are two implementations of one rule and drift silently — the stored
   * value would simply stop matching what the UI computes, with nothing raising
   * a hand. This reads the SQL and checks the cap clause is present in both.
   */
  it('the SQL function caps on critical_event', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const path of ['supabase/schema.sql', 'supabase/migrations/20260810_critical_event.sql']) {
      const sql = await readFile(path, 'utf8');
      expect(sql, `${path} must cap on critical_event`).toMatch(
        /if d\.critical_event is null or d\.critical_event = ''/,
      );
      expect(sql, `${path} must apply a ceiling of 6`).toContain('least(6, score)');
    }
  });

  it('the migration is idempotent on every statement that creates something', async () => {
    const { readFile } = await import('node:fs/promises');
    const sql = await readFile('supabase/migrations/20260810_critical_event.sql', 'utf8');
    // Re-running has to be safe, because this project has a proven record of
    // migrations registering without running — "run it again to be sure" must
    // not be a risky instruction.
    const adds = sql.match(/alter table deals add column/g) ?? [];
    const guarded = sql.match(/alter table deals add column if not exists/g) ?? [];
    expect(adds).toHaveLength(guarded.length);
    expect(sql).toContain('create or replace function compute_health_score');
  });

  it('the extension assertion moved to the file that needs it', async () => {
    /**
     * ⚠️ THIS ASSERTION USED TO PIN THE GUARD INTO schema.sql, and the pin was
     * the problem. It read:
     *
     *   expect(sql).toContain('Required extension(s) not installed')
     *
     * against supabase/schema.sql — which is where the `raise exception` sat,
     * at line 54, above every table, function and trigger that file declares.
     * On an instance without pg_cron the file aborted there, so re-running it
     * applied nothing, including eight later commits' worth of schema. The
     * live database ended up with ONE of the three triggers it declares, and
     * the missing one is why twenty-one stored health scores were fiction.
     *
     * schema.sql needs neither extension. supabase/functions/schedule.sql
     * cannot work without them — a schedule registered without pg_cron reports
     * `active = t` and can never fire, which is the failure worth refusing.
     * A precondition belongs in the file whose work depends on it.
     *
     * So the assertion moved with the guard rather than being deleted: the
     * check still has to exist, in the right place, and this is what says so.
     */
    const { readFile } = await import('node:fs/promises');

    const schedule = await readFile('supabase/functions/schedule.sql', 'utf8');
    expect(schedule).toContain('Required extension(s) not installed');
    expect(schedule).toMatch(/from pg_extension where extname = e/);
    expect(schedule).toContain('raise exception');

    // And schema.sql still LOOKS, so a fresh instance learns — it just does not
    // abort, because nothing below line 54 depends on the answer.
    const schema = await readFile('supabase/schema.sql', 'utf8');
    expect(schema).toMatch(/from pg_extension where extname = e/);
    const guard = /unnest\(array\['pg_cron', 'pg_net'\]\)[\s\S]*?end \$\$;/.exec(schema)![0];
    expect(guard).toContain('raise notice');
    expect(guard).not.toContain('raise exception');
  });
});
