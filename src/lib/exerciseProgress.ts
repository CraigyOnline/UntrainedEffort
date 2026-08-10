import type { Workout, WorkoutSet } from "@/lib/db";
import {
  setPerformances,
  formatDistanceValue,
  type DistanceUnit,
  type ExerciseLoggingSchema,
  type SetSide,
} from "@/lib/exercises";
import { formatDuration } from "@/lib/format";

export type MetricKind = "weight" | "reps" | "duration" | "distance";

/**
 * Decides which metric an exercise's Current Best and chart should use.
 * Built directly on the existing ExerciseLoggingSchema — this isn't a
 * second classification system, just one more mapping from it.
 */
export function getPrimaryMetricKind(schema: ExerciseLoggingSchema): MetricKind {
  if (schema.interval) return "duration";
  if (schema.distance) return "distance";
  if (schema.duration) return "duration";
  if (schema.weight === "required") return "weight";
  return "reps";
}

const METRIC_FIELD: Record<MetricKind, (perf: SetSide) => number | undefined> = {
  distance: (perf) => perf.weight,
  weight: (perf) => perf.weight,
  duration: (perf) => perf.duration,
  reps: (perf) => perf.reps,
};

/**
 * The best value per side, across a session's completed sets, for an
 * already-decided metric kind. Index 0 is the first (or only) side;
 * index 1 is the second side, for a unilateral exercise. Built on
 * setPerformances rather than reading weight/reps/duration off WorkoutSet
 * directly, so this has no idea of its own whether the exercise is
 * unilateral — it just reports however many sides the data actually has.
 *
 * This is what lets a future per-side Current Best card or a two-line
 * Left/Right chart be built later without another architectural change —
 * both sides' bests are already tracked here, just not surfaced in any
 * UI yet.
 */
export function getPrimaryMetricBySide(kind: MetricKind, sets: WorkoutSet[]): Array<number | null> {
  const pick = METRIC_FIELD[kind];
  const sideCount = sets.reduce((max, s) => Math.max(max, setPerformances(s).length), 1);

  const bestPerSide: Array<number | null> = [];
  for (let i = 0; i < sideCount; i++) {
    const nums = sets
      .map((s) => setPerformances(s)[i])
      .filter((perf): perf is SetSide => perf != null)
      .map((perf) => pick(perf) ?? 0)
      .filter((v) => v > 0);
    bestPerSide.push(nums.length > 0 ? Math.max(...nums) : null);
  }
  return bestPerSide;
}

/**
 * The best value for one session's sets, given an already-decided metric
 * kind — the first (or only) side. A thin wrapper over
 * getPrimaryMetricBySide so every existing caller (Exercise Detail's
 * chart, Profile's Current Focus and Recent Progress) keeps working
 * completely unchanged.
 */
export function getPrimaryMetric(kind: MetricKind, sets: WorkoutSet[]): number | null {
  return getPrimaryMetricBySide(kind, sets)[0] ?? null;
}

export function metricLabel(kind: MetricKind): string {
  if (kind === "distance") return "Distance";
  if (kind === "duration") return "Duration";
  if (kind === "weight") return "Weight";
  return "Reps";
}

/**
 * distanceUnit is optional and defaults to "km" — every current call site
 * has a schema (or a computeExerciseStatus result carrying distanceUnit)
 * to pass in, but this keeps the function safely callable without one
 * rather than requiring every caller to thread it through even when the
 * kind isn't "distance" in the first place.
 */
export function formatMetricValue(
  kind: MetricKind,
  value: number,
  distanceUnit: DistanceUnit = "km",
): string {
  if (kind === "distance") return formatDistanceValue(distanceUnit, value);
  if (kind === "duration") return formatDuration(value);
  if (kind === "weight") return `${value}kg`;
  return `${value} reps`;
}

/**
 * Returns the session-level cardio pace/speed/rate from completed sets.
 * Distances and durations are aggregated before calculating the rate so a
 * workout containing multiple logged cardio sets is represented as one
 * coherent session rather than an average of already-averaged set rates.
 *
 * For pace, the result is seconds per the convention's configured distance
 * chunk (e.g. seconds per km or per 500m). For speed/rate it is the numeric
 * units used by the convention (distance/hour or distance/minute).
 */
export function getCardioRate(
  schema: ExerciseLoggingSchema,
  sets: WorkoutSet[],
): number | null {
  if (!schema.distance || !schema.distanceUnit || !schema.paceConvention) return null;

  let distance = 0;
  let durationSec = 0;
  for (const set of sets) {
    if (!set.completed) continue;
    for (const perf of setPerformances(set)) {
      const d = perf.weight ?? 0;
      const t = perf.duration ?? 0;
      if (d > 0 && t > 0) {
        distance += d;
        durationSec += t;
      }
    }
  }
  if (distance <= 0 || durationSec <= 0) return null;

  const convention = schema.paceConvention;
  if (convention.style === "pace") {
    return durationSec / (distance / convention.per);
  }
  if (convention.style === "speed") {
    return (distance / durationSec) * 3600;
  }
  return (distance / durationSec) * 60;
}

/** Formats the numeric result returned by getCardioRate using the exercise's
 * actual convention, so running, rowing, cycling and stair climbing all get
 * their familiar units instead of a generic decimal. */
export function formatCardioRate(
  schema: ExerciseLoggingSchema,
  value: number,
): string {
  const convention = schema.paceConvention;
  if (!convention) return "—";
  if (convention.style === "pace") {
    const unit = schema.distanceUnit === "km" ? "km" : schema.distanceUnit === "m" ? "m" : "floors";
    const per = convention.per === 1 ? unit : `${convention.per}${unit}`;
    return `${formatDuration(Math.round(value))}/${per}`;
  }
  if (convention.style === "speed") {
    const unit = schema.distanceUnit === "km" ? "km" : schema.distanceUnit === "m" ? "m" : "floors";
    return `${value.toFixed(1)} ${unit}/h`;
  }
  const unit = schema.distanceUnit === "km" ? "km" : schema.distanceUnit === "m" ? "m" : "floors";
  return `${value.toFixed(1)} ${unit}/min`;
}

export type Trend = "up" | "down" | "flat";

/**
 * Plain two-point comparison — deliberately not an average, a regression,
 * or anything resembling plateau/confidence detection. Used wherever this
 * feature needs a simple "did this go up or down since last time".
 */
export function compareTrend(previous: number, latest: number): Trend {
  if (latest > previous) return "up";
  if (latest < previous) return "down";
  return "flat";
}

/**
 * When each exercise was last actually trained (a session with at least
 * one completed set of it) — one pass over all workouts, most-recent-first
 * (matches every existing caller's query order, e.g.
 * .orderBy("startedAt").reverse()), keeping only the first (most recent)
 * hit per exercise. Used by the Exercises list page as a lightweight
 * per-row badge.
 *
 * Deliberately just a timestamp rather than reusing/extending
 * computeExerciseStatus (Profile's improving/plateauing status) — that
 * function does a full best-value and two-session trend comparison *per
 * exercise it's asked about*, which is fine for the handful of exercises
 * Profile's Recent Progress shows, but would mean one full pass over
 * `workouts` for every exercise in the whole catalog here. This is a
 * single O(workouts) pass regardless of catalog size.
 */
export function computeLastTrainedAt(workouts: Workout[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of workouts) {
    for (const log of w.exercises) {
      if (map.has(log.exerciseId)) continue;
      if (log.sets.some((s) => s.completed)) {
        map.set(log.exerciseId, w.startedAt);
      }
    }
  }
  return map;
}
