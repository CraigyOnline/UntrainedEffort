import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { getDb, type Workout, type WorkoutSet, type PRRecord } from "@/lib/db";
import {
  getExercise,
  getExerciseLoggingSchema,
  type MuscleGroup,
  type DistanceUnit,
} from "@/lib/exercises";
import {
  computeWorkoutDisplayStats,
  formatCardioActivity,
  type CardioActivityStats,
} from "@/lib/workoutStats";
import {
  getPrimaryMetric,
  getPrimaryMetricKind,
  computeExerciseStatusFromValues,
  EXERCISE_STATUS_COPY,
  type MetricKind,
  type ExerciseStatus,
} from "@/lib/exerciseProgress";
import { selectHomeGreeting } from "@/lib/homeGreetings";
import { selectTrainingSignal } from "@/lib/trainingSignal";
import { formatTimeTrained } from "@/features/history/duration";
import { MuscleMap } from "@/components/MuscleMap";
import { WeekActivityStrip } from "@/components/WeekActivityStrip";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { Totals } from "@/features/history/Totals";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({
    meta: [
      { title: "Overview · Untrained Effort" },
      { name: "description", content: "Your workout stats, streak and history." },
    ],
  }),
  component: OverviewPage,
});

/** Below this many logged sessions, trend/status data is too thin to
 *  produce a genuine conclusion — matches the "established" threshold
 *  already used by getTrendConfidence/volumeTrendConfidence elsewhere in
 *  this codebase (exerciseProgress.ts), reused rather than re-decided
 *  here. See the redesign spec §4's "1–3 workouts" state. */
const ESTABLISHED_THRESHOLD = 4;

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

  const trainedDays = useMemo(() => computeTrainedDaySet(workouts ?? []), [workouts]);

  // Fixed trailing 30-day window — compact teaser, no user-facing range
  // picker (that belongs to the full interactive map, see the flagged gap
  // below). Matches the old default range this page used to open on.
  const intensity = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    return computeMuscleIntensity((workouts ?? []).filter((w) => w.startedAt >= since));
  }, [workouts]);

  const stats = useMemo(() => computeCardioStats(workouts ?? []), [workouts]);

  const recentExerciseIds = useMemo(
    () => getRecentlyTrainedExercises(workouts ?? [], 6),
    [workouts],
  );

  const currentFocus = useMemo(() => {
    const exerciseId = recentExerciseIds[0];
    if (!exerciseId) return null;
    const def = getExercise(exerciseId);
    const { status, best, metricKind, distanceUnit, sampleSize } = computeExerciseStatus(
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
    };
  }, [recentExerciseIds, workouts]);

  const recentProgress = useMemo(() => {
    return recentExerciseIds.slice(0, 3).map((exerciseId) => {
      const def = getExercise(exerciseId);
      const { status, best, metricKind, distanceUnit } = computeExerciseStatus(
        workouts ?? [],
        exerciseId,
      );
      return { exerciseId, name: def?.name ?? exerciseId, status, best, metricKind, distanceUnit };
    });
  }, [recentExerciseIds, workouts]);

  const trainingSignal = useMemo(
    () => selectTrainingSignal(workouts ?? [], prRecords ?? [], currentFocus),
    [workouts, prRecords, currentFocus],
  );

  const hasWorkouts = !!workouts?.length;
  const isEstablished = (workouts?.length ?? 0) >= ESTABLISHED_THRESHOLD;

  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      {/* HERO + WEEKLY STRIP */}
      <header className="flex flex-col gap-3">
        {greeting && <p className="text-lg font-semibold leading-snug">{greeting.headline}</p>}
        {hasWorkouts && <WeekActivityStrip trainedDays={trainedDays} />}
      </header>

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
          <div
            onClick={() => navigate({ to: "/history/$id", params: { id: String(lastWorkout.id) } })}
            className="cursor-pointer active:scale-[0.99] transition"
          >
            <WorkoutSummary
              name={lastWorkout.name}
              durationSec={lastWorkout.durationSec}
              exercises={lastWorkout.exercises}
              showName
            />
          </div>
        </section>
      )}

      {hasWorkouts && isEstablished && trainingSignal && (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Training signal
          </p>
          <div
            className="rounded-2xl p-4"
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

      {hasWorkouts && (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Training at a glance
          </p>
          <Totals workouts={workouts ?? []} />
        </section>
      )}

      {hasWorkouts && isEstablished && (
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
            <MuscleMap intensity={intensity} className="mx-auto h-32 w-auto" />
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

      {hasWorkouts && isEstablished && recentProgress.length > 0 && (
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
                <StatusArrow status={row.status} />
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

      {hasWorkouts && isEstablished && stats.cardio.sessions > 0 && (
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

/** Top 3 muscles by intensity, Cardio excluded — same convention as the
 *  old Training Balance Snapshot's `entries` filter. */
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

function computeMuscleIntensity(workouts: Workout[]) {
  const totals: Partial<Record<MuscleGroup, number>> = {};

  for (const w of workouts) {
    for (const e of w.exercises) {
      const def = getExercise(e.exerciseId);
      if (!def) continue;
      const completed = e.sets.filter((s) => s.completed).length;
      totals[def.muscle] = (totals[def.muscle] ?? 0) + completed;
      for (const sec of def.secondary ?? []) {
        totals[sec] = (totals[sec] ?? 0) + completed * 0.5;
      }
    }
  }

  const max = Math.max(1, ...Object.values(totals));
  const normalized: Partial<Record<MuscleGroup, number>> = {};
  for (const k of Object.keys(totals) as MuscleGroup[]) {
    normalized[k] = (totals[k] ?? 0) / max;
  }
  return normalized;
}

/** Distinct exercise ids appearing in completed sets, most-recently-first. */
function getRecentlyTrainedExercises(workouts: Workout[], count: number): string[] {
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

function computeExerciseStatus(
  workouts: Workout[],
  exerciseId: string,
): {
  status: ExerciseStatus;
  best: number | null;
  metricKind: MetricKind;
  distanceUnit?: DistanceUnit;
  sampleSize: number;
} {
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
  return { status, best, metricKind, distanceUnit, sampleSize: values.length };
}
