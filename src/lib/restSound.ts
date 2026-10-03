import { WorkoutForegroundService } from "@/lib/workoutForegroundServicePlugin";

/**
 * Rest-sound preference, app-wide. Same storage approach as haptics.ts and
 * keepAwake.ts (a single boolean isn't worth a Dexie table/schema
 * migration), and the same default: on, opt-out.
 */
const STORAGE_KEY = "restSoundEnabled";

export function getRestSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export function setRestSoundEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

/**
 * How late the resting -> ready transition can be noticed and still count
 * as "just happened". The rest bar ticks every 250ms, so a live transition
 * is detected well inside this; a much later one means the timer was
 * frozen while the app was away (backgrounded/locked) and has only now
 * caught up on return - by which point the person was already alerted by
 * the notification, so beeping again would be noise.
 */
const MAX_LATENESS_MS = 2000;

/**
 * Whether the sound should play for a rest that was due to end at
 * `endsAt`. Only for a live transition with the app on screen: the
 * background case is the notification's job, and a stale catch-up is
 * covered above.
 */
export function shouldPlayRestSound(endsAt: number, now: number, visible: boolean): boolean {
  return visible && now - endsAt <= MAX_LATENESS_MS;
}

/**
 * Same defensive stance as haptics.ts: outside a native Android build (plain
 * web preview) the plugin is unavailable, and a missed sound should never
 * break the screen it's attached to.
 */
export async function playRestSound(endsAt: number): Promise<void> {
  if (!getRestSoundEnabled()) return;
  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  if (!shouldPlayRestSound(endsAt, Date.now(), visible)) return;
  try {
    await WorkoutForegroundService.playRestSound();
  } catch {
    // no-op - unsupported platform
  }
}
