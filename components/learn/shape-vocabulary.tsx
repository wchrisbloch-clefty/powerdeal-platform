import LearnVisual from '@/components/learn/visual';
import { VISUAL_FIXTURES } from '@/lib/learn/visual/fixtures';
import { REQUESTABLE_KINDS } from '@/lib/learn/visual/schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * FOUR SHAPES, AND WHAT HAPPENS WHEN YOU ASK FOR A FIFTH.
 * ═══════════════════════════════════════════════════════════════
 *
 * The visual vocabulary, drawn rather than described. It serves two readers.
 *
 * ══ THE PERSON USING THE TAB ══
 *
 * A model that can draw four things and no more is only useful if you know
 * which four. "Show me the cost stack" gets a parts bar; "walk me from
 * efficiency to fuel cost" gets a chain; "grid versus behind-the-meter" gets a
 * contrast table. Asking for a Sankey gets the fifth panel below — the request
 * named, the reason given, nothing silently dropped.
 *
 * ⚠️ THE SCHEMA STARTS NARROW ON PURPOSE. Four shapes that always render
 * correctly beats twelve where three are unreliable. What is missing is meant
 * to be discovered from use — a request that lands in the fifth panel is the
 * evidence for adding a shape, and it is a better argument than a list drawn up
 * in advance.
 *
 * ══ THE CHECK ══
 *
 * Enforcement point (c) reads COMPUTED fills off the rendered DOM and asserts
 * every one resolves to a value declared in tokens.css. It cannot do that
 * against a page that renders no visuals, and the Learn tab renders none until
 * somebody asks a question — which a headless check never will.
 *
 * ⚠️ SO THIS IS ALSO THE FIXTURE, AND THAT IS DELIBERATE RATHER THAN
 * CONVENIENT. The alternative was a hidden test page nobody reads, which drifts
 * from the real renderer the moment the real renderer changes. This is the real
 * renderer, on the real surface, in the real theme. Every number in it is
 * marked `illus.` in the figure itself, so nothing here can be quoted as a fact
 * about the world.
 */
export default function ShapeVocabulary() {
  return (
    <div>
      <p className="mb-rhythm-block max-w-measure text-sm text-text-dim">
        Ask for a figure and you get one of {REQUESTABLE_KINDS.length} shapes. Ask for
        something else and you get the last panel: the shape you wanted, named, and
        why it is not available. The numbers below are illustrative — they are here
        to show the layout, not to be true.
      </p>
      {VISUAL_FIXTURES.map((v, i) => (
        <LearnVisual key={`${v.kind}-${i}`} visual={v} />
      ))}
    </div>
  );
}
