import { getDb, type ExerciseSettings } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Read/write helpers for the exerciseSettings table (db.ts) — kept small and
// specific to restDurationSec, the only field that exists on
// ExerciseSettings today. A future field (e.g. a note or favorite flag)
// would get its own get/set pair here rather than these being generalized
// into a single "patch" function ahead of actually needing that shape.
// ─────────────────────────────────────────────────────────────────────────────

export function getExerciseSettings(exerciseId: string): Promise<ExerciseSettings | undefined> {
  return getDb().exerciseSettings.get(exerciseId);
}

export function getAllExerciseSettings(): Promise<ExerciseSettings[]> {
  return getDb().exerciseSettings.toArray();
}

/** Saves a person's own rest duration for this exercise, taking priority
 *  over its category/global default from then on — see getRestDurationSec
 *  in exercises.ts for how this is applied. */
export async function setExerciseRestDuration(
  exerciseId: string,
  restDurationSec: number,
): Promise<void> {
  await getDb().exerciseSettings.put({ exerciseId, restDurationSec });
}

/** Clears the override so this exercise goes back to its automatic
 *  (category/global) default. Deletes the row outright rather than just
 *  unsetting restDurationSec on it — that field is the only thing this
 *  table holds today, so an empty row and no row mean the same thing; no
 *  reason to keep one around. If a second field (e.g. a note) is ever
 *  added, this would change to only clear restDurationSec and keep the
 *  row if anything else on it is still set. */
export async function clearExerciseRestDuration(exerciseId: string): Promise<void> {
  await getDb().exerciseSettings.delete(exerciseId);
}
