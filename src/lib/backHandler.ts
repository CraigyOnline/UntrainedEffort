import { useEffect } from "react";

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
const overlayStack: CloseFn[] = [];

/** Returns true if an overlay was open and got closed — callers of
 *  closeTopOverlay use this to know whether to also let the route navigate. */
function closeTopOverlay(): boolean {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/**
 * Registers `onClose` as the current topmost dismiss target whenever
 * `open` is true. Call this from any overlay/dialog/sheet component,
 * passing whatever function actually closes it (respecting any internal
 * guard, e.g. an unsaved-changes check) rather than a raw setState.
 */
export function useDismissOnBack(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    overlayStack.push(onClose);
    return () => {
      const i = overlayStack.lastIndexOf(onClose);
      if (i !== -1) overlayStack.splice(i, 1);
    };
  }, [open, onClose]);
}

/** Used only by the single central listener in __root.tsx. */
export function handleGlobalBackPress(fallback: () => void) {
  if (closeTopOverlay()) return;
  fallback();
}
