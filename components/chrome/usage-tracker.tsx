'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Lightbulb, Check, X } from 'lucide-react';
import { surfaceKey } from '@/lib/surfaces';
import { cn } from '@/lib/utils';

/**
 * USAGE CAPTURE FOR THE WEEK — timing, and the wish box.
 *
 * Two things recollection cannot produce:
 *
 *   · WHICH SURFACES ACTUALLY GET OPENED. Memory keeps what was interesting,
 *     not what was reached for. It also cannot see absence at all — nobody
 *     remembers not opening the Maps tab, and that is the finding.
 *
 *   · THE THOUGHT AT THE MOMENT OF FRICTION. "I wish it just…" is a complete
 *     sentence for about ninety seconds and then decays into "the pipeline
 *     view is fine, I guess". The box is one keystroke away on every surface
 *     and records where it was written from, because a wish is about somewhere.
 *
 * ══ IT MUST NOT COST THE OPERATOR ANYTHING ══
 *
 * Dwell is flushed with `navigator.sendBeacon` on hide and on navigation, so
 * nothing blocks a route change and nothing is lost when the tab is closed.
 * Every failure is swallowed at the boundary: instrumentation that can
 * interrupt the work it measures is worse than no instrumentation.
 *
 * The wish box is the ONE exception, and deliberately: it uses a real fetch
 * and reports whether the write landed. A thought typed and silently dropped
 * is worse than no box at all, and this build has enough silent writes.
 */

function beacon(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/usage', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/usage', { method: 'POST', body, keepalive: true });
  } catch {
    // Deliberately empty. Nothing the operator is doing depends on this.
  }
}

export default function UsageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = surfaceKey(pathname, searchParams.toString());

  const enteredAt = useRef<number>(Date.now());
  const currentKey = useRef<string>(key);
  const flushed = useRef(false);

  useEffect(() => {
    // A surface change flushes the previous one and starts the clock again.
    if (currentKey.current !== key) {
      beacon({ kind: 'visit', path: currentKey.current, ms: Date.now() - enteredAt.current });
      currentKey.current = key;
      enteredAt.current = Date.now();
      flushed.current = false;
    }
  }, [key]);

  useEffect(() => {
    function flush() {
      // `visibilitychange` can fire more than once before an unload. Guarded
      // so a backgrounded tab does not record the same dwell three times —
      // a count that inflates on tab-switching is a count whose name is a lie.
      if (flushed.current) return;
      flushed.current = true;
      beacon({ kind: 'visit', path: currentKey.current, ms: Date.now() - enteredAt.current });
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        // Coming back is a new visit, not a continuation.
        enteredAt.current = Date.now();
        flushed.current = false;
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return <WishBox path={key} />;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function WishBox({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [reason, setReason] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setState('saving');
    setReason(null);
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'wish', text, path }),
      });
      const json = (await res.json()) as { recorded: boolean; reason?: string };
      // ⚠️ The ROUTE always answers 200. Whether the write landed is in the
      // body, and a box that reports success on `res.ok` would be lying in
      // exactly the way this codebase keeps finding.
      if (json.recorded) {
        setState('saved');
        setText('');
        setTimeout(() => {
          setState('idle');
          setOpen(false);
        }, 1400);
      } else {
        setState('failed');
        setReason(json.reason ?? 'The write did not land, and said nothing about why.');
      }
    } catch (err) {
      setState('failed');
      setReason((err as Error).message);
    }
  }

  /**
   * ⚠️ IT SAT ON TOP OF THE NAV, AND IT TOOK THE TAPS.
   *
   * This was `fixed bottom-4 right-4 z-40`. The mobile tab bar is `fixed
   * bottom-0 z-30`. So on every phone screen, an opaque pill covered Chat and
   * More — and being higher in the stack, it also received their touches. Two
   * of the four primary destinations were unreachable, not merely obscured.
   *
   * TWO CHANGES, EITHER OF WHICH ALONE WOULD HAVE LEFT A BUG:
   *
   *   · `bottom-above-tabbar` clears the bar plus the safe-area inset, so the
   *     pill is beside the nav rather than over it. `md:bottom-4` restores the
   *     corner above md, where no tab bar exists.
   *   · z-20, BELOW the tab bar rather than above it. Positioning alone would
   *     still leave a feedback button outranking navigation in the stacking
   *     order, which is the wrong priority on any surface — the fix would hold
   *     only until something changed the pill's height.
   *
   * Also `min-h-tap`, since it is a touch target and was 34px.
   *
   * The nav suite asserted all eight destinations render, and all eight did.
   * Presence is not reachability — scripts/render-check.mjs now asks
   * `elementFromPoint` at each target's centre, which is the only check that
   * can tell the difference.
   *
   * ══ AND THE CORNER MOVED, BECAUSE THE TAB BAR WAS ONLY THE FIRST COLLISION ══
   *
   * `elementFromPoint` at a CENTRE answers whether a tap in the middle lands.
   * It is blind to everything short of that, so once the pill cleared the tab
   * bar the check went quiet while the pill still clipped:
   *
   *   · 32% of "Model economics" on the deal page (both pinned)
   *   · 16% of the chat send button at iPad
   *   · 1–3% of the chat composer at desktop and iPad
   *
   * and, the other way round, the deal page's sticky AI-actions rail covered
   * 89% of the pill itself — a feedback control that was there and unusable.
   *
   * ⚠️ LEFT, AND NOT ARBITRARILY. Every surface in this product puts its
   * primary action on the RIGHT: the AI-actions rail, the chat send button,
   * "Model economics", the card CTAs. That is a convention, not a coincidence,
   * so the bottom-left corner is the one strip nothing competes for. A
   * secondary, always-available control belongs where nothing else wants to
   * be — which is a layout argument rather than a nudge until the check goes
   * green.
   *
   * The alternative was moving it into the top-bar cluster, and that costs
   * ~44px of a row that had exactly 79px of headroom after the wordmark
   * collapse — it would put "Learn" back outside the nav at 834.
   *
   * Verified by the encroachment pass in scripts/render-check.mjs: five
   * findings before, zero after, across 3 breakpoints x 18 surfaces.
   */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-above-tabbar left-4 z-20 flex min-h-tap items-center gap-1.5 rounded-full border border-rule bg-bg-raised px-3 py-2 text-2xs text-text-dim shadow-sm transition-colors hover:text-text md:bottom-4"
        aria-label="Record a wish about this surface"
      >
        <Lightbulb size={13} aria-hidden />
        I wish it just…
      </button>
    );
  }

  return (
    <div className="fixed bottom-above-tabbar left-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-rule bg-bg-raised p-3 shadow-lg md:bottom-4">
      <div className="flex items-baseline justify-between">
        <p className="text-2xs uppercase tracking-label text-text-faint">I wish it just…</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-text-faint hover:text-text"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
        rows={3}
        autoFocus
        placeholder="…showed me which of these actually moved a deal."
        className="mt-1.5 w-full resize-none rounded-sm border border-rule bg-bg px-2 py-1.5 text-xs text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-rule"
      />

      <div className="mt-1.5 flex items-center gap-2">
        <span className="truncate font-mono text-2xs text-text-faint">{path}</span>
        <button
          type="button"
          onClick={submit}
          disabled={state === 'saving' || !text.trim()}
          className="ml-auto shrink-0 rounded-sm border border-rule px-2 py-1 text-2xs text-text-dim disabled:opacity-40 hover:text-text"
        >
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>

      {state === 'saved' ? (
        <p className="mt-1 flex items-center gap-1 text-2xs text-success">
          <Check size={11} aria-hidden /> Recorded against {path}.
        </p>
      ) : null}

      {state === 'failed' ? (
        /* Said out loud rather than swallowed. A thought typed into a box and
           silently dropped is worse than no box. */
        <p className={cn('mt-1 text-2xs text-danger')}>
          Not saved — {reason} Your text is still in the box; nothing was lost.
        </p>
      ) : null}
    </div>
  );
}
