import { validateVisual } from './visual/validate';
import type { Visual } from './visual/schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * AN ANSWER IS A SEQUENCE OF BLOCKS, NOT A STRING.
 * ═══════════════════════════════════════════════════════════════
 *
 * The Learn tab rendered every answer into one `whitespace-pre-wrap` div. That
 * works exactly until the model has something to show rather than say — and
 * then a visual has nowhere to go but into the prose, as raw JSON, mid-sentence.
 *
 * So the stream carries fenced blocks, and this turns the text into an ordered
 * list of things to render. The order is the model's: a figure appears where it
 * was referenced, not appended to the end where the reader has to scroll back
 * up to find the sentence it belonged to.
 *
 * ══ THE STREAMING PROBLEM, WHICH IS THE WHOLE DIFFICULTY ══
 *
 * This runs on every chunk. Most of the time it is looking at a fence that has
 * opened and not yet closed, holding a JSON object that is halfway written.
 * Three wrong answers are available:
 *
 *   · render the partial JSON as prose — the reader watches `{"kind": "magn`
 *     scroll past, which is what the previous version would have done;
 *   · drop it — the block vanishes and reappears complete, and every visual
 *     flickers into existence out of nowhere;
 *   · try to parse it — a partial object fails, and a failed parse is
 *     indistinguishable here from a model that emitted broken JSON.
 *
 * ⚠️ SO AN UNCLOSED FENCE IS ITS OWN KIND. `arriving` is a state, not an error,
 * and it renders as a quiet placeholder that holds the space. It becomes a
 * visual or a `malformed` when the closing fence lands, and never before —
 * which means "still writing" and "wrote something broken" are never confused.
 *
 * ══ NOTHING IS EVER DROPPED ══
 *
 * A fence that closes over unparseable JSON becomes `malformed` and renders,
 * naming what failed. Same rule as `unrenderable` one layer down: a block that
 * disappears looks exactly like a model choosing not to emit one.
 *
 * PURE. No fetch, no clock, no DOM.
 */

/** The fence tag. Deliberately not `json` — see the mis-tag note below. */
export const VISUAL_FENCE = 'powerdeal-visual';

export type Block =
  | { kind: 'prose'; text: string }
  /** A validated visual, plus whatever the validator had to correct. */
  | { kind: 'visual'; visual: Visual; problems: string[] }
  /** An open fence with no close yet. A state, not a failure. */
  | { kind: 'arriving' }
  | { kind: 'malformed'; raw: string; reason: string };

/**
 * ⚠️ ANY FENCE, NOT ONLY OURS. Scanning for `powerdeal-visual` alone would walk
 * straight past an ordinary ```sql block and find its CLOSING ``` as an
 * opening — every code sample in an answer would swap prose and code from that
 * point on. Fences are matched generically and the tag is read afterwards.
 */
const ANY_OPEN = /(^|\n)```([a-z0-9-]*)[ \t]*\r?\n/i;
const CLOSE = /(^|\n)```[ \t]*(\r?\n|$)/;

function pushProse(blocks: Block[], text: string): void {
  const trimmed = text.replace(/^\s*\n/, '').replace(/\s+$/, '');
  if (trimmed.length > 0) blocks.push({ kind: 'prose', text: trimmed });
}

/**
 * ⚠️ A MIS-TAGGED FENCE IS A FINDING, NOT PROSE.
 *
 * A model asked for `powerdeal-visual` will sometimes write ```json, because
 * that is what a JSON block is called everywhere else it has ever seen one.
 * Left alone, the object renders as a wall of raw JSON inside the answer — and
 * a reader has no way to tell that from a model that meant to show them JSON.
 *
 * So a fenced block of any tag whose body parses to an object carrying a `kind`
 * is reported as the mis-tag it is. It does NOT render as a visual: accepting
 * any JSON object that happens to have a `kind` field would make the fence tag
 * decorative, and the tag is what separates "this is a figure" from "this is a
 * code sample that happens to be JSON".
 */
function misTagged(tag: string, body: string): string | null {
  if (tag.toLowerCase() === VISUAL_FENCE) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!('kind' in parsed)) return null;
  return (
    `This looks like a figure emitted in a \`\`\`${tag || '(untagged)'} fence rather than ` +
    `\`\`\`${VISUAL_FENCE}. The tag is what marks a block as a figure, so this was ` +
    `not rendered as one.`
  );
}

/**
 * Split a (possibly partial) answer into blocks, in the model's order.
 *
 * Safe to call on every streamed chunk: the result for a completed answer is
 * the same whether it was parsed once at the end or a hundred times on the way.
 */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let rest = text;

  for (;;) {
    const open = ANY_OPEN.exec(rest);
    if (!open) {
      pushProse(blocks, rest);
      return blocks;
    }

    const before = rest.slice(0, open.index + open[1].length);
    pushProse(blocks, before);

    const tag = open[2] ?? '';
    const bodyStart = open.index + open[0].length;
    const after = rest.slice(bodyStart);
    const close = CLOSE.exec(after);

    if (!close) {
      /*
        ⚠️ AN UNCLOSED FENCE ENDS THE PARSE, WHATEVER ITS TAG. Everything after
        it is inside a block that is still being written — treating the
        remainder as prose would put a half-finished object on the screen, and
        it is the single most common state this function is ever called in.
      */
      blocks.push({ kind: 'arriving' });
      return blocks;
    }

    const body = after.slice(0, close.index + close[1].length);
    rest = after.slice(close.index + close[0].length);

    if (tag.toLowerCase() !== VISUAL_FENCE) {
      const reason = misTagged(tag, body);
      if (reason) {
        blocks.push({ kind: 'malformed', raw: body, reason });
      } else {
        // An ordinary code fence. Kept verbatim, fence markers and all, so it
        // reads as the code block the model intended.
        pushProse(blocks, `\`\`\`${tag}\n${body}\`\`\``);
      }
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      blocks.push({
        kind: 'malformed',
        raw: body,
        reason: `The figure did not parse as JSON: ${(err as Error).message}`,
      });
      continue;
    }

    const { visual, problems } = validateVisual(parsed);
    blocks.push({ kind: 'visual', visual, problems });
  }
}

/**
 * Does this answer contain anything but prose?
 *
 * Used by the renderer to decide whether the block machinery is worth showing
 * at all — an answer that is one prose block should render exactly as it did
 * before this file existed.
 */
export function hasStructure(blocks: Block[]): boolean {
  return blocks.some((b) => b.kind !== 'prose');
}

/**
 * What the model is told about emitting a figure inline.
 *
 * ⚠️ BUILT FROM `VISUAL_FENCE`, NOT A HAND-WRITTEN COPY OF IT. The parser and
 * the instruction disagreeing about the tag would produce an answer full of
 * unrecognised fences, rendered as prose, with nothing anywhere saying why.
 */
export function blockFormatInstruction(): string {
  return [
    'ANSWER IN PROSE. When a figure would carry the point better than a',
    'sentence, emit it inline AT THE POINT IT BELONGS — not collected at the',
    'end — inside a fenced block tagged exactly:',
    '',
    `    \`\`\`${VISUAL_FENCE}`,
    '    { … }',
    '    ```',
    '',
    'The tag must be exactly that. A figure in a ```json fence is not rendered',
    'as a figure.',
    '',
    'Introduce the figure in the sentence before it, so the prose still reads',
    'if the figure is not drawn. Never write "as shown below" and then emit',
    'nothing.',
    '',
    'Most answers need no figure at all. One is common; three is almost always',
    'decoration.',
  ].join('\n');
}
