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

export interface TrainingSignal {
  headline: string;
  detail: string | null;
}

/** Whatever the caller already knows about the most recently trained
 *  exercise — Overview already derives this for Recent Progress, so this
 *  engine takes it as input rather than re-deriving per-exercise status a
 *  second time (see the redesign spec §0's "reuse before duplicating"
 *  guardrail). */
export interface CurrentFocus {
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
  currentFocus: CurrentFocus | null,
): TrainingSignal | null {
  return (
    selectMilestoneSignal(prRecords) ??
    selectImprovementSignal(currentFocus) ??
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

function selectImprovementSignal(currentFocus: CurrentFocus | null): TrainingSignal | null {
  if (!currentFocus || currentFocus.status !== "improving") return null;
  if (Date.now() - currentFocus.lastTrainedAt > IMPROVEMENT_WINDOW_DAYS * DAY_MS) return null;

  const valueText =
    currentFocus.best != null
      ? formatMetricValue(currentFocus.metricKind, currentFocus.best, currentFocus.distanceUnit)
      : null;
  const confidence = getTrendConfidence(currentFocus.sampleSize);
  const confidenceText = confidence
    ? `${trendConfidenceLabel(confidence.confidence)} · based on your last ${confidence.sessionsUsed} sessions`
    : null;

  return {
    headline: `${currentFocus.name} ↑ Moving well`,
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

function selectConsistencySignal(workouts: Workout[]): TrainingSignal | null {
  const weekAgo = Date.now() - 7 * DAY_MS;
  const thisWeek = workouts.filter((w) => w.startedAt >= weekAgo).length;
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
