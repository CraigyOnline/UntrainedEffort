import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export interface WorkoutForegroundServicePayload {
  title: string;
  body: string;
  largeBody: string;
  /** true = OS-rendered chronometer ticks the elapsed time; false = the
   * caller has already baked a static elapsed figure into body/largeBody
   * (used while the workout is paused). */
  useChronometer: boolean;
  /** Epoch ms anchor for the chronometer. Only meaningful when
   * useChronometer is true - see getElapsedSec's formula in workoutStats.ts,
   * which this must stay consistent with (whenMs = startedAt + totalPausedMs). */
  whenMs: number;
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
