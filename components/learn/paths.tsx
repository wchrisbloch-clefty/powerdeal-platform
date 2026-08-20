'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GapPanel } from '@/components/ui/gap';
import type { ResolvedPath } from '@/lib/learn/paths-resolve';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * PATHS. CLICK A STEP, IT GOES IN THE BOX.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ THE ONLY STATE HERE IS WHICH PATH IS OPEN. There is no record of what has
 * been asked, and there deliberately never will be — a tick beside step two is
 * a mastery rating with the number removed, and the standing rule on this
 * surface is that there are none.
 *
 * A consequence worth naming: reopening this after asking every question in a
 * path shows exactly what it showed before. That is not an oversight. The
 * alternative is a surface that keeps score, and the one thing this tab has to
 * survive is somebody opening it to work on the argument they are worst at.
 *
 * ⚠️ CLICKING A STEP DOES NOT ASK IT. The question lands in the box and the
 * reader sends it — or edits it first, which is the common case, because the
 * useful version is usually the one bent towards the deal in front of them. A
 * step that fired straight into the model would make the path a menu of
 * canned answers rather than a set of starting points.
 */
export default function LearnPaths({
  paths,
  onPick,
}: {
  paths: ResolvedPath[];
  onPick: (ask: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (paths.length === 0) {
    return (
      <GapPanel
        kind="blocked"
        subject="the learning paths"
        reason="No paths are declared. LEARN_PATHS in lib/learn/paths.ts is empty."
      />
    );
  }

  return (
    <ul className="space-y-1.5">
      {paths.map(({ path, available, reason }) => {
        const isOpen = open === path.id;
        return (
          <li key={path.id} className="rounded-card border border-rule bg-bg-raised">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : path.id)}
              aria-expanded={isOpen}
              className="flex min-h-tap w-full items-start gap-2 px-3 py-2 text-left lg:min-h-0"
            >
              <ChevronDown
                size={14}
                aria-hidden
                className={cn(
                  'mt-0.5 shrink-0 text-text-faint transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
              <span className="min-w-0">
                <span className="block text-2xs text-text">{path.title}</span>
                <span className="mt-0.5 block max-w-measure text-2xs text-text-faint">
                  {path.outcome}
                </span>
              </span>
            </button>

            {isOpen ? (
              <div className="border-t border-rule-faint px-3 py-2">
                {available ? (
                  <ol className="space-y-2">
                    {path.steps.map((s, i) => (
                      <li key={s.ask} className="flex gap-2">
                        {/* ⚠️ A NUMBER, NOT A STATUS. It says where the step sits
                            in the order and nothing about whether it was done. */}
                        <span
                          aria-hidden
                          className="mt-px font-mono text-2xs tabular-nums text-text-faint"
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onPick(s.ask)}
                            className="flex min-h-tap items-center text-left text-2xs text-text-dim underline decoration-rule underline-offset-2 hover:text-text lg:min-h-0"
                          >
                            {s.ask}
                          </button>
                          <p className="max-w-measure text-2xs text-text-faint">
                            {s.because}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  /* The questions are NOT shown. See paths-resolve.ts: an
                     ungrounded answer is indistinguishable from a grounded one
                     at the point of reading, which is the whole problem. */
                  <GapPanel
                    kind="blocked"
                    subject={`this path`}
                    reason={`Its questions come out of ${path.source}, which is not available. ${reason ?? ''}`}
                    className="px-0 py-1"
                  />
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
