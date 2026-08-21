/**
 * ═══════════════════════════════════════════════════════════════
 * THE FACTS A SENTENCE CAN BECOME.
 * ═══════════════════════════════════════════════════════════════
 *
 * One registry, read by four things that would otherwise drift:
 *
 *   · the extraction prompt, which lists what may be proposed
 *   · the validator, which refuses anything not here
 *   · the confirm route, which passes the key to `apply_fact`
 *   · the UI, which shows what a proposal would move
 *
 * ⚠️ AND IT MUST AGREE WITH `deal_audited_fields()` IN THE DATABASE.
 * `apply_fact` whitelists against the SQL list; a key here that is missing
 * there is a proposal the reader can confirm and that then raises. Asserted in
 * tests/capture.test.ts by parsing the migration, not by trusting this comment.
 *
 * ══ `moves` IS NOT DECORATION ══
 *
 * A reader confirming a fact should know what it changes. "Champion" moving
 * health by a point is the difference between a note and a score change, and
 * the platform has spent this whole build making that kind of thing visible
 * rather than inferable.
 *
 * The strings are derived from `compute_health_score` in supabase/schema.sql
 * and from the MEDDPICC scoring in lib/meddpicc.ts. They are the one thing here
 * that can go stale silently, so they say what they are.
 *
 * PURE. No fetch, no db, no DOM.
 */

export type FactType = 'text' | 'date' | 'number' | 'boolean';

export interface FactField {
  /** The `deals` column. Must exist in `deal_audited_fields()`. */
  key: string;
  /** What a person calls it. */
  label: string;
  type: FactType;
  /** What confirming this changes, in one line. Rendered next to the proposal. */
  moves: string;
  /** How the model is told to recognise it. One line, no examples of values. */
  recognise: string;
}

export const FACT_FIELDS: FactField[] = [
  {
    key: 'champion',
    label: 'Champion',
    type: 'text',
    moves: '+1.0 health, and one MEDDPICC point',
    recognise: 'the named person inside the account who advocates for this',
  },
  {
    key: 'economic_buyer',
    label: 'Economic buyer',
    type: 'text',
    moves: '+1.5 health — the largest single term — and one MEDDPICC point',
    recognise: 'the named person who can actually approve the spend',
  },
  {
    key: 'identified_pain',
    label: 'Identified pain',
    type: 'text',
    moves: 'one MEDDPICC point',
    recognise: 'what is costing them today, in their terms',
  },
  {
    key: 'decision_criteria',
    label: 'Decision criteria',
    type: 'text',
    moves: 'one MEDDPICC point',
    recognise: 'what they will judge the options on',
  },
  {
    key: 'decision_process',
    label: 'Decision process',
    type: 'text',
    moves: 'one MEDDPICC point',
    recognise: 'the paper path — who recommends, who signs, what the gate is',
  },
  {
    key: 'metrics_known',
    label: 'Metrics known',
    type: 'boolean',
    moves: 'one MEDDPICC point',
    recognise: 'true ONLY when a specific number they are measured on is stated',
  },
  {
    key: 'competition',
    label: 'Competition',
    type: 'text',
    moves: 'one MEDDPICC point',
    recognise: 'who else is being considered, named',
  },
  {
    key: 'critical_event',
    label: 'Critical event',
    type: 'text',
    moves: 'lifts the health cap at 6 — often the largest single change',
    recognise: 'the forcing function with a deadline: budget cycle, program date, expiring contract, regulatory decision',
  },
  {
    key: 'critical_event_date',
    label: 'Critical event date',
    type: 'date',
    moves: 'nothing on its own; it dates the forcing function',
    recognise: 'the date the forcing function bites, ONLY if stated',
  },
  {
    key: 'multi_threaded',
    label: 'Multi-threaded',
    type: 'boolean',
    moves: '+2.0 health and lifts the other cap at 6',
    recognise: 'true ONLY when a real second relationship is described, not a second name on an email',
  },
  {
    key: 'decision_mapped',
    label: 'Decision mapped',
    type: 'boolean',
    moves: '+1.5 health',
    recognise: 'true when the full approval chain is known end to end',
  },
  {
    key: 'beachhead_site',
    label: 'Beachhead site',
    type: 'text',
    moves: 'nothing scored; it is where the first system goes',
    recognise: 'the specific named site or plant, not the city',
  },
  {
    key: 'beachhead_utility',
    label: 'Beachhead utility',
    type: 'text',
    moves: 'nothing scored, but it WINS over the account utility in the economics',
    recognise: 'the utility serving the beachhead site',
  },
  {
    key: 'size_mw',
    label: 'Size (MW)',
    type: 'number',
    moves: 'nothing scored; it drives every economic model on the deal',
    recognise: 'the load in MW — only if stated, never inferred from headcount or square footage',
  },
  {
    key: 'size_usd_m',
    label: 'Deal value ($M)',
    type: 'number',
    moves: 'nothing scored; it is what the pipeline totals',
    recognise: 'the deal value in millions of dollars, only if stated',
  },
  {
    key: 'value_prop',
    label: 'Value prop',
    type: 'text',
    moves: 'nothing scored; it selects which argument the generators lead with',
    recognise: 'which fight this is: grid, combustion, or integrator',
  },
];

export const FACT_KEYS = FACT_FIELDS.map((f) => f.key);

export function fieldFor(key: string): FactField | null {
  return FACT_FIELDS.find((f) => f.key === key) ?? null;
}
