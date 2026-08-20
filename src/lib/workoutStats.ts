import type { CircuitStation, Workout } from "@/lib/db";
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
import { compareTrend, type Trend, type TrendConfidence } from "@/lib/exerciseProgress";

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
  /** Count of exercises classified as strength (not cardio, not interval).
   *  Exists alongside cardioActivities.length/intervalActivities.length so
   *  a "mixed" workout's dominant modality can be resolved by exercise
   *  count — see computeDominantSignature. */
  strengthExerciseCount: number;
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
  let strengthExerciseCount = 0;
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
      strengthExerciseCount += 1;
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
    strengthExerciseCount,
  };
}

/**
 * Resolves which visual signature (muscle map vs. cardio signature) should
 * represent a workout in compact UI slots (history card thumbnail, workout
 * summary). Only meaningful for "mixed" workouts — pure strength/cardio/
 * interval workouts already know their own answer from `mode` — but this
 * accepts any WorkoutDisplayStats so call sites don't need a branch before
 * calling it.
 *
 * Dominance is decided by exercise/station count (strengthExerciseCount vs.
 * cardioActivities.length + intervalActivities.length) rather than duration
 * or volume: strength exercises have no per-exercise duration tracked
 * today, and lifted volume (kg) isn't comparable to cardio's distance/
 * duration on the same axis. Ties favor strength.
 */
export function computeDominantSignature(stats: WorkoutDisplayStats): "strength" | "cardio" {
  if (stats.mode === "strength") return "strength";
  if (stats.mode === "cardio" || stats.mode === "interval") return "cardio";

  const cardioCount = stats.cardioActivities.length + stats.intervalActivities.length;
  return stats.strengthExerciseCount >= cardioCount ? "strength" : "cardio";
}

/**
 * Chooses which CardioSignature pattern ("steady" vs "interval") best
 * represents a workout once computeDominantSignature has resolved to
 * "cardio". Pure "cardio" and "interval" modes already know their answer
 * from mode alone; this only does real work for "mixed" workouts that
 * turn out to be cardio-dominant while containing a combination of plain
 * cardio and interval activities (hasCardio + hasInterval, no strength —
 * still classified "mixed" since modalityCount > 1 counts any two of the
 * three). Ties favor "steady" as the more common case.
 */
export function resolveCardioPattern(stats: WorkoutDisplayStats): "steady" | "interval" {
  if (stats.mode === "interval") return "interval";
  if (stats.mode === "cardio") return "steady";
  return stats.intervalActivities.length > stats.cardioActivities.length ? "interval" : "steady";
}

/**
 * The circuit counterpart to computeDominantSignature — resolves which
 * signature (muscle map vs. cardio) represents a circuit by station
 * composition, same tie-breaking (favors strength) as the regular-workout
 * version. Circuits have no WorkoutDisplayStats of their own (stations,
 * not exercises), hence a separate function rather than an overload.
 * Shared by CircuitSummary (history detail screen) and the workout-complete
 * screen so neither carries its own copy of this logic.
 */
export function computeDominantCircuitSignature(stations: CircuitStation[]): "strength" | "cardio" {
  const cardioCount = stations.filter((s) => {
    const def = getExercise(s.exerciseId);
    return def ? isCardio(def) : false;
  }).length;
  const strengthCount = stations.length - cardioCount;
  return cardioCount > strengthCount ? "cardio" : "strength";
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

/**
 * Rep-range training goal — a different axis entirely from WorkoutMode's
 * "mixed" (which is about modality: strength vs cardio vs interval).
 * This is purely about rep ranges *within* resistance training, so a
 * workout can independently be WorkoutMode "strength" and SessionGoal
 * "mixed" (e.g. heavy triples on one lift, higher-rep burnout sets on
 * another) — the two "mixed"s are unrelated and can disagree.
 */
export type SessionGoal = "strength" | "hypertrophy" | "endurance" | "mixed";

/**
 * Classifies a workout's rep-range emphasis from its completed sets:
 * Strength (1-5 reps), Hypertrophy (6-12), Endurance (13+) — standard
 * resistance-training convention. "Mixed" when no range holds a clear
 * (>50%) majority rather than forcing a label onto a genuinely blended
 * session.
 *
 * Only resistance-tracked sets count — same schema.weight !== "hidden"
 * rule computeExerciseVolume (workoutIntegrity.ts) uses, so cardio never
 * contributes. Unilateral sets count each side's reps separately, same
 * as relevantPRValues' "reps" PR type — one performance, one data point,
 * regardless of which side.
 *
 * Returns null below a minimum sample size (3 qualifying performances)
 * rather than confidently labeling a session from a couple of stray
 * sets, and for an all-cardio workout, which has nothing to classify.
 */
export function detectSessionGoal(exercises: Workout["exercises"]): SessionGoal | null {
  const buckets = { strength: 0, hypertrophy: 0, endurance: 0 };
  let total = 0;

  for (const ex of exercises) {
    const def = getExercise(ex.exerciseId);
    if (!def) continue;
    const schema = getExerciseLoggingSchema(def);
    if (schema.weight === "hidden") continue;

    for (const s of ex.sets) {
      if (!s.completed) continue;
      for (const perf of setPerformances(s)) {
        if (perf.reps <= 0) continue;
        total += 1;
        if (perf.reps <= 5) buckets.strength += 1;
        else if (perf.reps <= 12) buckets.hypertrophy += 1;
        else buckets.endurance += 1;
      }
    }
  }

  if (total < 3) return null;

  const [topGoal, topCount] = (Object.entries(buckets) as [SessionGoal, number][]).reduce((a, b) =>
    b[1] > a[1] ? b : a,
  );
  return topCount / total > 0.5 ? topGoal : "mixed";
}

export type VolumePeriodGranularity = "week" | "month";

export interface PeriodBucket {
  /** Start of this period, ms since epoch — a rolling 7-day window start for
   *  "week", the first of the calendar month (local time) for "month". */
  periodStart: number;
  /** Exclusive end of this period, ms since epoch. */
  periodEnd: number;
  /** Short display label — "Jun 2" for a week, "Jun" for a month. */
  label: string;
}

export interface VolumePeriod {
  periodStart: number;
  label: string;
  volume: number;
}

/**
 * Builds a fixed number of period boundaries, oldest to newest, ending with
 * the period containing `now`. Shared by computeVolumeByPeriod and
 * muscles.ts's computeMuscleActivityByPeriod so both use identical bucket
 * boundaries and labels.
 *
 * "week" uses rolling 7-day windows counted back from `now` (matching the
 * "last 4 weeks vs. prior 4" language computeVolumeTrend already uses on
 * Profile) rather than calendar (Mon-Sun) weeks. "month" uses actual
 * calendar months instead — rolling 30-day windows would drift against the
 * month labels a chart would otherwise want to show.
 */
export function buildPeriodBuckets(
  granularity: VolumePeriodGranularity,
  periodCount: number,
  now: number = Date.now(),
): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];

  if (granularity === "week") {
    const dayMs = 86400000;
    const weekMs = 7 * dayMs;
    // Anchor the most recent bucket's end to the day after `now`'s local
    // day, so "today" always falls inside the last bucket regardless of
    // time-of-day.
    const endOfToday = new Date(now);
    endOfToday.setHours(24, 0, 0, 0);
    const windowEnd = endOfToday.getTime();

    for (let i = periodCount - 1; i >= 0; i--) {
      const periodStart = windowEnd - (i + 1) * weekMs;
      const periodEnd = periodStart + weekMs;
      const label = new Date(periodStart).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      buckets.push({ periodStart, periodEnd, label });
    }
  } else {
    const anchor = new Date(now);
    anchor.setDate(1);
    anchor.setHours(0, 0, 0, 0);

    for (let i = periodCount - 1; i >= 0; i--) {
      const start = new Date(anchor);
      start.setMonth(start.getMonth() - i);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const label = start.toLocaleDateString(undefined, { month: "short" });
      buckets.push({ periodStart: start.getTime(), periodEnd: end.getTime(), label });
    }
  }

  return buckets;
}

/**
 * Buckets total volume (same computeWorkoutStats().totalVolume used
 * everywhere else — circuit workouts contribute 0, matching their
 * exercises: [] convention) into a fixed number of periods, oldest to
 * newest, ending with the period containing `now`.
 *
 * Always returns exactly `periodCount` entries, zero-filled for any period
 * with no training — a quiet stretch should read as a dip on a chart, not
 * silently compress the x-axis.
 */
export function computeVolumeByPeriod(
  workouts: Workout[],
  granularity: VolumePeriodGranularity,
  periodCount: number,
  now: number = Date.now(),
): VolumePeriod[] {
  const totalsByWorkout = workouts.map((w) => ({
    startedAt: w.startedAt,
    volume: computeWorkoutStats(w.exercises).totalVolume,
  }));

  return buildPeriodBuckets(granularity, periodCount, now).map(
    ({ periodStart, periodEnd, label }) => ({
      periodStart,
      label,
      volume: totalsByWorkout
        .filter((w) => w.startedAt >= periodStart && w.startedAt < periodEnd)
        .reduce((acc, w) => acc + w.volume, 0),
    }),
  );
}

/**
 * Compares total volume in the last 4 weeks against the 4 weeks before
 * that. Returns null (caller should hide/omit) unless there's actual
 * training in both halves — otherwise this would just be reporting "you
 * hadn't started yet", not a real trend. recentCount/priorCount are
 * exposed alongside the trend so callers can show a confidence caption
 * stating exactly what was compared.
 *
 * Extracted here (previously duplicated identically in both the Overview
 * route and the History → Insights route) since both need the exact same
 * comparison — a second copy would drift the moment one of them changed.
 */
export function computeVolumeTrend(
  workouts: Workout[],
): { trend: Trend; recentCount: number; priorCount: number } | null {
  const weekMs = 7 * 86400000;
  const now = Date.now();
  const recentStart = now - 4 * weekMs;
  const priorStart = now - 8 * weekMs;

  const recent = workouts.filter((w) => w.startedAt >= recentStart);
  const prior = workouts.filter((w) => w.startedAt >= priorStart && w.startedAt < recentStart);
  if (recent.length === 0 || prior.length === 0) return null;

  const sum = (ws: Workout[]) =>
    ws.reduce((acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume, 0);

  return {
    trend: compareTrend(sum(prior), sum(recent)),
    recentCount: recent.length,
    priorCount: prior.length,
  };
}

/** Established only when BOTH halves clear this bar — a single unusually
 *  heavy or light session shouldn't be able to swing a whole half's sum
 *  on its own, so a thin half keeps the reading at "early" regardless of
 *  how solid the other half looks. */
export const VOLUME_TREND_ESTABLISHED_MIN = 3;

export function volumeTrendConfidence(recentCount: number, priorCount: number): TrendConfidence {
  return recentCount >= VOLUME_TREND_ESTABLISHED_MIN && priorCount >= VOLUME_TREND_ESTABLISHED_MIN
    ? "established"
    : "early";
}

/** Session count + total volume for an arbitrary set of workouts — the
 *  shared arithmetic behind both Overview's bare Totals snapshot and
 *  Insights' period-toggled Totals. Callers decide the period by
 *  filtering `workouts` before calling this. */
export function computeSessionsAndVolume(workouts: Workout[]): {
  sessions: number;
  volume: number;
} {
  return {
    sessions: workouts.length,
    volume: workouts.reduce((acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume, 0),
  };
}

function inCalendarMonth(w: Workout, year: number, month: number): boolean {
  const d = new Date(w.startedAt);
  return d.getFullYear() === year && d.getMonth() === month;
}

/** This calendar month vs the previous one, as sessions+volume pairs.
 *  Shared by Insights' Totals (period="month" caption) and its Training
 *  tab's promoted month-over-month comparison — both need the exact same
 *  "which workouts count as this month" filtering. */
export function computeMonthOverMonth(
  workouts: Workout[],
  now: number = Date.now(),
): {
  thisMonth: { sessions: number; volume: number };
  lastMonth: { sessions: number; volume: number };
} {
  const nowDate = new Date(now);
  const thisMonthWorkouts = workouts.filter((w) =>
    inCalendarMonth(w, nowDate.getFullYear(), nowDate.getMonth()),
  );
  const prevDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const lastMonthWorkouts = workouts.filter((w) =>
    inCalendarMonth(w, prevDate.getFullYear(), prevDate.getMonth()),
  );
  return {
    thisMonth: computeSessionsAndVolume(thisMonthWorkouts),
    lastMonth: computeSessionsAndVolume(lastMonthWorkouts),
  };
}
