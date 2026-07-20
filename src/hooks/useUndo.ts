import { useCallback, useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";

// ─────────────────────────────────────────────────────────────────────────────
// useUndo<T>
//
// Generic undo hook. Manages the timer, countdown, and state for any
// deletable item. The caller is responsible for:
//   - performing the deletion before calling `trigger()`
//   - performing the restoration inside the `onUndo` callback
//
// Usage:
//   const { trigger, undoItem, secondsLeft, dismiss } = useUndo({
//     duration: 5,
//     onUndo: async (item) => { await db.routines.put(item); },
//     onExpire: () => { /* optional: e.g. log analytics */ },
//   });
//
//   // When user deletes something:
//   await db.routines.delete(r.id);
//   trigger(r);
//
//   // In JSX:
//   {undoItem && (
//     <UndoToast item={undoItem} secondsLeft={secondsLeft} onUndo={undo} onDismiss={dismiss} />
//   )}
// ─────────────────────────────────────────────────────────────────────────────

export interface UseUndoOptions<T> {
  /** How long the undo window stays open in seconds. Default: 3 */
  duration?: number;
  /** Called when the user taps Undo. Perform the restoration here. */
  onUndo: (item: T) => void | Promise<void>;
  /** Called when the timer expires without the user pressing Undo. Optional. */
  onExpire?: () => void;
}

export interface UseUndoResult<T> {
  /** The item pending undo, or null if no undo is active. */
  undoItem: T | null;
  /** Seconds remaining in the undo window. */
  secondsLeft: number;
  /** Call this immediately after performing a deletion. */
  trigger: (item: T) => void;
  /** Call this when the user taps Undo. */
  undo: () => void;
  /** Call this to dismiss the toast without undoing. */
  dismiss: () => void;
}

export function useUndo<T>({
  duration = 3,
  onUndo,
  onExpire,
}: UseUndoOptions<T>): UseUndoResult<T> {
  const [undoItem, setUndoItem] = useState<T | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(duration);

  // Use refs to avoid stale closures in the timer callbacks
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const itemRef = useRef<T | null>(null);

  function clearTimers() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }

  const trigger = useCallback(
    (item: T) => {
      clearTimers();
      itemRef.current = item;
      startRef.current = Date.now();
      setUndoItem(item);
      setSecondsLeft(duration);

      // Countdown display — updates every 200ms to avoid excessive re-renders
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startRef.current) / 1000;
        const remaining = Math.max(0, duration - Math.floor(elapsed));
        setSecondsLeft(remaining);
      }, 200);

      // Expiry — dismiss the toast and call onExpire
      timeoutRef.current = setTimeout(() => {
        clearTimers();
        setUndoItem(null);
        setSecondsLeft(duration);
        itemRef.current = null;
        onExpire?.();
      }, duration * 1000);
    },
    [duration, onExpire],
  );

  const undo = useCallback(() => {
    const item = itemRef.current;
    if (!item) return;
    clearTimers();
    setUndoItem(null);
    setSecondsLeft(duration);
    itemRef.current = null;
    haptics.undo();
    void Promise.resolve(onUndo(item));
  }, [duration, onUndo]);

  const dismiss = useCallback(() => {
    clearTimers();
    setUndoItem(null);
    setSecondsLeft(duration);
    itemRef.current = null;
  }, [duration]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  return { undoItem, secondsLeft, trigger, undo, dismiss };
}
