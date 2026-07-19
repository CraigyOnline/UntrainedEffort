import type { Workout } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, setPerformances } from "@/lib/exercises";

export interface WorkoutStats {
  totalSets: number;
  totalVolume: number;
}

/**
 * Completed-set count and total volume (kg lifted) for a workout's exercises.
 *
 * Any exercise whose logging schema hides weight (cardio, time-based holds,
 * interval exercises) is excluded from volume — their `weight`/`reps`
 * fields either hold something else entirely (cardio's is distance, in km)
 * or are simply unused, so including them would silently pollute the
 * figure with unrelated units or meaningless zeros. Driven by the same
 * schema every other display in the app uses, rather than a separate
 * isCardio-only check that would miss newer non-weight exercise types.
 *
 * A unilateral set's volume sums every side via setPerformances — unlike
 * a PR, volume is already an aggregate total-work figure, so both sides
 * contributing is the correct aggregate, not a "collapse" of anything.
 *
 * Only completed sets count towards either number, and a unilateral set
 * still counts as exactly one set here, matching how it's still one
 * logical set everywhere else in the app.
 */
export function computeWorkoutStats(exercises: Workout["exercises"]): WorkoutStats {
  let totalSets = 0;
  let totalVolume = 0;

  for (const ex of exercises) {
    const schema = getExerciseLoggingSchema(getExercise(ex.exerciseId));
    for (const s of ex.sets) {
      if (!s.completed) continue;
      totalSets += 1;
      if (schema.weight !== "hidden") {
        for (const perf of setPerformances(s)) {
          totalVolume += perf.weight * perf.reps;
        }
      }
    }
  }

  return { totalSets, totalVolume };
}
