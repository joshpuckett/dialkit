export type PointerGestureHandlers = {
  move?: (event: PointerEvent) => void;
  /** Runs exactly once. A cancelled gesture should put back what it changed. */
  end?: (cancelled: boolean, event?: PointerEvent) => void;
};

/** Ends the gesture. Pass false to finish without cancelling, as on unmount. */
export type StopGesture = (cancelled?: boolean) => void;

/**
 * The lifecycle every drag shares: primary button only, one pointer, Escape to
 * cancel. Listening on the window keeps a gesture alive when a framework
 * replaces the element it started on, and capture keeps it alive outside the
 * viewport. Returns null when the press doesn't start a gesture.
 */
export function startPointerGesture(
  event: PointerEvent,
  handle: Element | null,
  handlers: PointerGestureHandlers
): StopGesture | null {
  if (event.button !== 0) return null;
  const { pointerId } = event;
  try { handle?.setPointerCapture(pointerId); } catch { /* the handle is being replaced */ }

  let finished = false;
  const finish = (cancelled: boolean, last?: PointerEvent) => {
    if (finished) return;
    finished = true;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    window.removeEventListener('keydown', onKey, true);
    try {
      if (handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    } catch { /* the handle is gone */ }
    handlers.end?.(cancelled, last);
  };
  const onMove = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    next.preventDefault();
    handlers.move?.(next);
  };
  const onEnd = (next: PointerEvent) => {
    if (next.pointerId === pointerId) finish(next.type === 'pointercancel', next);
  };
  const onKey = (next: KeyboardEvent) => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    finish(true);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  window.addEventListener('keydown', onKey, true);
  return (cancelled = true) => finish(cancelled);
}
