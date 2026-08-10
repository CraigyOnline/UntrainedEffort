import type { Workout } from "@/lib/db";
import {
  formatDistanceValue,
  formatPace,
  getExercise,
  getExerciseLoggingSchema,
  getIntervalConfig,
  isCardio,
  setPerformances,
  type DistanceUnit,
} from "@/lib/exercises";
import { formatDuration } from "@/lib/format";

export interface WorkoutStats {
  totalSets: number;
  totalVolume: number;
  /** Every set currently logged for this workout, completed or not — the
   *  denominator for a "3 / 8 sets" progress display. Not filtered by
   *  exercise type or completion the way totalSets/totalVolume are: it's
   *  a plain count of rows, since "how many sets exist" has no notion of
   *  hidden weight or unperformed work to exclude. */
  loggedSets: number;
}

export type WorkoutMode = "strength" | "cardio" | "interval" | "mixed";

export interface CardioActivityStats {
  exerciseId: string;
  name: string;
  durationSec: number;
  distance?: number;
  distanceUnit?: DistanceUnit;
  pace?: string;
}

export interface IntervalActivityStats {
  exerciseId: string;
  name: string;
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  durationSec: number;
}

export interface WorkoutDisplayStats extends WorkoutStats {
  mode: WorkoutMode;
  cardioActivities: CardioActivityStats[];
  /** The primary cardio activity when the workout contains exactly one. */
  primaryCardio?: CardioActivityStats;
  intervalActivities: IntervalActivityStats[];
  /** The primary interval activity when the workout contains exactly one. */
  primaryInterval?: IntervalActivityStats;
}

/**
 * Derives the workout's presentation mode and cardio metrics without changing
 * the persisted workout model. This keeps the database strength/cardio
 * distinction implicit while giving every UI surface one consistent answer
 * to the question: "how should this workout be presented?"
 */
export function computeWorkoutDisplayStats(exercises: Workout["exercises"]): WorkoutDisplayStats {
  const base = computeWorkoutStats(exercises);
  let hasStrength = false;
  let hasCardio = false;
  let hasInterval = false;
  const cardioActivities: CardioActivityStats[] = [];
  const intervalActivities: IntervalActivityStats[] = [];

  for (const ex of exercises) {
    const def = getExercise(ex.exerciseId);
    const intervalConfig = getIntervalConfig(def);
    if (intervalConfig) {
      hasInterval = true;
      const recordedConfig = ex.sets.find(
        (set) => set.completed && set.intervalConfig,
      )?.intervalConfig;
      const config = recordedConfig ?? intervalConfig;
      const durationSec = ex.sets.reduce(
        (sum, set) => sum + (set.completed ? (set.duration ?? 0) : 0),
        0,
      );
      intervalActivities.push({
        exerciseId: ex.exerciseId,
        name: def?.name ?? ex.exerciseId,
        rounds: config.rounds,
        workSeconds: config.workSeconds,
        restSeconds: config.restSeconds,
        durationSec,
      });
      continue;
    }
    if (!isCardio(def)) {
      hasStrength = true;
      continue;
    }

    hasCardio = true;
    const schema = getExerciseLoggingSchema(def);
    let durationSec = 0;
    let distance = 0;
    let hasCompletedDistance = false;

    for (const set of ex.sets) {
      if (!set.completed) continue;
      durationSec += set.duration ?? 0;
      if (schema.distance && schema.distanceUnit) {
        for (const performance of setPerformances(set)) {
          distance += performance.weight;
          hasCompletedDistance = true;
        }
      }
    }

    const activity: CardioActivityStats = {
      exerciseId: ex.exerciseId,
      name: def?.name ?? ex.exerciseId,
      durationSec,
      ...(schema.distance && schema.distanceUnit && hasCompletedDistance
        ? {
            distance,
            distanceUnit: schema.distanceUnit,
            pace: schema.paceConvention
              ? formatPace(schema.paceConvention, schema.distanceUnit, distance, durationSec)
              : undefined,
          }
        : {}),
    };

    cardioActivities.push(activity);
  }

  const modalityCount = Number(hasStrength) + Number(hasCardio) + Number(hasInterval);
  const mode: WorkoutMode =
    modalityCount > 1 ? "mixed" : hasCardio ? "cardio" : hasInterval ? "interval" : "strength";

  return {
    ...base,
    mode,
    cardioActivities,
    primaryCardio: cardioActivities.length === 1 ? cardioActivities[0] : undefined,
    intervalActivities,
    primaryInterval: intervalActivities.length === 1 ? intervalActivities[0] : undefined,
  };
}

/** Compact secondary line used by history cards and similar surfaces. */
export function formatCardioActivity(activity: CardioActivityStats): string {
  const parts: string[] = [];
  if (activity.distance != null && activity.distanceUnit) {
    parts.push(formatDistanceValue(activity.distanceUnit, activity.distance));
  }
  if (activity.durationSec > 0) parts.push(formatDuration(activity.durationSec));
  if (activity.pace) parts.push(activity.pace);
  return parts.join(" · ");
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
 * Only completed sets count towards totalSets/totalVolume, and a unilateral
 * set still counts as exactly one set here, matching how it's still one
 * logical set everywhere else in the app. loggedSets counts every set
 * regardless of completion — this is what a live "X / Y sets" progress
 * indicator wants, so it's computed here rather than a caller re-deriving
 * it from the same array a second time.
 */
export function computeWorkoutStats(exercises: Workout["exercises"]): WorkoutStats {
  let totalSets = 0;
  let totalVolume = 0;
  let loggedSets = 0;

  for (const ex of exercises) {
    const schema = getExerciseLoggingSchema(getExercise(ex.exerciseId));
    for (const s of ex.sets) {
      loggedSets += 1;
      if (!s.completed) continue;
      totalSets += 1;
      if (schema.weight !== "hidden") {
        for (const perf of setPerformances(s)) {
          totalVolume += perf.weight * perf.reps;
        }
      }
    }
  }

  return { totalSets, totalVolume, loggedSets };
}

/**
 * The exercise the user is currently working on, for displays (e.g. the
 * workout notification) that only have room for one at a time.
 *
 * The workout screen itself is a flat scrollable list, not a wizard — a
 * user can complete sets on any exercise in any order — so there's no
 * existing "current index" anywhere to read. This defines "current" as
 * the first exercise (in list order) that still has an incomplete set,
 * i.e. what's next. Once every logged set is complete the workout is
 * still active until the user taps Finish, so this falls back to the
 * last exercise rather than returning nothing. Returns undefined only
 * when the workout has no exercises at all.
 */
export function getCurrentExerciseId(exercises: Workout["exercises"]): string | undefined {
  for (const ex of exercises) {
    if (ex.sets.some((s) => !s.completed)) return ex.exerciseId;
  }
  return exercises.at(-1)?.exerciseId;
}

/**
 * Display name for getCurrentExerciseId()'s result, or undefined for an
 * empty workout. Both the workout notification and the Active Workout
 * Card needed this exact id-to-name resolution; consolidated here so
 * there's one place doing it instead of two copies of the same two lines.
 */
export function getCurrentExerciseName(exercises: Workout["exercises"]): string | undefined {
  const currentExerciseId = getCurrentExerciseId(exercises);
  return currentExerciseId ? getExercise(currentExerciseId)?.name : undefined;
}
