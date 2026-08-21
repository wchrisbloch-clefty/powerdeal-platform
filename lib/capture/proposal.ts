import { fieldFor, type FactType } from './fields';

/**
 * ═══════════════════════════════════════════════════════════════
 * A PROPOSAL IS NOT A WRITE.
 * ═══════════════════════════════════════════════════════════════
 *
 * The model reads a sentence and says which fields it thinks it saw. Nothing
 * here touches a deal. The confirm step is a separate request with a separate
 * route, and that separation is structural rather than a policy: this module
 * has no database client and no way to acquire one.
 *
 * ⚠️ A MISPARSED CHAMPION IS WORSE THAN NO CHAMPION. It scores a point, lifts a
 * health number, and reads exactly like a fact somebody confirmed — which is
 * the seed-rendering-as-real defect with a name in it. So every proposal
 * carries the PHRASE it came from, and the surface shows that phrase beside the
 * field. A reader confirming "Champion: Trevor Reitsma" can see it came from
 * "Trevor Reitsma is the one pushing this internally" rather than from
 * "Trevor Reitsma cc'd me".
 *
 * ══ THE SIGNAL IS ALREADY SAFE BY THE TIME THIS RUNS ══
 *
 * The sentence is written to `intelligence_log` before extraction is attempted.
 * If the model is unavailable, slow, or wrong, the capture still happened —
 * timestamped and deal-linked. Proposals are an enrichment on top of a durable
 * record, never the reason for one.
 *
 * PURE.
 */

export interface Proposal {
  /** A `deals` column from FACT_FIELDS. Never anything else. */
  field: string;
  /** What would be written, as text. Cast on the way in by `apply_fact`. */
  value: string;
  /** The words in the sentence this came from. Verbatim. Rendered. */
  phrase: string;
}

export interface ProposalOutcome {
  proposals: Proposal[];
  /**
   * Why a candidate was refused. Rendered, not swallowed: a proposal that
   * silently vanishes looks like a model that saw nothing, and those two are
   * the states this whole build exists to keep apart.
   */
  refused: { field: string; reason: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * ⚠️ THE VALUE IS CHECKED AGAINST THE COLUMN'S TYPE HERE, NOT AT WRITE TIME.
 *
 * `apply_fact` casts with `::numeric` and `::date`, and a bad cast raises —
 * which would surface as a 500 on confirm, after the reader had already decided
 * to trust it. The refusal belongs at proposal time, where it is information
 * rather than a failure.
 */
function typeProblem(type: FactType, value: string): string | null {
  if (type === 'number') {
    return Number.isFinite(Number(value))
      ? null
      : `"${value}" is not a number, and the column is numeric.`;
  }
  if (type === 'boolean') {
    return ['true', 'false'].includes(value.toLowerCase())
      ? null
      : `"${value}" is not true or false.`;
  }
  if (type === 'date') {
    // ISO only. A model writing "next Q1" has not given a date, and guessing
    // one would be a fabricated deadline on a forcing function.
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? null
      : `"${value}" is not an ISO date (YYYY-MM-DD). A vague deadline is not a date.`;
  }
  return null;
}

/**
 * Turn untrusted model output into proposals, or into an account of why not.
 *
 * Never returns null and never throws. A response that is entirely unusable
 * yields zero proposals and a `refused` entry for each thing it tried, which
 * the surface renders — "it read nothing usable" is a legitimate outcome and
 * has to say so out loud.
 */
export function readProposals(input: unknown): ProposalOutcome {
  const proposals: Proposal[] = [];
  const refused: { field: string; reason: string }[] = [];

  const raw = isRecord(input) && Array.isArray(input.proposals) ? input.proposals : [];
  if (!Array.isArray(raw) || raw.length === 0) {
    return { proposals, refused };
  }

  const seen = new Set<string>();

  for (const item of raw) {
    if (!isRecord(item)) {
      refused.push({ field: '(unnamed)', reason: 'The proposal was not an object.' });
      continue;
    }

    const key = str(item.field) ?? '(unnamed)';
    const spec = fieldFor(key);
    if (!spec) {
      refused.push({
        field: key,
        reason: `"${key}" is not a fact field this platform can write.`,
      });
      continue;
    }

    const value = str(item.value);
    if (!value) {
      refused.push({ field: key, reason: 'No value was proposed.' });
      continue;
    }

    const phrase = str(item.phrase);
    if (!phrase) {
      /*
        ⚠️ NO PHRASE, NO PROPOSAL. The phrase is what makes a confirmation
        checkable rather than an act of trust, and a proposal that cannot say
        where it came from is exactly the kind a reader would wave through.
      */
      refused.push({
        field: key,
        reason: 'No source phrase. A proposal that cannot say where it came from is not confirmable.',
      });
      continue;
    }

    const bad = typeProblem(spec.type, value);
    if (bad) {
      refused.push({ field: key, reason: bad });
      continue;
    }

    if (seen.has(key)) {
      refused.push({
        field: key,
        reason: 'A second proposal for the same field. Only the first is offered.',
      });
      continue;
    }
    seen.add(key);

    proposals.push({ field: key, value, phrase });
  }

  return { proposals, refused };
}
