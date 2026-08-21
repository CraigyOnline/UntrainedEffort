import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { getExercise, type MuscleGroup } from "@/lib/exercises";
import {
  computeWorkoutDisplayStats,
  formatCardioActivity,
  type CardioActivityStats,
} from "@/lib/workoutStats";
import {
  computeExerciseStatus,
  getRecentlyTrainedExercises,
  getTrendConfidence,
  formatMetricValue,
  EXERCISE_STATUS_COPY,
  type ExerciseStatus,
} from "@/lib/exerciseProgress";
import { computeAggregateMuscleIntensity } from "@/lib/muscles";
import { selectHomeGreeting } from "@/lib/homeGreetings";
import { selectTrainingSignal } from "@/lib/trainingSignal";
import { formatTimeTrained } from "@/features/history/duration";
import { PageHeader } from "@/components/PageHeader";
import { MiniConsistencyHeatmap } from "@/components/MiniConsistencyHeatmap";
import { LastWorkoutCard } from "@/components/LastWorkoutCard";
import { MuscleMap } from "@/components/MuscleMap";
import { OverviewTotals } from "@/features/history/OverviewTotals";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({
    meta: [
      { title: "Overview · Untrained Effort" },
      { name: "description", content: "Your workout stats, streak and history." },
    ],
  }),
  component: OverviewPage,
});

/** §5's "returning after a gap" modifier trigger. */
const GAP_THRESHOLD_DAYS = 7;

/** Muscle Activity's own eligibility floor — at least this many workouts
 *  within MUSCLE_ACTIVITY_WINDOW_DAYS, not "N workouts ever, whenever
 *  they happened." Replaces the old blanket workouts.length>=4 check,
 *  which would happily unlock this section for four workouts spread
 *  across a year. See the redesign review's point 6. */
const MUSCLE_ACTIVITY_WINDOW_DAYS = 30;
const MUSCLE_ACTIVITY_MIN_SESSIONS = 3;

/** Number of recently-trained exercises scanned for Training Signal's
 *  improvement candidate — broadened from "just the most recent one" per
 *  the redesign review's point 4. Recent Progress shows the top 3 of
 *  this same set. */
const RECENT_EXERCISE_SCAN_COUNT = 6;

function OverviewPage() {
  const navigate = useNavigate();

  const workouts = useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return getDb().workouts.orderBy("startedAt").reverse().toArray();
  }, []);

  const prRecords = useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return getDb().prHistory.toArray();
  }, []) as PRRecord[] | undefined;

  const greeting = useLiveQuery(() => selectHomeGreeting(), []);

  const lastWorkout = workouts?.[0] ?? null;

  // A data-driven suppression of one component (not a layout branch, see
  // §4). The hero line itself needs no change here: selectHomeGreeting()
  // already only falls through to its gap-tier copy when momentum/streak
  // don't apply, which is naturally exactly this same condition — no
  // second gap check duplicated there.
  const isReturningAfterGap =
    !!lastWorkout && Date.now() - lastWorkout.startedAt > GAP_THRESHOLD_DAYS * 86400000;

  const trainedDays = useMemo(() => computeTrainedDaySet(workouts ?? []), [workouts]);

  const stats = useMemo(() => computeCardioStats(workouts ?? []), [workouts]);

  const recentWorkoutsForMuscle = useMemo(() => {
    const since = Date.now() - MUSCLE_ACTIVITY_WINDOW_DAYS * 86400000;
    return (workouts ?? []).filter((w) => w.startedAt >= since);
  }, [workouts]);
  const muscleActivityEligible = recentWorkoutsForMuscle.length >= MUSCLE_ACTIVITY_MIN_SESSIONS;
  const intensity = useMemo(
    () => computeAggregateMuscleIntensity(recentWorkoutsForMuscle),
    [recentWorkoutsForMuscle],
  );

  const recentExerciseIds = useMemo(
    () => getRecentlyTrainedExercises(workouts ?? [], RECENT_EXERCISE_SCAN_COUNT),
    [workouts],
  );

  // Every recently-trained exercise's status, not just the single most
  // recent one — this is what Training Signal now scans (point 4), and
  // Recent Progress shows the top 3 of. Carries `values` too (beyond what
  // RecentExerciseStatus itself declares) so Recent Progress's evidence
  // line doesn't need a second computeExerciseStatus pass per exercise.
  const recentExerciseStatuses = useMemo(() => {
    return recentExerciseIds.map((exerciseId) => {
      const def = getExercise(exerciseId);
      const { status, best, metricKind, distanceUnit, sampleSize, values } = computeExerciseStatus(
        workouts ?? [],
        exerciseId,
      );
      const lastTrainedAt = (workouts ?? []).find((w) =>
        w.exercises.some((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.completed)),
      )?.startedAt;
      return {
        exerciseId,
        name: def?.name ?? exerciseId,
        status,
        best,
        metricKind,
        distanceUnit,
        sampleSize,
        lastTrainedAt: lastTrainedAt ?? 0,
        values,
      };
    });
  }, [recentExerciseIds, workouts]);

  const recentProgress = useMemo(() => {
    return recentExerciseStatuses
      .filter((ex) => getTrendConfidence(ex.sampleSize) !== null)
      .slice(0, 3)
      .map((ex) => {
        const [current, previous] = ex.values;
        const evidence =
          current != null && previous != null
            ? `${formatMetricValue(ex.metricKind, previous, ex.distanceUnit)} → ${formatMetricValue(ex.metricKind, current, ex.distanceUnit)}`
            : null;
        return { ...ex, evidence };
      });
  }, [recentExerciseStatuses]);

  const trainingSignal = useMemo(
    () => selectTrainingSignal(workouts ?? [], prRecords ?? [], recentExerciseStatuses),
    [workouts, prRecords, recentExerciseStatuses],
  );

  const hasWorkouts = !!workouts?.length;

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <PageHeader eyebrow="Overview">
        {greeting && <p className="text-lg font-semibold leading-snug">{greeting.headline}</p>}
      </PageHeader>

      {!hasWorkouts && workouts !== undefined && (
        <button
          onClick={() => navigate({ to: "/workout" })}
          className="rounded-2xl bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground active:opacity-90"
        >
          Start a workout
        </button>
      )}

      {hasWorkouts && lastWorkout && (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Last workout
          </p>
          <LastWorkoutCard workout={lastWorkout} />
        </section>
      )}

      {hasWorkouts && (!isReturningAfterGap || trainingSignal) && (
        <div className="flex gap-3">
          {trainingSignal && (
            <section className={`flex flex-col ${isReturningAfterGap ? "w-full" : "flex-1"}`}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Training signal
              </p>
              <div
                className="flex flex-1 flex-col justify-center rounded-2xl p-4"
                style={{
                  backgroundColor: "color-mix(in oklch, var(--color-primary) 12%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--color-primary) 35%, transparent)",
                }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                  {trainingSignal.headline}
                </p>
                {trainingSignal.detail && (
                  <p className="mt-1 text-xs text-muted-foreground">{trainingSignal.detail}</p>
                )}
              </div>
            </section>
          )}

          {!isReturningAfterGap && (
            <section className={`flex flex-col ${trainingSignal ? "flex-1" : "w-full"}`}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Consistency
              </p>
              <div className="flex-1 rounded-2xl bg-card p-4">
                <MiniConsistencyHeatmap trainedDays={trainedDays} weeks={8} />
              </div>
            </section>
          )}
        </div>
      )}

      {hasWorkouts && (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Training at a glance
          </p>
          <OverviewTotals workouts={workouts ?? []} />
        </section>
      )}

      {hasWorkouts && muscleActivityEligible && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Muscle activity
            </p>
            <button
              onClick={() => navigate({ to: "/history/insights" })}
              className="text-xs font-medium text-primary active:opacity-70"
            >
              View muscle activity →
            </button>
          </div>
          <div className="rounded-2xl bg-card p-4">
            <MuscleMap intensity={intensity} height={110} className="mx-auto" />
            <div className="mt-3 flex flex-col gap-2">
              {topMuscles(intensity).map(({ muscle, value }) => (
                <div key={muscle} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{muscle}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasWorkouts && recentProgress.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent progress
          </p>
          <div className="flex flex-col gap-2.5">
            {recentProgress.map((row) => (
              <div
                key={row.exerciseId}
                onClick={() => navigate({ to: "/exercise/$id", params: { id: row.exerciseId } })}
                className="flex items-center justify-between gap-3 cursor-pointer active:opacity-70"
              >
                <span className="truncate text-sm">{row.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {row.evidence && (
                    <span className="text-xs text-muted-foreground">{row.evidence}</span>
                  )}
                  <StatusArrow status={row.status} />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate({ to: "/exercises" })}
            className="mt-2 text-xs font-medium text-primary active:opacity-70"
          >
            See all progress →
          </button>
        </section>
      )}

      {hasWorkouts && stats.cardio.sessions > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Cardio
            </p>
            <button
              onClick={() => navigate({ to: "/history/insights" })}
              className="text-xs font-medium text-primary active:opacity-70"
            >
              View cardio →
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {stats.cardio.activities.slice(0, 3).map((activity) => (
              <div key={activity.exerciseId} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{activity.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatOverviewCardioActivity(activity)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Top 3 muscles by intensity, Cardio excluded — same convention Insights'
 *  full Balance Snapshot uses for its own entries filter. */
function topMuscles(intensity: Partial<Record<MuscleGroup, number>>) {
  return (Object.entries(intensity) as [MuscleGroup, number][])
    .filter(([m]) => m !== "Cardio")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([muscle, value]) => ({ muscle, value }));
}

function StatusArrow({ status }: { status: ExerciseStatus }) {
  const { icon, tone } = EXERCISE_STATUS_COPY[status];
  return <span className={`shrink-0 text-sm font-medium ${tone}`}>{icon}</span>;
}

function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeTrainedDaySet(workouts: Workout[]): Set<number> {
  return new Set(workouts.map((w) => dayStart(w.startedAt)));
}

/** formatCardioActivity can return an empty string for an activity with
 *  only duration logged (no distance/pace) — falls back to a plain
 *  duration string rather than rendering blank. Same fallback the old
 *  Profile page's cardio section had. */
function formatOverviewCardioActivity(activity: CardioActivityStats): string {
  return formatCardioActivity(activity) || formatTimeTrained(activity.durationSec);
}

function computeCardioStats(workouts: Workout[]) {
  const cardioByExercise = new Map<string, CardioActivityStats>();
  let cardioSessions = 0;
  let cardioDurationSec = 0;

  for (const workout of workouts) {
    const display = computeWorkoutDisplayStats(workout.exercises);
    if (display.cardioActivities.length === 0) continue;

    cardioSessions += 1;
    for (const activity of display.cardioActivities) {
      cardioDurationSec += activity.durationSec;
      const existing = cardioByExercise.get(activity.exerciseId);
      if (!existing) {
        cardioByExercise.set(activity.exerciseId, { ...activity });
        continue;
      }
      existing.durationSec += activity.durationSec;
      if (activity.distance != null && activity.distanceUnit === existing.distanceUnit) {
        existing.distance = (existing.distance ?? 0) + activity.distance;
      }
    }
  }

  return {
    cardio: {
      sessions: cardioSessions,
      durationSec: cardioDurationSec,
      activities: Array.from(cardioByExercise.values()).sort(
        (a, b) => b.durationSec - a.durationSec,
      ),
    },
  };
}
