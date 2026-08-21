import type { Workout, WorkoutSet } from "@/lib/db";
import {
  getExercise,
  getExerciseLoggingSchema,
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
export function getCardioRate(schema: ExerciseLoggingSchema, sets: WorkoutSet[]): number | null {
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
export function formatCardioRate(schema: ExerciseLoggingSchema, value: number): string {
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

export type DisplayPRType = "weight" | "reps" | "time" | "distance" | "pace" | "speed" | "volume";

export function formatPRValue(
  type: DisplayPRType,
  value: number,
  schema: ExerciseLoggingSchema,
): string {
  if (type === "time") return formatMetricValue("duration", value);
  if (type === "weight") return `${value}kg`;
  if (type === "volume") return `${Math.round(value)}kg`;
  if (type === "distance") return formatDistanceValue(schema.distanceUnit ?? "km", value);
  if (type === "reps") return `${value}`;
  if (schema.paceConvention && schema.distanceUnit) {
    if (type === "pace" && schema.paceConvention.style === "pace") {
      const unit =
        schema.distanceUnit === "km" ? "km" : schema.distanceUnit === "m" ? "m" : "floors";
      const per = schema.paceConvention.per === 1 ? unit : `${schema.paceConvention.per}${unit}`;
      return `${formatDuration(Math.round(value))}/${per}`;
    }
    const unit = schema.distanceUnit === "km" ? "km" : schema.distanceUnit === "m" ? "m" : "floors";
    return schema.paceConvention.style === "rate"
      ? `${value.toFixed(1)} ${unit}/min`
      : `${value.toFixed(1)} ${unit}/h`;
  }
  return `${value}`;
}

export function formatPRDelta(
  type: DisplayPRType,
  delta: number,
  schema: ExerciseLoggingSchema,
): string {
  if (type === "pace") {
    return `${formatDuration(Math.round(delta))} faster`;
  }
  return `+${formatPRValue(type, delta, schema)}`;
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

export type ExerciseStatus =
  | "improving"
  | "plateauing"
  | "declining"
  | "stable"
  | "needs-more-data";

/** Sessions needed before a flat reading counts as a genuine plateau
 *  rather than a single quiet session — see computeExerciseStatusFromValues. */
const PLATEAU_WINDOW = 4;

/**
 * Status of one exercise's progress, from its per-session primary-metric
 * values (most-recent session first — index 0 is latest).
 *
 * Below PLATEAU_WINDOW sessions, this is a plain two-point comparison —
 * latest vs. the one before it — in the same spirit as compareTrend
 * itself: not enough history yet to tell a genuine plateau from a single
 * off session, so a flat reading here is reported as "stable", not
 * "plateauing".
 *
 * At PLATEAU_WINDOW+ sessions, it compares the oldest vs. newest value in
 * that trailing window instead of just the last two points, so a single
 * up/down blip mid-window doesn't flip the result. Only this comparison
 * can report "plateauing" — a real plateau needs several sessions to be
 * one, not two. Still deliberately just comparing two points (oldest and
 * newest), not a regression or a variance check, matching compareTrend's
 * own scope — see its doc comment.
 *
 * `lowerIsBetter` matches getCardioTrend's own parameter: pass true for
 * pace, where a falling value is the improvement, not the decline. Every
 * other metric this app tracks (weight, reps, duration, distance, speed,
 * rate) is higher-is-better, so it defaults to false.
 */
export function computeExerciseStatusFromValues(
  values: number[],
  lowerIsBetter = false,
): ExerciseStatus {
  if (values.length < 2) return "needs-more-data";

  const windowed = values.length >= PLATEAU_WINDOW;
  const previous = windowed ? values[PLATEAU_WINDOW - 1] : values[1];
  const latest = values[0];

  if (latest === previous) return windowed ? "plateauing" : "stable";
  const improved = lowerIsBetter ? latest < previous : latest > previous;
  return improved ? "improving" : "declining";
}

export type TrendConfidence = "early" | "established";

/**
 * How much evidence backs a trend reading, from sample size alone —
 * deliberately mirrors the exact PLATEAU_WINDOW boundary
 * computeExerciseStatusFromValues itself switches on, so a status's
 * confidence always agrees with how it was actually computed: "early"
 * means only a bare 2-point comparison went into it (same as this
 * function's own below-window case), "established" means the fuller
 * windowed comparison did.
 *
 * `sessionsUsed` names exactly what was compared, not the caller's whole
 * history — computeExerciseStatusFromValues never looks past the 2nd or
 * PLATEAU_WINDOW-th point regardless of how much more data exists, so an
 * evidence line should never claim more sessions than that.
 *
 * Returns null below 2 sessions, where there's no trend to attach
 * confidence to at all — matches computeExerciseStatusFromValues' own
 * "needs-more-data" cutoff.
 */
export function getTrendConfidence(
  sampleSize: number,
): { confidence: TrendConfidence; sessionsUsed: number } | null {
  if (sampleSize < 2) return null;
  const established = sampleSize >= PLATEAU_WINDOW;
  return {
    confidence: established ? "established" : "early",
    sessionsUsed: established ? PLATEAU_WINDOW : 2,
  };
}

export function trendConfidenceLabel(confidence: TrendConfidence): string {
  return confidence === "established" ? "Well-established" : "Early signal";
}

/**
 * "Early signal · Based on your last 2 sessions" style caption for an
 * ExerciseStatus reading — pairs the confidence tier with exactly how
 * many sessions computeExerciseStatusFromValues actually compared. Null
 * below 2 sessions, matching getTrendConfidence.
 */
export function formatStatusConfidence(sampleSize: number): string | null {
  const info = getTrendConfidence(sampleSize);
  if (!info) return null;
  return `${trendConfidenceLabel(info.confidence)} · Based on your last ${info.sessionsUsed} sessions`;
}

/**
 * Single source of truth for how each ExerciseStatus reads and looks —
 * shared by Profile's Current Focus card, its Recent Progress list, and
 * the Exercise Detail page's chart header, so a future wording or glyph
 * change happens in one place rather than three. `tone` is a Tailwind
 * text-color class, not a raw color, matching how the rest of this file
 * (formatPRValue etc.) stays presentation-agnostic apart from this one
 * intentionally UI-facing export.
 */
export const EXERCISE_STATUS_COPY: Record<
  ExerciseStatus,
  { icon: string; label: string; tone: string }
> = {
  "needs-more-data": { icon: "•", label: "Needs more data", tone: "text-muted-foreground" },
  improving: { icon: "↗", label: "Improving", tone: "text-primary" },
  declining: { icon: "↘", label: "Lower than last time", tone: "text-muted-foreground" },
  plateauing: { icon: "⏸", label: "Plateauing", tone: "text-muted-foreground" },
  stable: { icon: "→", label: "Stable", tone: "text-muted-foreground" },
};

export interface CardioTrend {
  direction: "improving" | "declining" | "steady";
  previous: number;
  latest: number;
  changePercent: number;
}

/**
 * Compares the two most recent cardio rate values using the convention's
 * meaning of "better": lower is better for pace, higher is better for speed
 * and rate.
 */
export function getCardioTrend(
  schema: ExerciseLoggingSchema,
  previous: number,
  latest: number,
): CardioTrend {
  const lowerIsBetter = schema.paceConvention?.style === "pace";
  const changePercent = previous === 0 ? 0 : ((latest - previous) / previous) * 100;

  if (latest === previous) {
    return { direction: "steady", previous, latest, changePercent: 0 };
  }

  const improved = lowerIsBetter ? latest < previous : latest > previous;
  return {
    direction: improved ? "improving" : "declining",
    previous,
    latest,
    changePercent: Math.abs(changePercent),
  };
}

/**
 * Returns a concise, user-facing insight from the two most recent cardio
 * sessions. The percentage is intentionally rounded to one decimal place;
 * no comparison is shown when there is only one session.
 */
export function formatCardioInsight(schema: ExerciseLoggingSchema, trend: CardioTrend): string {
  const metric =
    schema.paceConvention?.style === "pace"
      ? "pace"
      : schema.paceConvention?.style === "rate"
        ? "rate"
        : "speed";

  if (trend.direction === "steady") {
    return `Your ${metric} is unchanged from your previous session.`;
  }

  const verb = trend.direction === "improving" ? "faster" : "slower";
  return `Your ${metric} is ${trend.changePercent.toFixed(1)}% ${verb} than your previous session.`;
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

/** Floating point tolerance for weight equality — set entry is typically
 *  stepped in 2.5kg increments, so this only exists to absorb rounding,
 *  not to treat genuinely different weights as a match. */
const WEIGHT_MATCH_EPSILON = 0.01;

/**
 * Expected rep range for the Nth set (0-indexed) of an exercise, from
 * the observed range of reps logged at that exact set position across a
 * rolling window of recent past sessions of the same exercise —
 * "recentSessionData" is that window, one entry per session, each a
 * list of that session's completed sets' {weight, reps} in order.
 *
 * Weight-matched against currentWeight: a session's set only counts as
 * an observation if it was logged at (near enough) the same weight
 * you're about to lift. Without this, an exercise you load differently
 * session to session (e.g. 10 reps heavy, 20 reps light) produces a
 * technically-true but useless "usually 10–20" range that doesn't
 * describe what to expect at today's weight. Sessions at other weights
 * are simply excluded rather than blended in — a smaller but honest
 * range beats a wider misleading one.
 *
 * Needs at least 2 historical values at this exact position *and*
 * weight to report anything — same "don't assert a confident-looking
 * range from thin data" floor as computeExerciseStatusFromValues'
 * minimum sample size, just a flat 2 rather than that function's
 * early/established split (there's no larger "established" tier here —
 * with a 5-session window this can never see more than 5 data points
 * regardless, and weight-matching only ever narrows that further).
 */
export function computeExpectedRepRange(
  recentSessionData: { weight: number; reps: number }[][],
  setIndex: number,
  currentWeight: number,
): { min: number; max: number } | null {
  const observed = recentSessionData
    .map((session) => session[setIndex])
    .filter(
      (entry): entry is { weight: number; reps: number } =>
        entry != null &&
        entry.reps > 0 &&
        Math.abs(entry.weight - currentWeight) < WEIGHT_MATCH_EPSILON,
    )
    .map((entry) => entry.reps);
  if (observed.length < 2) return null;
  return { min: Math.min(...observed), max: Math.max(...observed) };
}

/**
 * Distinct exercise ids appearing in completed sets, most-recently-first
 * (relies on `workouts` already being sorted newest-first). Extracted
 * here from what was originally Overview-only route-local code once
 * Insights → Strength's Exercise Progression list needed the exact same
 * "which exercises has this person actually been training lately" scan
 * — a second, genuinely independent caller, not a speculative shared
 * abstraction built in advance.
 */
export function getRecentlyTrainedExercises(workouts: Workout[], count: number): string[] {
  const seen: string[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.sets.some((s) => s.completed) && !seen.includes(ex.exerciseId)) {
        seen.push(ex.exerciseId);
      }
    }
    if (seen.length >= count) break;
  }
  return seen.slice(0, count);
}

export interface ExerciseStatusSummary {
  status: ExerciseStatus;
  best: number | null;
  metricKind: MetricKind;
  distanceUnit?: DistanceUnit;
  sampleSize: number;
  /** Session values, most-recent-first — values[0] is the most recent
   *  session, values[1] the one before it. Used for a "15 → 17.5 kg"
   *  style evidence line without a second pass over `workouts`. */
  values: number[];
}

/** One exercise's status derived from its own logged history — same
 *  extraction reasoning as getRecentlyTrainedExercises above. */
export function computeExerciseStatus(
  workouts: Workout[],
  exerciseId: string,
): ExerciseStatusSummary {
  const def = getExercise(exerciseId);
  const schema = getExerciseLoggingSchema(def);

  const sessionSets: WorkoutSet[][] = [];
  for (const w of workouts) {
    const log = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!log) continue;
    const completed = log.sets.filter((s) => s.completed);
    if (completed.length > 0) sessionSets.push(completed);
  }

  const metricKind = getPrimaryMetricKind(schema);
  const distanceUnit = schema.distanceUnit;
  const values = sessionSets
    .map((sets) => getPrimaryMetric(metricKind, sets))
    .filter((v): v is number => v != null);

  const best = values.length > 0 ? Math.max(...values) : null;
  const status = computeExerciseStatusFromValues(values);
  return { status, best, metricKind, distanceUnit, sampleSize: values.length, values };
}
