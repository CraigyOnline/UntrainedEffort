import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Haptic feedback preference, app-wide.
 *
 * Same storage approach as keepAwake.ts: a single boolean isn't worth a
 * Dexie table/schema migration, so it lives in localStorage. Defaults to
 * enabled — haptics are opt-out, matching the fitness apps this is modeled
 * on (Hevy, Strong).
 */
const STORAGE_KEY = "hapticsEnabled";

export function getHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export function setHapticsEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

/**
 * Wrapped defensively like keepAwake's calls: outside a native Android/iOS
 * build (e.g. plain web preview) the plugin may be unavailable, and a
 * missed haptic should never break the action it's attached to — it just
 * silently has no effect. Also short-circuits entirely when the person has
 * turned haptics off in Settings.
 */
async function fire(action: () => Promise<void>): Promise<void> {
  if (!getHapticsEnabled()) return;
  try {
    await action();
  } catch {
    // no-op — unsupported platform
  }
}

/**
 * Deliberately small and specific — one call per *meaningful* action, not
 * wired into every tap in the app. See the mobile-polish audit's haptics
 * section for the reasoning behind which actions made this list.
 */
export const haptics = {
  /** Marking a set complete — the single most-repeated action in a workout. */
  setComplete: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Starting a workout (empty session or from a routine). */
  workoutStart: () => fire(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** A workout finishes saving successfully. */
  workoutFinish: () => fire(() => Haptics.notification({ type: NotificationType.Success })),
  /** A save/finish action fails. */
  error: () => fire(() => Haptics.notification({ type: NotificationType.Error })),
  /** Confirming a destructive action (delete workout/routine, discard changes). */
  delete: () => fire(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** Tapping Undo. */
  undo: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
};
