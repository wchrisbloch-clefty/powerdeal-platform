/**
 * AUDIENCE-SCOPED ANNOTATIONS
 *
 * Every artifact this platform produces has two readers with different rights
 * to the same page.
 *
 *   INTERNAL — the operator. Data-quality problems, gaps in our own record,
 *              things we need to go fix. "This milestone is marked complete on
 *              a future date" is an admission that our record is wrong.
 *
 *   EXTERNAL — whoever the artifact is handed to. A champion carrying a MAP
 *              into a room, a finance reader receiving a business case. They
 *              need schedule facts they must act on. They do not need, and
 *              should not receive, evidence that we keep sloppy records.
 *
 * ── THE RULE, and why it is a filter rather than a per-flag decision ──
 *
 * Outward-facing rendering is DENY BY DEFAULT. forAudience(items, 'external')
 * passes only what is explicitly marked external; everything else is withheld.
 *
 * That direction matters. The alternative — tagging the sensitive ones and
 * letting the rest through — fails open: the next person to add a warning gets
 * it into a customer document by forgetting a field, and nobody notices until a
 * champion reads "2 milestones marked complete on a future date" in a document
 * they are circulating to their CFO. Under this filter, forgetting means the
 * annotation stays in the app, which is the harmless failure.
 *
 * So: adding a new flag requires a deliberate act to make it customer-visible.
 * That is the general rule; individual flags do not each get re-litigated.
 */

export type Audience = 'internal' | 'external';

export type Severity = 'info' | 'warn' | 'error';

export interface Annotation {
  id: string;
  audience: Audience;
  severity: Severity;
  /** Short label. Rendered bold in the app, inline in a document. */
  title: string;
  /** The sentence explaining it, and where possible what to do about it. */
  detail: string;
  /**
   * Set on an INTERNAL annotation whose underlying anomaly is still legible in
   * the exported artifact even though its message is withheld.
   *
   * Deny-by-default sanitizes MESSAGES, not the DATA those messages describe.
   * A MAP row reading `done` on a future date, with a dependent scheduled
   * before its predecessor completes, is visible to any reader who looks at the
   * table — the filter removed our commentary on it, not the contradiction
   * itself. Withholding the sentence and shipping the data is arguably worse
   * than shipping both: the reader finds it unaided and we look like we did not
   * notice.
   *
   * So these produce a notice at the point of export. Warn, never block, and
   * never auto-correct: the code can detect that a date and a status disagree
   * but cannot know which one is the typo. Resolution is the operator's.
   */
  legibleInExport?: boolean;
}

/** Operator-only. Never leaves the application. */
export function internal(
  id: string,
  severity: Severity,
  title: string,
  detail: string,
  opts: { legibleInExport?: boolean } = {},
): Annotation {
  return { id, audience: 'internal', severity, title, detail, ...opts };
}

/**
 * Safe to hand to the reader of the artifact.
 *
 * Use this only for facts the recipient needs in order to act. If the sentence
 * is about the state of OUR record rather than the state of THEIR project, it
 * is internal.
 */
export function external(
  id: string,
  severity: Severity,
  title: string,
  detail: string,
): Annotation {
  return { id, audience: 'external', severity, title, detail };
}

/**
 * Filter to what a given audience may see.
 *
 * 'internal' sees everything — the operator is looking at their own record and
 * withholding from them serves nobody. 'external' sees only what was explicitly
 * marked for it.
 */
export function forAudience(items: Annotation[], audience: Audience): Annotation[] {
  return audience === 'internal' ? items : items.filter((a) => a.audience === 'external');
}

/** Annotations withheld from a given audience — for the "not in the export" hint. */
export function withheldFrom(items: Annotation[], audience: Audience): Annotation[] {
  return audience === 'internal' ? [] : items.filter((a) => a.audience !== 'external');
}

/**
 * Internal annotations whose anomaly survives into the exported artifact.
 *
 * Rendered as a pre-export notice. Non-blocking by design — the operator may
 * have a reason to send it anyway, and a hard gate on a document someone needs
 * in ten minutes gets worked around rather than obeyed.
 */
export function exportWarnings(items: Annotation[]): Annotation[] {
  return items.filter((a) => a.audience === 'internal' && a.legibleInExport === true);
}
