import { AlertTriangle } from 'lucide-react';
import LearnVisual from '@/components/learn/visual';
import { parseBlocks, type Block } from '@/lib/learn/blocks';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE ANSWER, IN THE ORDER IT WAS WRITTEN.
 * ═══════════════════════════════════════════════════════════════
 *
 * Blocks render in sequence. A figure sits where the model put it, between the
 * sentence that introduces it and the sentence that follows from it, because a
 * figure collected at the bottom of an answer costs the reader a scroll back up
 * to find what it was about.
 *
 * ⚠️ EVERY BLOCK KIND RENDERS SOMETHING. There is no branch here that returns
 * null. `arriving` holds the space while a fence is still being written,
 * `malformed` says what failed — and the reason a visual is drawn at all when
 * the validator rejected it is one layer down, in `unrenderable`.
 *
 * ══ THE VALIDATOR'S CORRECTIONS ARE SHOWN ══
 *
 * `problems` is what the validator had to fix or fill to render the figure at
 * all — an empty takeaway, a missing axis label, a provenance block that was
 * not there. Those are SILENT CORRECTIONS otherwise, and a silently corrected
 * figure renders with exactly the confidence of one that arrived complete. They
 * are set below the figure, small, and only when there are any.
 */
export default function LearnAnswer({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-rhythm-block">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'prose') {
    return <p className="whitespace-pre-wrap text-read text-text-dim">{block.text}</p>;
  }

  if (block.kind === 'visual') {
    return (
      <div>
        <LearnVisual visual={block.visual} />
        {block.problems.length > 0 ? (
          <ul className="-mt-rhythm-tight max-w-measure space-y-0.5 text-2xs text-text-faint">
            {block.problems.map((p, i) => (
              <li key={i}>
                <span className="font-mono uppercase tracking-label text-warning">Filled in</span>{' '}
                {p}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'arriving') {
    /*
      ⚠️ A PLACEHOLDER, NOT A SPINNER ON THE WHOLE ANSWER. The prose above it
      has already arrived and is readable; only the figure is still being
      written. Blanking the answer for it would be the same mistake as blanking
      an answer because its session write failed.
    */
    return (
      <p
        role="status"
        className="rounded-card border border-dotted border-gap-rule px-3 py-2 text-2xs text-text-faint"
      >
        A figure is still arriving.
      </p>
    );
  }

  return (
    <div className="rounded-card border border-warning/40 bg-warning/5 px-3 py-2">
      <p className="flex items-start gap-2 text-2xs text-text-dim">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <span className="max-w-measure">{block.reason}</span>
      </p>
      {/* ⚠️ THE RAW BLOCK IS KEPT. It is the only evidence of what the model
          actually produced, and without it "the figure did not parse" is a
          claim the reader cannot check. Truncated, because an answer should not
          become a log. */}
      <pre className="scrollbar-thin mt-1.5 max-h-32 overflow-auto font-mono text-2xs text-text-faint">
        {block.raw.slice(0, 600)}
        {block.raw.length > 600 ? '\n…' : ''}
      </pre>
    </div>
  );
}
