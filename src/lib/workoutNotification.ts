import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getDb, type ActiveWorkoutDraft } from "@/lib/db";
import { computeWorkoutStats, getCurrentExerciseName } from "@/lib/workoutStats";
import { formatDuration } from "@/lib/format";

const CHANNEL_ID = "workout-progress";
const NOTIFICATION_ID = 918273;
/** How often to refresh the notification purely for the elapsed-time tick
 *  while it's visible. Per the feature spec this doesn't need second-by-
 *  second precision, so a single fixed interval is enough — no wake lock
 *  or high-frequency timer required. */
const ELAPSED_REFRESH_MS = 45_000;

/** Tags the notification so a tap can be told apart from any other kind
 *  of notification this app might add later. */
export const WORKOUT_NOTIFICATION_EXTRA = { type: "active-workout" } as const;

let channelReady: Promise<void> | null = null;

function ensureChannel(): Promise<void> {
  if (!channelReady) {
    channelReady = LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Workout in progress",
      description: "Reminds you a workout is still running when you leave the app.",
      importance: 3, // DEFAULT — visible in the status bar, no sound or heads-up popup
    }).catch((err) => {
      console.error("Failed to create workout notification channel", err);
    });
  }
  return channelReady;
}

async function ensureWorkoutNotificationPermission(): Promise<void> {
  try {
    await ensureChannel();
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
  } catch (err) {
    console.error("Failed to set up workout notifications", err);
  }
}

/**
 * Builds the notification's text from the same shared calculations the
 * floating Workout HUD uses — computeWorkoutStats() for sets/volume,
 * getCurrentExerciseName() for what's next, formatDuration() for elapsed
 * time. Nothing here re-derives a number that already has a home
 * elsewhere; workoutStats.ts is the single place both this and the
 * Active Workout Card resolve "current exercise" from.
 *
 * `body` is the single-line collapsed form; `largeBody` is the Android
 * big-text style shown once expanded, so the collapsed line stays short
 * while the expanded view gets the full breakdown.
 */
function buildWorkoutNotificationContent(draft: ActiveWorkoutDraft): {
  title: string;
  body: string;
  largeBody: string;
} {
  const elapsedSec = Math.max(0, Math.round((Date.now() - draft.startedAt) / 1000));
  const { totalSets, totalVolume, loggedSets } = computeWorkoutStats(draft.exercises);
  const currentExerciseName = getCurrentExerciseName(draft.exercises);
  const roundedVolume = Math.round(totalVolume);

  const title = draft.name || "Workout in progress";
  const body = currentExerciseName
    ? `${currentExerciseName} · ${totalSets}/${loggedSets} sets · ${roundedVolume} kg`
    : `${totalSets}/${loggedSets} sets · ${roundedVolume} kg`;
  const largeBody = [
    `Elapsed: ${formatDuration(elapsedSec)}`,
    currentExerciseName ? `Current exercise: ${currentExerciseName}` : undefined,
    `Sets: ${totalSets} / ${loggedSets}`,
    `Volume: ${roundedVolume} kg`,
    "Tap to resume.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return { title, body, largeBody };
}

async function showWorkoutNotification(draft: ActiveWorkoutDraft): Promise<void> {
  try {
    await ensureChannel();
    const { title, body, largeBody } = buildWorkoutNotificationContent(draft);
    // No `schedule` field: omitting it displays the notification right
    // away rather than scheduling it for a future trigger. Re-showing
    // with the same id replaces the existing one in place, so this is
    // safe to call every time the content might have changed without
    // first checking whether it's already showing.
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          channelId: CHANNEL_ID,
          title,
          body,
          largeBody,
          ongoing: true,
          autoCancel: false,
          extra: WORKOUT_NOTIFICATION_EXTRA,
        },
      ],
    });
  } catch (err) {
    console.error("Failed to show workout notification", err);
  }
}

async function cancelWorkoutNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
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
 * until finished or discarded, removed immediately on either of those.
 * Because of that, a screen lock/unlock (which fires the same
 * appStateChange event as a real background/foreground switch, but
 * doesn't actually make the notification go anywhere) must not re-post
 * it either — notificationVisibleRef is what makes that idempotent.
 *
 * While backgrounded, the notification's content also stays live: it's
 * re-shown (same NOTIFICATION_ID, so it replaces in place rather than
 * stacking) whenever the draft changes — name edits, completed sets,
 * exercise or volume changes — and on a fixed timer purely to keep the
 * elapsed-time figure moving, since that's the one field that changes
 * without the draft itself changing.
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

  // Whether the notification has actually been posted for the current
  // workout. Deliberately NOT the same thing as isBackgroundedRef: on
  // Android, locking/unlocking the screen also fires appStateChange
  // (isActive:false/true) even though the app was never really
  // backgrounded, so isBackgroundedRef flips on every lock cycle. This
  // ref only flips back to false when the workout actually ends (see the
  // cancel effect below) — a bare screen lock/unlock never resets it,
  // which is what stops the notification being re-posted (and visibly
  // re-firing) on every sleep/wake cycle even though it never went away.
  const notificationVisibleRef = useRef(false);

  // Prime the permission + channel the moment a workout actually starts,
  // not on every app launch — the prompt should appear in context, and
  // there's nothing to prompt for otherwise.
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
  // happened on. This is the only place notificationVisibleRef resets:
  // the notification genuinely stops existing here, unlike a screen
  // lock/unlock, which never actually removes it.
  useEffect(() => {
    if (!draft) {
      cancelWorkoutNotification();
      notificationVisibleRef.current = false;
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
  // and keep its elapsed-time figure ticking while it stays backgrounded.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let elapsedRefreshTimer: ReturnType<typeof setInterval> | undefined;

    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isBackgroundedRef.current = !isActive;

      if (!isActive) {
        // Post only if it isn't already up — a screen lock/unlock fires
        // this same isActive:false transition without the notification
        // ever having gone away, so re-posting unconditionally here was
        // the bug (see notificationVisibleRef's comment above).
        if (draftRef.current && !notificationVisibleRef.current) {
          showWorkoutNotification(draftRef.current);
          notificationVisibleRef.current = true;
        }
        // Same idempotency for the interval itself — guards against the
        // same repeated-lock scenario restarting it redundantly.
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
