import { useEffect, useId } from "react";

/**
 * A single, app-wide stack of "things that are currently open and should
 * consume the next Android back-button press". Capacitor's back-button
 * event has exactly one listener registered for it (in __root.tsx) —
 * this stack is what lets many independent overlays (dialogs, the routine
 * editor, the exercise picker, the muscle drill-down sheet) each say
 * "I'm open right now" without needing their own listener, and without the
 * central listener needing to know anything about which overlay is which.
 *
 * Only the topmost (most recently opened) entry is closed per back press,
 * matching how a stack of screens/sheets should unwind one at a time.
 */
type CloseFn = () => void;
type OverlayEntry = { id: string; close: CloseFn };
const overlayStack: OverlayEntry[] = [];

/** Returns true if an overlay was open and got closed — callers of
 *  closeTopOverlay use this to know whether to also let the route navigate. */
function closeTopOverlay(): boolean {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Registers `onClose` as the current topmost dismiss target whenever
 * `open` is true. Call this from any overlay/dialog/sheet component,
 * passing whatever function actually closes it (respecting any internal
 * guard, e.g. an unsaved-changes check) rather than a raw setState.
 *
 * Entries are keyed by a stable per-hook-instance id (useId), not by the
 * `onClose` reference itself — a caller whose `onClose` is a fresh inline
 * function on every render (rather than memoized) would otherwise cause
 * this effect to remove-then-repush on every render, moving it to the top
 * of the stack even though nothing about it actually opened or closed.
 * With a stable id, that same churn just replaces this entry in place,
 * so an unmemoized `onClose` can no longer disturb the ordering of other
 * overlays that are simultaneously open.
 */
export function useDismissOnBack(open: boolean, onClose: () => void) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const index = overlayStack.findIndex((e) => e.id === id);
    if (index !== -1) {
      overlayStack[index] = { id, close: onClose };
    } else {
      overlayStack.push({ id, close: onClose });
    }
    return () => {
      const i = overlayStack.findIndex((e) => e.id === id);
      if (i !== -1) overlayStack.splice(i, 1);
    };
  }, [open, onClose, id]);
}

/** Used only by the single central listener in __root.tsx. */
export function handleGlobalBackPress(fallback: () => void) {
  if (closeTopOverlay()) return;
  fallback();
}
