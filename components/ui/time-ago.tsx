import { relativeTime } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * A TIME THAT DEPENDS ON WHEN YOU LOOK, RENDERED ONCE.
 * ═══════════════════════════════════════════════════════════════
 *
 * `relativeTime` reads the clock. The server reads it at render, the browser
 * reads it again at hydration, and when a timestamp crosses one of
 * `Math.round(diffMs / 60000)`'s boundaries in the gap between the two, the
 * strings differ and React throws #418 — hydration failed, server HTML for that
 * subtree discarded and re-rendered.
 *
 * ⚠️ THE REASON THIS GOT FIXED IS THE CHECK, NOT THE READER. The visible cost
 * is nil: a relative time one minute stale for one frame. The real cost is that
 * `render-check` went red on it roughly one run in four, and an intermittent
 * gate teaches you to re-run until green — which is how a check stops meaning
 * anything. A flaky check is worse for the check than this defect ever was for
 * a reader.
 *
 * ══ WHY suppressHydrationWarning AND NOT A MOUNT SWAP ══
 *
 * The alternative was rendering an absolute date on the server and swapping to
 * relative after mount. That is genuinely correct and it makes twenty feed rows
 * visibly change text one frame after paint, which is a worse thing to look at
 * than the problem.
 *
 * `suppressHydrationWarning` is React's declared mechanism for exactly this
 * case, and what it declares is TRUE: this element's text is expected to differ
 * between server and client, because it is a function of when it was rendered.
 * The client value wins, which is the one the reader should see.
 *
 * ⚠️ IT IS NOT A BLANKET SUPPRESSION AND MUST NEVER BECOME ONE. It applies to
 * one span holding one time. Putting it on a container would suppress the
 * mismatch check for everything inside — including the mismatches that are real
 * bugs — which is the difference between declaring a known-variable value and
 * turning the check off.
 *
 * ⚠️ AND CALLING `relativeTime` DIRECTLY IN JSX IS THE THING THAT COMES BACK.
 * Thirteen call sites had it; the fourteenth would reintroduce the defect on a
 * surface nobody was looking at. tests/hydration.test.ts asserts the raw call
 * does not appear in a component, so the rule is enforced rather than
 * remembered.
 */
export default function TimeAgo({
  value,
  /** Rendered instead when there is no timestamp. Never a fabricated date. */
  fallback = '—',
  className,
}: {
  value?: string | Date | null;
  fallback?: string;
  className?: string;
}) {
  if (!value) return <span className={className}>{fallback}</span>;
  return (
    <span className={className} suppressHydrationWarning>
      {relativeTime(value)}
    </span>
  );
}
