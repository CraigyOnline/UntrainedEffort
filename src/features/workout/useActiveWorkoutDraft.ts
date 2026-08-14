import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { getDb, type ActiveWorkoutDraft } from "@/lib/db";

const DEBOUNCE_MS = 400;

type Updater =
  | ActiveWorkoutDraft
  | null
  | ((prev: ActiveWorkoutDraft | null) => ActiveWorkoutDraft | null);

function persist(value: ActiveWorkoutDraft | null): void {
  const db = getDb();
  if (value == null) {
    db.activeWorkout.clear().catch((err) => console.error("Failed to clear workout draft", err));
    return;
  }
  // Clear-then-add keeps the table at zero-or-one rows by construction —
  // there's no fixed id to track or reuse, "no active workout" is simply
  // an empty table.
  db.transaction("rw", db.activeWorkout, async () => {
    await db.activeWorkout.clear();
    await db.activeWorkout.add(value);
  }).catch((err) => console.error("Failed to save workout draft", err));
}

/**
 * The single source of truth for the in-progress workout draft, exposed
 * with the same [value, setValue] shape as useState so existing call
 * sites (LiveSession, the exercise picker wiring, etc.) don't need to
 * change.
 *
 * Reads happen once, on mount — a plain one-shot query, not useLiveQuery.
 * That's deliberate: this hook is the only writer, so there's nothing
 * external to stay reactive to, and re-subscribing to every write would
 * either lag a tick behind or race against the optimistic local state
 * below. After hydration, this hook's own state is authoritative for
 * rendering; Dexie is the durable backing store it stays in sync with,
 * not a second independently-mutated copy of the truth.
 *
 * Writes are debounced (typing a weight, tapping a stepper repeatedly)
 * so rapid edits collapse into one write instead of one per keystroke —
 * safe because callers like NumberInput already keep their own local
 * edit buffer and don't depend on the committed value round-tripping
 * back quickly. That debounce is backed by a flush on unmount and on the
 * app being backgrounded, so a debounced edit is never lost to
 * navigating away or the app later being killed — the only gap left is
 * an *immediate* foreground kill within the debounce window, which
 * Android doesn't really do (it kills backgrounded processes, not the
 * active one).
 *
 * Discarding (setDraft(null)) always bypasses the debounce and clears
 * immediately — discard is a deliberate, terminal action, not a rapid
 * edit, and must not be delayed or racing a stale pending write.
 */
export function useActiveWorkoutDraft(): [
  ActiveWorkoutDraft | null | undefined,
  (updater: Updater) => void,
] {
  const [local, setLocal] = useState<ActiveWorkoutDraft | null | undefined>(undefined);
  const latestRef = useRef<ActiveWorkoutDraft | null | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-shot hydration from IndexedDB.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    getDb()
      .activeWorkout.toCollection()
      .first()
      .then((row) => {
        if (cancelled) return;
        latestRef.current = row ?? null;
        setLocal(row ?? null);
      })
      .catch((err) => {
        console.error("Failed to load workout draft", err);
        if (!cancelled) {
          latestRef.current = null;
          setLocal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flushPending = useCallback(() => {
    if (timeoutRef.current == null) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    persist(latestRef.current ?? null);
  }, []);

  // Safety-net flushes: app backgrounded, or this hook's owning component
  // unmounted (route navigation, back button) — the two realistic windows
  // in which a debounced write could otherwise be lost.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) flushPending();
    }).then((handle) => {
      removeListener = () => handle.remove();
    });
    return () => {
      removeListener?.();
      flushPending();
    };
  }, [flushPending]);

  const setDraft = useCallback((updater: Updater) => {
    const prev = latestRef.current ?? null;
    const next =
      typeof updater === "function"
        ? (updater as (p: ActiveWorkoutDraft | null) => ActiveWorkoutDraft | null)(prev)
        : updater;
    latestRef.current = next;
    setLocal(next);

    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (next == null) {
      persist(null);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      persist(next);
    }, DEBOUNCE_MS);
  }, []);

  return [local, setDraft];
}
