import { KeepAwake } from "@capacitor-community/keep-awake";

/**
 * Keep-screen-awake preference.
 *
 * The saved default lives in localStorage (a single boolean isn't worth a
 * Dexie table/schema migration). Per-workout overrides are kept purely in
 * LiveSession's own component state and never touch this stored value.
 */
const STORAGE_KEY = "keepScreenAwakeDefault";

export function getKeepAwakeDefault(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setKeepAwakeDefault(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

/**
 * Both calls are wrapped defensively: outside a native Android/iOS build
 * (e.g. plain web preview) the plugin may be unavailable, and this should
 * never break the workout screen — it just silently has no effect.
 */
export async function enableKeepAwake(): Promise<void> {
  try {
    await KeepAwake.keepAwake();
  } catch {
    // no-op — unsupported platform
  }
}

export async function disableKeepAwake(): Promise<void> {
  try {
    await KeepAwake.allowSleep();
  } catch {
    // no-op — unsupported platform
  }
}
