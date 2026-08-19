/**
 * ═══════════════════════════════════════════════════════════════
 * TOKENS WHOSE CASE IS PART OF THEIR MEANING.
 * ═══════════════════════════════════════════════════════════════
 *
 * `Needs ${labels.join(', ').toLowerCase()}` rendered
 *
 *   Needs efficiency, capex $/kw, o&m $/kw-yr.
 *
 * kW is a kilowatt. kw is nothing. O&M lowercased stops being an abbreviation
 * and starts being a typo. The lowercasing bought one comma's worth of grammar
 * after the word "Needs" and cost the units their meaning, on the single line
 * whose job is telling the reader which figure to go and find.
 *
 * ══ WHY THIS IS A VOCABULARY AND NOT A ONE-LINE FIX ══
 *
 * The one-line fix shipped, and it protects exactly one call site. Every check
 * on that panel had passed while the sentence was wrong, because no check was
 * reading the sentence — and there is nothing special about that panel. Any
 * `.toLowerCase()`, and any `text-transform` in CSS, can do the same thing to
 * any string.
 *
 * So the tokens are declared once here and asserted twice:
 *
 *   · tests/copy-casing.test.ts scans source for the transforms.
 *   · scripts/render-check.mjs reads the RENDERED text on every surface, after
 *     CSS text-transform has been applied. That is the one that would have
 *     caught the original, because the original was a rendered string that no
 *     source assertion was looking at.
 *
 * ⚠️ ONLY THE LOWERCASING DIRECTION IS A DEFECT. Uppercasing "kW" gives "KW",
 * which is ugly in prose and correct in a small-caps label — and the label
 * style (`.eyebrow`) uppercases deliberately, everywhere. Flagging that would
 * put a finding on every eyebrow in the app and the check would be turned off
 * within a day. Lowercasing is the direction that destroys information, so it
 * is the direction this asserts.
 */

/**
 * Each entry is the CORRECT form. The check looks for the all-lowercase
 * version of anything here appearing as a standalone token in rendered copy.
 *
 * Kept to units and abbreviations this product actually prints. A long list of
 * plausible-looking tokens would be a list of hypotheticals, and hypotheticals
 * are what make a check noisy enough to ignore.
 */
export const CASE_BEARING = [
  // Power and energy units — the ones that appear in every generated document.
  'kW',
  'kWh',
  'MW',
  'MWh',
  'MMBtu',
  'Btu',
  'CO2',
  // Money-per-unit forms, which is where the original defect landed.
  '$/kW',
  '$/kWh',
  '$/kW-yr',
  '$/MWh',
  '¢/kWh',
  // Domain abbreviations.
  'O&M',
  'LCOE',
  'MEDDPICC',
  'SOFC',
  'BTM',
  'CCUS',
  'NGL',
  'PPA',
  'REC',
  'RFP',
  'ISO',
  'RTO',
  'ESG',
  'EPA',
  'CPUC',
  'ERCOT',
  // ⚠️ ADDED AFTER THE CHECK CAUGHT A REAL ONE. `job.schedule.toLowerCase()`
  // in lib/agent-runs turned "Daily · 12:00 UTC" into "12:00 utc" — in the
  // same commit that added the line. A timezone lowercased is not a timezone,
  // and this token was missing from the list on the first pass, which is worth
  // recording: the vocabulary is only as good as what it has been taught.
  'UTC',
  'CT',
] as const;

/**
 * Words that legitimately appear lowercase in ordinary English and would
 * otherwise fire constantly.
 *
 * ⚠️ EVERY ENTRY IS A HOLE, so each needs to be a word a reader would write in
 * lower case on purpose. "rec" is a real English fragment; "meddpicc" is not.
 */
const LEGITIMATELY_LOWERCASE = new Set([
  'rec', 'iso', 'rto', 'btu',
  // "ct" appears inside ordinary prose far too often to be a signal.
  'ct',
]);

/** The lowercase forms worth searching for. */
export const MANGLED_FORMS: string[] = [
  ...new Set(
    CASE_BEARING.map((t) => t.toLowerCase()).filter((t) => !LEGITIMATELY_LOWERCASE.has(t)),
  ),
];

/**
 * Find case-mangled tokens in a rendered string.
 *
 * Word-boundary matched on both sides, because `mw` inside a word is not the
 * unit — the same lesson as `m.includes('iat')` matching "associated". The
 * boundary here has to treat `$`, `¢`, `/` and `&` as part of the token rather
 * than as separators, which `\b` does not, so the boundary is written out.
 */
export function mangledTokens(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const form of MANGLED_FORMS) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(form, from);
      if (at === -1) break;
      from = at + form.length;
      const before = lower[at - 1];
      const after = lower[at + form.length];
      const isWordish = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);
      // A token preceded or followed by more word characters is part of a
      // longer word: "somw" and "mwh" are not a mangled "mw".
      if (isWordish(before) || isWordish(after)) continue;
      // The correctly-cased form is not a finding.
      if (text.slice(at, at + form.length) !== form) continue;

      /*
        ⚠️ URLS AND IDENTIFIERS ARE SUPPOSED TO BE LOWER CASE. The first
        rendered run flagged six findings and all six were `epa.gov/uic` and
        `ccus-sweep` — a domain and an edge-function name, both correct as
        written. A token joined to more text by . - _ / or @ is part of a
        longer name.

        UNLESS it starts with a currency mark: `$/kw-yr` is hyphenated and is
        a unit rather than an identifier, and it is the exact string that
        shipped.
      */
      const joiner = (c: string | undefined) => c !== undefined && /[.\-_/@]/.test(c);
      if (!/^[$¢]/.test(form)) {
        if (joiner(before) && isWordish(lower[at - 2])) continue;
        if (joiner(after) && isWordish(lower[at + form.length + 1])) continue;
      }
      found.push(form);
      break;
    }
  }
  return found;
}
