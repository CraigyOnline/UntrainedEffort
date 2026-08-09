/**
 * Body-map display preference — which silhouette/muscle SVG set the
 * MuscleMap renders (see @/lib/muscles and @/components/MuscleMap).
 *
 * Purely cosmetic: it has no bearing on exercise data, targets, or
 * anything else in the app. Same storage approach as keepAwake.ts and
 * haptics.ts — a single value isn't worth a Dexie table/schema migration,
 * so it lives in localStorage. Defaults to "male" — an arbitrary but
 * necessary choice, changeable any time in Settings.
 */
export type BodyType = "male" | "female";

const STORAGE_KEY = "muscleMapBodyType";

export function getBodyType(): BodyType {
  if (typeof window === "undefined") return "male";
  return window.localStorage.getItem(STORAGE_KEY) === "female" ? "female" : "male";
}

export function setBodyType(value: BodyType): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}
