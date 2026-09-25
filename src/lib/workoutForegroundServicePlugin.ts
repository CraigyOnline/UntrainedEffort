import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export interface WorkoutForegroundServicePayload {
  title: string;
  body: string;
  largeBody: string;
  /** True while the workout is paused — the native side shows no
   * chronometer at all in this case, since body/largeBody already carry a
   * static elapsed figure computed the same way the old always-JS-rendered
   * version worked. */
  paused: boolean;
  /** Epoch ms anchor for the "counting up" elapsed-time chronometer, used
   * whenever not paused and no rest timer is active. Must stay consistent
   * with getElapsedSec's formula in workoutStats.ts:
   * elapsedAnchorMs = startedAt + totalPausedMs. */
  elapsedAnchorMs: number;
  /** True while a rest timer is running and the workout isn't paused — the
   * native side then counts the chronometer *down* to restEndsAtMs instead
   * of up from elapsedAnchorMs, and separately schedules its own
   * rest-complete alert for that same moment (see
   * WorkoutForegroundService.rescheduleRestEnd), so the alert still fires
   * on time even if nothing calls show() again before it does. */
  resting: boolean;
  /** Epoch ms the current rest period ends. Only meaningful when resting
   * is true. */
  restEndsAtMs: number;
  /** "Current exercise: X", or "" when none — only consumed natively while
   * resting, to populate the custom countdown layout's own row instead of
   * parsing it back out of largeBody. */
  currentExerciseLine: string;
  /** "Sets: X / Y" — same reasoning as currentExerciseLine. */
  setsLine: string;
  /** "Volume: X" — same reasoning as currentExerciseLine. */
  volumeLine: string;
}

export interface WorkoutForegroundServicePlugin {
  /** Posts the notification if it isn't showing yet, or refreshes its
   * content in place if it already is - the native side treats both cases
   * identically (see WorkoutForegroundService.onStartCommand). */
  show(payload: WorkoutForegroundServicePayload): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "notificationTapped",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
}

/**
 * Bridges to the custom native plugin in native/workout-foreground-service/.
 * Android-only and built specifically for this one notification - there's
 * no web implementation, since the entire point is a real foreground
 * service. Every call site in workoutNotification.ts already wraps calls to
 * this in try/catch the same way it does for every other Capacitor plugin,
 * so this is safe to import in non-native contexts (prerendering, `vite
 * dev` in a browser) even though it has nothing to actually do there.
 */
export const WorkoutForegroundService = registerPlugin<WorkoutForegroundServicePlugin>(
  "WorkoutForegroundService",
);
