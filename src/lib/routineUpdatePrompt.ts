/**
 * "Update Routine?" prompt preference.
 *
 * Same storage approach as keepAwake.ts/haptics.ts: a single boolean isn't
 * worth a Dexie table/schema migration, so it lives in localStorage.
 * Defaults to enabled, matching the existing prompt behavior.
 */
const STORAGE_KEY = "routineUpdatePromptEnabled";

export function getRoutineUpdatePromptEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export function setRoutineUpdatePromptEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}
