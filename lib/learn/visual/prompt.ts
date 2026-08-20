import { MAX_SERIES, REQUESTABLE_KINDS } from './schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * ENFORCEMENT POINT (a): THE INSTRUCTION NEVER SHOWS A COLOUR.
 * ═══════════════════════════════════════════════════════════════
 *
 * The weakest of the three, and worth having anyway. A model that has never
 * seen a hex in its instruction is less likely to invent one; a model shown an
 * example containing `#3CAD3A` will produce hexes, because examples are the
 * strongest instruction there is.
 *
 * ⚠️ THIS REDUCES INCIDENCE. IT DOES NOT ENFORCE. The guarantee lives in (b),
 * where no field accepts a colour, and is verified by (c), which reads the
 * rendered artifact. Treating this as the control would be exactly the mistake
 * of a policy without a mechanism.
 *
 * ══ THE SCHEMA IS DESCRIBED, NOT PASTED ══
 *
 * Built from the same constants the validator enforces, so the instruction and
 * the check cannot disagree about how many series exist or which kinds are
 * requestable. A hand-written copy of the schema in a prompt string is the
 * second-copy pattern that has failed on the tokens/Tailwind pair, the TS/SQL
 * seed pair, and a design constant against its own fixture.
 */
export function visualInstruction(): string {
  return [
    'WHEN A VISUAL WOULD HELP, EMIT ONE AS JSON. Never as markup, never as SVG.',
    '',
    `Four shapes exist: ${REQUESTABLE_KINDS.join(', ')}.`,
    '',
    '  magnitude  one number per label, compared against each other.',
    '  parts      components of a single whole. Do NOT state the total; it is computed.',
    '  chain      ordered steps where each feeds the next. Two steps minimum.',
    '  contrast   two named columns compared row by row.',
    '',
    'If the concept needs a shape that is not one of these, say so: emit',
    '{"kind": "<the shape you wanted>"} with a title and takeaway, and it will',
    'render as a stated gap naming what was missing. Do NOT force the concept',
    'into a shape that distorts it, and do NOT silently skip the visual — a',
    'missing visual is indistinguishable from having nothing to say.',
    '',
    'COLOUR IS NOT YOURS TO CHOOSE. Every data point carries `series`, an',
    `integer from 0 to ${MAX_SERIES - 1}. The renderer maps it to the platform`,
    'palette. There is no field for a colour and no colour may appear in any',
    'text you write — not in a label, a title, or a takeaway.',
    '',
    'EVERY NUMBER STATES ITS BASIS. `basis.source` names where it came from in',
    'one line; `basis.kind` is one of:',
    '',
    '  sourced       a published figure you can name',
    '  derived       computed from sourced figures',
    '  illustrative  chosen to make the teaching point',
    '',
    'An illustrative number is marked in the rendered figure and must never be',
    'phrased as a fact about the world.',
    '',
    'PROVENANCE IS REQUIRED. `provenance.bases` lists every distinct basis.',
    '`provenance.unfilled` names anything the visual needed and did not have —',
    'an empty list is a claim that nothing was missing, so only send one when',
    'that is true.',
  ].join('\n');
}
