import type { Workout } from "@/lib/db";
import { getExercise, type MuscleGroup } from "@/lib/exercises";

export const muscleIdToSvg: Record<number, string> = {
  1: "muscle-1.svg",
  2: "muscle-2.svg",
  3: "muscle-3.svg",
  4: "muscle-4.svg",
  5: "muscle-5.svg",
  6: "muscle-6.svg",
  7: "muscle-7.svg",
  8: "muscle-8.svg",
  9: "muscle-9.svg",
  10: "muscle-10.svg",
  11: "muscle-11.svg",
  12: "muscle-12.svg",
  13: "muscle-13.svg",
  14: "muscle-14.svg",
  15: "muscle-15.svg",
  16: "muscle-16.svg",
};

/** All muscles that have an SVG body-map layer.
 *  Excludes Cardio (no anatomical layer) and adds render-only entries
 *  Serratus and LowerCalves which have no corresponding exercise data. */
type RenderMuscle = Exclude<MuscleGroup, "Cardio"> | "Serratus" | "LowerCalves";

export const muscleNameToId: Record<RenderMuscle, number> = {
  Biceps: 1,
  Shoulders: 2,
  Serratus: 3,
  Chest: 4,
  Triceps: 5,
  Abs: 6,
  Calves: 7,
  Glutes: 8,
  UpperBack: 9,
  LowerBack: 9,
  Quads: 10,
  Hamstrings: 11,
  Lats: 12,
  Forearms: 13,
  Obliques: 14,
  LowerCalves: 15,
};

/**
 * Computes activation intensity per MuscleGroup from a workout.
 * intensity = (sets targeting that muscle) / (total completed sets)
 * Secondary muscles count at 0.5 weight.
 * "Cardio" is excluded from the result — it has no SVG body-map region and
 * is never anatomically meaningful, so it's dropped rather than left for
 * every caller to filter out individually.
 *
 * For a *finished* workout, an exercise with zero sets marked complete
 * still counts (falls back to its full set count) — the workout happened,
 * so the exercise counts as trained even if completion wasn't ticked.
 * Pass `live: true` to skip that fallback: for an in-progress session this
 * is wrong, since a just-added exercise (seeded with an incomplete
 * placeholder set) would otherwise immediately read as fully trained
 * before any set is actually completed.
 */
export function computeIntensity(
  exercises: Workout["exercises"],
  options?: { live?: boolean },
): Partial<Record<MuscleGroup, number>> {
  const live = options?.live ?? false;
  const counts: Partial<Record<MuscleGroup, number>> = {};
  let total = 0;

  for (const ex of exercises) {
    const def = getExercise(ex.exerciseId);
    if (!def) continue;
    const completedCount = ex.sets.filter((s) => s.completed).length;
    const completed = live ? completedCount : completedCount || ex.sets.length;
    if (!completed) continue;
    total += completed;
    counts[def.muscle] = (counts[def.muscle] ?? 0) + completed;
    for (const sec of def.secondary ?? []) {
      counts[sec] = (counts[sec] ?? 0) + completed * 0.5;
    }
  }

  if (total === 0) return {};
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (k === "Cardio") continue; // not a real muscle — no SVG region, no anatomical meaning
    out[k as MuscleGroup] = Math.min(1, (v as number) / total);
  }
  return out;
}
