'use client';

import { useRef, useState } from 'react';

/**
 * Swipe-to-dismiss for touch devices — ported from The Hub.
 *
 * Deliberately conservative about what counts as a swipe: the gesture must be
 * clearly horizontal (more X than Y travel) before we take it, so a normal
 * vertical scroll through the feed never dismisses a card by accident. On a
 * feed you flick through one-handed, a false positive is far worse than a
 * missed gesture — the reader loses a story and cannot tell why.
 *
 * Pointer Events, so it works for touch and stylus without a mouse ever
 * triggering it. A mouse has the Dismiss button.
 */
export function useSwipeDismiss(onDismiss: () => void, threshold = 96) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
      setSettling(false);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      const moveX = e.clientX - start.current.x;
      const moveY = e.clientY - start.current.y;
      // Vertical intent wins — that is a scroll, not a dismissal. Claiming the
      // Y axis here is what makes a feed feel broken on a phone.
      if (Math.abs(moveY) > Math.abs(moveX)) {
        start.current = null;
        setDx(0);
        return;
      }
      setDx(moveX);
    },
    onPointerUp: () => {
      if (!start.current) return;
      start.current = null;
      setSettling(true);
      if (Math.abs(dx) >= threshold) onDismiss();
      setDx(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setSettling(true);
      setDx(0);
    },
  };

  return {
    handlers,
    /** Live drag offset, for the card to follow the finger. */
    dx,
    /** True once the finger is up, so the card animates back rather than snapping. */
    settling,
    /** Past the point where letting go will dismiss. Drives the visual hint. */
    armed: Math.abs(dx) >= threshold,
  };
}
