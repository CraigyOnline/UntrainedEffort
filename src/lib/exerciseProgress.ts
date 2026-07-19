import type { WorkoutSet } from "@/lib/db";
import { setPerformances, type ExerciseLoggingSchema, type SetSide } from "@/lib/exercises";
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

export function formatMetricValue(kind: MetricKind, value: number): string {
  if (kind === "distance") return `${value}km`;
  if (kind === "duration") return formatDuration(value);
  if (kind === "weight") return `${value}kg`;
  return `${value} reps`;
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
