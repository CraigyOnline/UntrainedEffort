/**
 * Body-type display preference. Originally just which silhouette/muscle
 * SVG set MuscleMap renders (see @/lib/muscles and @/components/MuscleMap);
 * also used by ExerciseFormViewer to pick which set of exercise reference
 * images to show (see @/lib/exerciseImages). Cosmetic either way — it has
 * no bearing on exercise data, targets, or anything tracked in the app.
 * Same storage approach as keepAwake.ts and haptics.ts — a single value
 * isn't worth a Dexie table/schema migration, so it lives in localStorage.
 * Defaults to "male" — an arbitrary but necessary choice, changeable any
 * time in Settings.
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
