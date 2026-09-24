import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  WorkoutForegroundService,
  type WorkoutForegroundServicePayload,
} from "@/lib/workoutForegroundServicePlugin";
import { getDb, type ActiveWorkoutDraft } from "@/lib/db";
import { computeWorkoutStats, getCurrentExerciseName, getElapsedSec } from "@/lib/workoutStats";
import { formatDuration } from "@/lib/format";
import { formatVolume, getWeightUnit } from "@/lib/units";

/** How often to refresh the notification's content while it's visible, to
 *  catch anything that isn't already covered by a more targeted mechanism.
 *  The elapsed-time figure doesn't depend on this at all (native
 *  chronometer), and neither does the rest-end alert or the chronometer's
 *  own switch back to counting up (both scheduled natively - see
 *  WorkoutForegroundService.rescheduleRestEnd). What's left for this timer
 *  to catch is purely cosmetic staleness in the *text* — e.g. the
 *  "Resting"/"Ready ✓" label catching up to a chronometer transition that
 *  already happened. */
const ELAPSED_REFRESH_MS = 45_000;

async function ensureWorkoutNotificationPermission(): Promise<void> {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
  } catch (err) {
    console.error("Failed to set up workout notifications", err);
  }
}

/**
 * "Resting" / "Ready ✓", or undefined when no rest timer has ever started
 * this workout. Deliberately doesn't include the remaining time itself —
 * that's the native countdown chronometer's job now (see
 * buildWorkoutNotificationPayload's `resting`/`restEndsAtMs`), which ticks
 * accurately with no app code involved; this is just the label telling the
 * user what that ticking number means.
 */
export function restStatusLine(draft: ActiveWorkoutDraft): string | undefined {
  if (!draft.restTimer) return undefined;
  return draft.restTimer.endsAt > Date.now() ? "Resting" : "Ready ✓";
}

/**
 * Builds the notification's content from the same shared calculations the
 * floating Workout HUD uses — computeWorkoutStats() for sets/volume,
 * getCurrentExerciseName() for what's next. Nothing here re-derives a
 * number that already has a home elsewhere; workoutStats.ts is the single
 * place both this and the Active Workout Card resolve "current exercise"
 * from.
 *
 * `body` is the single-line collapsed form; `largeBody` is the Android
 * big-text style shown once expanded, so the collapsed line stays short
 * while the expanded view gets the full breakdown.
 *
 * The chronometer does double duty rather than appearing as text: while
 * running with no rest active it counts *up* from elapsedAnchorMs (workout
 * elapsed time); while a rest timer is active it counts *down* to
 * restEndsAtMs instead, and the native side separately schedules its own
 * alert for the moment that countdown reaches zero, so it fires on time
 * even if this function never runs again before it does (see
 * WorkoutForegroundService.rescheduleRestEnd). Either way, nothing here
 * renders a ticking number into body/largeBody — restStatusLine supplies
 * only the label ("Resting"), never the figure. elapsedAnchorMs has to
 * stay consistent with getElapsedSec's formula: elapsedSec counts up from
 * `startedAt + totalPausedMs`, so that's exactly the anchor the
 * chronometer needs too. While paused there's nothing to keep ticking
 * either way, so this falls back to a plain formatted figure baked into
 * largeBody instead, the same way the old always-JS-rendered version
 * worked.
 */
export function buildWorkoutNotificationPayload(
  draft: ActiveWorkoutDraft,
): WorkoutForegroundServicePayload {
  const paused = draft.pausedAt != null;
  const { totalSets, totalVolume, loggedSets } = computeWorkoutStats(draft.exercises);
  const currentExerciseName = getCurrentExerciseName(draft.exercises);
  const roundedVolume = formatVolume(Math.round(totalVolume), getWeightUnit());
  // Suppressed while paused: restTimer.endsAt is only corrected on resume
  // (see resumeSession in workoutHelpers.ts), so left alone here it would
  // read as still counting down for a rest that isn't really happening.
  const restLine = paused ? undefined : restStatusLine(draft);
  const resting = !paused && !!draft.restTimer && draft.restTimer.endsAt > Date.now();

  const title = paused ? "Workout paused" : draft.name || "Workout in progress";
  const bodyBase = currentExerciseName
    ? `${currentExerciseName} · ${totalSets}/${loggedSets} sets · ${roundedVolume}`
    : `${totalSets}/${loggedSets} sets · ${roundedVolume}`;
  const body = restLine ? `${restLine} · ${bodyBase}` : bodyBase;

  const largeBody = [
    paused
      ? `Paused · Elapsed: ${formatDuration(getElapsedSec(draft.startedAt, draft.pausedAt, draft.totalPausedMs))}`
      : restLine,
    currentExerciseName ? `Current exercise: ${currentExerciseName}` : undefined,
    `Sets: ${totalSets} / ${loggedSets}`,
    `Volume: ${roundedVolume}`,
    "Tap to return to your workout.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return {
    title,
    body,
    largeBody,
    paused,
    elapsedAnchorMs: draft.startedAt + (draft.totalPausedMs ?? 0),
    resting,
    restEndsAtMs: draft.restTimer?.endsAt ?? 0,
  };
}

async function showWorkoutNotification(draft: ActiveWorkoutDraft): Promise<void> {
  try {
    // Safe to call every time the content might have changed without first
    // checking whether it's already showing — the native side treats the
    // first post and every later refresh identically.
    await WorkoutForegroundService.show(buildWorkoutNotificationPayload(draft));
  } catch (err) {
    console.error("Failed to show workout notification", err);
  }
}

async function cancelWorkoutNotification(): Promise<void> {
  try {
    await WorkoutForegroundService.stop();
  } catch (err) {
    console.error("Failed to cancel workout notification", err);
  }
}

/**
 * Owns the entire lifecycle of the "workout in progress" notification.
 * Mounted once at the app root (see __root.tsx) so it works no matter
 * which screen happens to be showing — the whole point of a persisted
 * draft is that the user can be anywhere in the app while one is active.
 *
 * The only inputs are the same activeWorkout table useActiveWorkoutDraft
 * already persists to (read here via useLiveQuery — this hook is a
 * reader, not the writer, so reactivity is exactly what's wanted, unlike
 * in useActiveWorkoutDraft itself) and the OS foreground/background
 * signal. There is no separate "is a workout active" flag anywhere in
 * here for the draft to drift out of sync with.
 *
 * Deliberately does *not* hide the notification again when the app is
 * brought back to the foreground — nothing in the requirements calls for
 * that, "ongoing" notifications staying visible while the app is open is
 * normal Android UX (e.g. music playback), and it keeps this to exactly
 * the three transitions asked for: shown on backgrounding, left alone
 * until finished or discarded, removed immediately on either of those. A
 * screen lock/unlock fires this same appStateChange event without the
 * notification ever having gone away, so it causes a harmless redundant
 * refresh rather than nothing — simpler than trying to tell a lock/unlock
 * apart from a real background/foreground switch, and a refresh here is
 * exactly what closes the gap where content changed during a brief
 * foreground visit would otherwise sit stale until the timer below caught
 * up.
 *
 * While backgrounded, the notification's content also stays live: it's
 * re-shown whenever the draft changes — name edits, completed sets,
 * exercise or volume changes — and on a fixed timer purely to catch a
 * rest period finishing (see restStatusLine's own caveat above). Unlike
 * before, this timer is no longer what keeps the elapsed-time figure
 * honest — that's now the native chronometer's job, so it can't go stale
 * even if this timer (or the JS engine it runs in) doesn't get to run for
 * a while.
 */
export function useWorkoutNotificationLifecycle(): void {
  const draft = useLiveQuery(() => getDb().activeWorkout.toCollection().first(), []);

  // Read at fire-time from a ref rather than depending on `draft` so the
  // native listener is registered exactly once for the app's lifetime —
  // re-subscribing it on every debounced draft write (as often as every
  // ~400ms while actively editing a set) would be wasted bridge calls
  // for no behavioral benefit.
  const draftRef = useRef<ActiveWorkoutDraft | null | undefined>(draft);
  draftRef.current = draft;

  // Whether the app is currently backgrounded — i.e. whether the
  // notification is actually visible right now. Read at fire-time by the
  // draft-change effect and the elapsed-time timer below, same reasoning
  // as draftRef: avoids re-running effects on every foreground/background
  // flip just to keep a value in a dependency array current.
  const isBackgroundedRef = useRef(false);

  // Prime the permission the moment a workout actually starts, not on
  // every app launch — the prompt should appear in context, and there's
  // nothing to prompt for otherwise.
  const hadDraftRef = useRef(false);
  useEffect(() => {
    const hasDraft = !!draft;
    if (hasDraft && !hadDraftRef.current) {
      ensureWorkoutNotificationPermission();
    }
    hadDraftRef.current = hasDraft;
  }, [draft]);

  // Remove the notification the instant the draft is gone — whether
  // from finishing or discarding, and regardless of which screen that
  // happened on.
  useEffect(() => {
    if (!draft) {
      cancelWorkoutNotification();
    }
  }, [draft]);

  // Keep the visible notification's content current while backgrounded —
  // covers every content change (set completed, exercise changed, volume
  // changed, name edited) without duplicating any of the "when did the
  // workout change" tracking useLiveQuery already does.
  useEffect(() => {
    if (draft && isBackgroundedRef.current) {
      showWorkoutNotification(draft);
    }
  }, [draft]);

  // Show the reminder only when the app is actually backgrounded with a
  // draft still active — never while the user is looking at the app —
  // and keep its non-elapsed content reasonably fresh while it stays
  // backgrounded.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let elapsedRefreshTimer: ReturnType<typeof setInterval> | undefined;

    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isBackgroundedRef.current = !isActive;

      if (!isActive) {
        // Always refreshed here, even on a screen lock/unlock where the
        // notification never actually went away — a lock/unlock re-post is
        // just a harmless redundant call with unchanged content, whereas
        // only refreshing on the *first* backgrounding (as this used to)
        // left it stale after e.g. foregrounding briefly to log a set and
        // backgrounding again, until the ELAPSED_REFRESH_MS tick caught up.
        if (draftRef.current) {
          showWorkoutNotification(draftRef.current);
        }
        // The interval itself still only starts once per backgrounded
        // stretch — restarting it on every lock/unlock would be pointless
        // busywork, unlike the one-off content refresh above.
        if (!elapsedRefreshTimer) {
          elapsedRefreshTimer = setInterval(() => {
            if (draftRef.current) showWorkoutNotification(draftRef.current);
          }, ELAPSED_REFRESH_MS);
        }
      } else if (elapsedRefreshTimer) {
        clearInterval(elapsedRefreshTimer);
        elapsedRefreshTimer = undefined;
      }
    }).then((handle) => {
      removeListener = () => handle.remove();
    });

    return () => {
      removeListener?.();
      if (elapsedRefreshTimer) clearInterval(elapsedRefreshTimer);
    };
  }, []);
}
