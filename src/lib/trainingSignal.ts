import type { Workout, PRRecord } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, type DistanceUnit } from "@/lib/exercises";
import {
  formatPRValue,
  formatPRDelta,
  formatMetricValue,
  getTrendConfidence,
  trendConfidenceLabel,
  type ExerciseStatus,
  type MetricKind,
} from "@/lib/exerciseProgress";
import { computeVolumeTrend, computeWorkoutDisplayStats } from "@/lib/workoutStats";
import { getCalendarWeekStart } from "@/lib/format";

export interface TrainingSignal {
  headline: string;
  detail: string | null;
}

/** One recently-trained exercise's status, as the caller already derives
 *  it for Recent Progress — this engine takes the whole recent set (not
 *  just the single most-recently-trained one) so a genuine improvement
 *  three exercises back isn't invisible just because today's exercise is
 *  flat. See the redesign review's point 4. */
export interface RecentExerciseStatus {
  exerciseId: string;
  name: string;
  status: ExerciseStatus;
  best: number | null;
  metricKind: MetricKind;
  distanceUnit?: DistanceUnit;
  lastTrainedAt: number;
  sampleSize: number;
}

const DAY_MS = 86400000;

/**
 * Starting points, not final tuning — see the redesign spec §6. Each
 * window exists specifically to stop a stale result from outranking
 * something currently true: a three-week-old PR must not keep beating a
 * live four-week volume trend just because "milestone" sits higher in
 * the priority list below. Confirm these against real usage patterns
 * before treating them as settled.
 */
const PR_WINDOW_DAYS = 7;
const IMPROVEMENT_WINDOW_DAYS = 10;
const CARDIO_WINDOW_DAYS = 14;
const CARDIO_MIN_SESSIONS = 2;

/** Mirrors homeGreetings.ts's own "momentum" threshold (3+ workouts in
 *  the trailing 7 days) — same number, kept as an independent local
 *  computation rather than an import. homeGreetings.ts and
 *  completionMessages.ts already don't share internals with each other;
 *  this is a third message-selection engine of the same kind, so it
 *  follows that existing precedent rather than reaching into either. */
const CONSISTENCY_MIN_THIS_WEEK = 3;

/**
 * Selects exactly one Training Signal, or none. Priority order encodes
 * the eligibility gate *before* the ranking — each selectX function
 * below returns null the moment its own candidate has expired, so an
 * expired higher-priority signal never blocks a currently-true
 * lower-priority one from being reached.
 */
export function selectTrainingSignal(
  workouts: Workout[],
  prRecords: PRRecord[],
  recentExercises: RecentExerciseStatus[],
): TrainingSignal | null {
  return (
    selectMilestoneSignal(prRecords) ??
    selectImprovementSignal(recentExercises) ??
    selectTrendSignal(workouts) ??
    selectConsistencySignal(workouts) ??
    selectCardioSignal(workouts) ??
    null
  );
}

function selectMilestoneSignal(prRecords: PRRecord[]): TrainingSignal | null {
  const cutoff = Date.now() - PR_WINDOW_DAYS * DAY_MS;
  const recent = prRecords
    .filter((p) => p.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);
  const pr = recent[0];
  if (!pr) return null;

  const def = getExercise(pr.exerciseId);
  const schema = getExerciseLoggingSchema(def);
  const name = def?.name ?? pr.exerciseId;
  const valueText = formatPRValue(pr.type, pr.value, schema);
  const isFirstEver = pr.previousBest === 0;

  return {
    headline: `${name} — new best`,
    detail: isFirstEver ? valueText : `${valueText} · ${formatPRDelta(pr.type, pr.delta, schema)}`,
  };
}

/**
 * Scans every recently-trained exercise, not just the most recent one —
 * the fix for point 4. Among exercises that are both "improving" and
 * still within the recency window, prefers established evidence over
 * early evidence, then the most recently trained. This is a genuine
 * "what's the most meaningful thing happening" scan now, not "is
 * yesterday's exercise doing well."
 */
function selectImprovementSignal(recentExercises: RecentExerciseStatus[]): TrainingSignal | null {
  const now = Date.now();
  const eligible = recentExercises.filter(
    (ex) => ex.status === "improving" && now - ex.lastTrainedAt <= IMPROVEMENT_WINDOW_DAYS * DAY_MS,
  );
  if (eligible.length === 0) return null;

  const ranked = eligible
    .map((ex) => ({ ex, confidence: getTrendConfidence(ex.sampleSize) }))
    .sort((a, b) => {
      const aEstablished = a.confidence?.confidence === "established" ? 1 : 0;
      const bEstablished = b.confidence?.confidence === "established" ? 1 : 0;
      if (aEstablished !== bEstablished) return bEstablished - aEstablished;
      return b.ex.lastTrainedAt - a.ex.lastTrainedAt;
    });
  const { ex, confidence } = ranked[0];

  const valueText =
    ex.best != null ? formatMetricValue(ex.metricKind, ex.best, ex.distanceUnit) : null;
  const confidenceText = confidence
    ? `${trendConfidenceLabel(confidence.confidence)} · based on your last ${confidence.sessionsUsed} sessions`
    : null;

  return {
    headline: `${ex.name} ↑ Moving well`,
    detail: [valueText, confidenceText].filter(Boolean).join(" · ") || null,
  };
}

function selectTrendSignal(workouts: Workout[]): TrainingSignal | null {
  const trend = computeVolumeTrend(workouts);
  if (!trend || trend.trend !== "up") return null;

  return {
    headline: "Volume ↑ Increasing",
    detail: `${trend.recentCount} workouts vs. ${trend.priorCount} the 4 weeks before`,
  };
}

/** Calendar week (Monday–Sunday), same definition getCalendarWeekStart
 *  gives the Week Activity Strip — not a rolling 7-day window, so this
 *  never disagrees with what the strip on the same screen is showing. */
function selectConsistencySignal(workouts: Workout[]): TrainingSignal | null {
  const weekStart = getCalendarWeekStart();
  const thisWeek = workouts.filter((w) => w.startedAt >= weekStart).length;
  if (thisWeek < CONSISTENCY_MIN_THIS_WEEK) return null;

  return {
    headline: "You're training consistently",
    detail: `${thisWeek} sessions this week`,
  };
}

function selectCardioSignal(workouts: Workout[]): TrainingSignal | null {
  const windowStart = Date.now() - CARDIO_WINDOW_DAYS * DAY_MS;
  const recentCardio = workouts.filter(
    (w) =>
      w.startedAt >= windowStart &&
      computeWorkoutDisplayStats(w.exercises).cardioActivities.length > 0,
  );
  if (recentCardio.length < CARDIO_MIN_SESSIONS) return null;

  return {
    headline: "Cardio is becoming part of your routine",
    detail: `${recentCardio.length} cardio sessions in the last ${CARDIO_WINDOW_DAYS} days`,
  };
}
