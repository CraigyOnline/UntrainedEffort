import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getDb, type ActiveWorkoutDraft } from "@/lib/db";

const CHANNEL_ID = "workout-progress";
const NOTIFICATION_ID = 918273;

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

async function showWorkoutNotification(draft: ActiveWorkoutDraft): Promise<void> {
  try {
    await ensureChannel();
    // No `schedule` field: omitting it displays the notification right
    // away rather than scheduling it for a future trigger. Re-showing
    // with the same id replaces the existing one in place, so this is
    // safe to call every time the app backgrounds without first checking
    // whether it's already showing.
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          channelId: CHANNEL_ID,
          title: "Workout in progress",
          body: draft.name ? `${draft.name} — tap to resume.` : "Tap to resume your workout.",
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
  // happened on.
  useEffect(() => {
    if (!draft) cancelWorkoutNotification();
  }, [draft]);

  // Show the reminder only when the app is actually backgrounded with a
  // draft still active — never while the user is looking at the app.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive && draftRef.current) {
        showWorkoutNotification(draftRef.current);
      }
    }).then((handle) => {
      removeListener = () => handle.remove();
    });
    return () => removeListener?.();
  }, []);
}
