import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, type ReactNode } from "react";
import { getDb, type Workout, type WorkoutSet } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { getPrimaryMetric, getPrimaryMetricKind, compareTrend, formatMetricValue, type Trend, type MetricKind } from "@/lib/exerciseProgress";
import { formatRelativeDate } from "@/lib/format";
import { Activity, TrendingUp, CalendarDays, BarChart3, Target, Flame } from "lucide-react";
import { MuscleMap } from "@/components/MuscleMap";
import { useDismissOnBack } from "@/lib/backHandler";

const MOTIVATIONAL_MESSAGES = [
  "Ready to crush today's session?",
  "Consistency beats talent. Let's work.",
  "No shortcuts. Just hard work.",
  "Earn your rest today.",
  "Make yourself proud.",
  "Small steps every day add up.",
  "Sweat now, shine later.",
  "The only bad workout is the one that didn't happen.",
] as const;

export const Route = createFileRoute("/_app/profile")({
  head: () => ({
    meta: [
      { title: "Profile · Untrained Effort" },
      {
        name: "description",
        content: "Your workout stats, streak and history.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();

  const workouts = useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return getDb().workouts.orderBy("startedAt").reverse().toArray();
  }, []);

  const lastWorkout = useLiveQuery(async () => {
    if (typeof window === "undefined") return null;
    const all = await getDb().workouts.orderBy("startedAt").reverse().limit(1).toArray();
    return all?.[0] ?? null;
  }, []);

  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [drilldownMuscle, setDrilldownMuscle] = useState<MuscleGroup | null>(null);

  const stats = useMemo(() => computeStats(workouts ?? []), [workouts]);
  const intensity = useMemo(() => computeMuscleIntensity(workouts ?? []), [workouts]);

  const todayKey = Math.floor(Date.now() / 86400000);

  const message = useMemo(() => {
    if (!workouts) return ""; // still loading — avoid asserting "no workouts" prematurely
    if (workouts.length === 0) return "Start your first workout today.";
    if (stats.total >= 50) return "Momentum is building.";
    return MOTIVATIONAL_MESSAGES[todayKey % MOTIVATIONAL_MESSAGES.length];
  }, [workouts, stats, todayKey]);

  const lastSummary = useMemo(() => {
    if (!lastWorkout) return null;

    const { totalSets: sets } = computeWorkoutStats(lastWorkout.exercises);

    const muscles = new Set(
      lastWorkout.exercises.map((e) => getExercise(e.exerciseId)?.muscle).filter(Boolean)
    );

    return {
      name: lastWorkout.name,
      duration: lastWorkout.durationSec,
      sets,
      muscles: Array.from(muscles).slice(0, 2),
      id: lastWorkout.id,
    };
  }, [lastWorkout]);

  /* ===================== */
  /* TRAINING INSIGHTS */
  /* ===================== */

  const streaks = useMemo(() => computeStreaks(workouts ?? []), [workouts]);

  const recentExerciseIds = useMemo(
    () => getRecentlyTrainedExercises(workouts ?? [], 6),
    [workouts],
  );

  const currentFocus = useMemo(() => {
    const exerciseId = recentExerciseIds[0];
    if (!exerciseId) return null;
    const def = getExercise(exerciseId);
    const { status, best, metricKind } = computeExerciseStatus(workouts ?? [], exerciseId);
    return { exerciseId, name: def?.name ?? exerciseId, status, best, metricKind };
  }, [recentExerciseIds, workouts]);

  const consistency = useMemo(() => computeConsistency(workouts ?? [], streaks), [workouts, streaks]);

  const volumeTrend = useMemo(() => computeVolumeTrend(workouts ?? []), [workouts]);

  const recentProgress = useMemo(() => {
    return recentExerciseIds.slice(0, 5).map((exerciseId) => {
      const def = getExercise(exerciseId);
      const { status, best, metricKind } = computeExerciseStatus(workouts ?? [], exerciseId);
      return { exerciseId, name: def?.name ?? exerciseId, status, best, metricKind };
    });
  }, [recentExerciseIds, workouts]);

  /* ===================== */
  /* TRAINING BALANCE SNAPSHOT (FIXED) */
  /* ===================== */

  const balance = useMemo(() => {
    if (!workouts) {
      // Still loading — distinct from "loaded, but genuinely no data" below,
      // so the snapshot doesn't flash a false "no data yet" on every mount.
      return { hasData: undefined, most: null, leastTrained: null, untrained: [] };
    }

    const entries = MUSCLE_GROUPS
      .filter((m) => m !== "Cardio")
      .map((m) => ({
        muscle: m,
        value: intensity[m] ?? 0,
      }));

    const anyTrainingData = entries.some((e) => e.value > 0);

    if (!anyTrainingData) {
      return {
        hasData: false,
        most: null,
        leastTrained: null,
        untrained: [],
      };
    }

    const trained = entries.filter((e) => e.value > 0);
    const sorted = [...entries].sort((a, b) => b.value - a.value);

    const most = sorted[0];

    const leastTrained = trained.reduce((min, cur) =>
      cur.value < min.value ? cur : min
    );

    const untrained = entries
      .filter((e) => e.value === 0)
      .map((e) => e.muscle);

    return {
      hasData: true,
      most,
      leastTrained,
      untrained,
    };
  }, [intensity, workouts]);

  const muscleContributions = useMemo(() => {
    if (!drilldownMuscle) return [];
    return computeMuscleContributions(workouts ?? [], drilldownMuscle, 5);
  }, [drilldownMuscle, workouts]);

  function closeDrilldown() {
    setDrilldownMuscle(null);
    setSelectedMuscle(null);
  }

  useDismissOnBack(!!drilldownMuscle, closeDrilldown);

  return (
    <div className="flex flex-col gap-6 px-4 pt-6">

      {/* HEADER */}
      <header className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <BarChart3 className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">
            Training Overview
          </h1>

          {message && (
            <div className="mt-1 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
              {message}
            </div>
          )}
        </div>
      </header>

      {/* LAST WORKOUT */}
      {lastSummary && (
        <div
          onClick={() =>
            lastSummary.id &&
            navigate({ to: "/history/$id", params: { id: String(lastSummary.id) } })
          }
          className="rounded-2xl bg-card p-4 active:scale-[0.99] transition cursor-pointer"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Last workout</p>
            <p className="text-xs text-muted-foreground">Tap to view</p>
          </div>

          <p className="truncate font-bold">{lastSummary.name}</p>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{Math.round(lastSummary.duration / 60)} min</span>
            <span>{lastSummary.sets} sets</span>
            {lastSummary.muscles.length > 0 && (
              <span>{lastSummary.muscles.join(", ")}</span>
            )}
          </div>
        </div>
      )}

      {/* STATS */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Sessions"
          value={stats.total.toString()}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Volume"
          value={Math.round(stats.totalVolume).toLocaleString()}
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Active days"
          value={stats.thisWeek.toString()}
        />
      </section>

      {/* TRAINING INSIGHTS */}
      {!workouts?.length ? (
        <section className="rounded-2xl border border-border/50 bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Complete your first workout to start tracking progress.
          </p>
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-base font-semibold">Training Insights</h2>
          <div className="flex flex-col gap-3">
            {currentFocus && (
              <div
                onClick={() =>
                  navigate({ to: "/exercise/$id", params: { id: currentFocus.exerciseId } })
                }
                className="rounded-2xl bg-card p-4 active:scale-[0.99] transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  <span className="text-xs">Current focus</span>
                </div>
                <p className="mt-1 truncate text-sm font-bold">{currentFocus.name}</p>
                {currentFocus.best != null ? (
                  <>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Current Best
                    </p>
                    <p className="text-base font-bold text-primary">
                      {formatMetricValue(currentFocus.metricKind, currentFocus.best)}
                    </p>
                  </>
                ) : null}
                <StatusLine status={currentFocus.status} />
              </div>
            )}

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                <span className="text-xs">Training consistency</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <p className="text-sm">
                  <span className="font-bold">{consistency.streak}</span>{" "}
                  <span className="text-muted-foreground">
                    day{consistency.streak === 1 ? "" : "s"} current streak
                  </span>
                </p>
                <p className="text-sm">
                  <span className="font-bold">{consistency.workoutsThisWeek}</span>{" "}
                  <span className="text-muted-foreground">
                    workout{consistency.workoutsThisWeek === 1 ? "" : "s"} this week
                  </span>
                </p>
                <p className="text-sm">
                  <span className="font-bold">{consistency.activeDaysThisMonth}</span>{" "}
                  <span className="text-muted-foreground">
                    active day{consistency.activeDaysThisMonth === 1 ? "" : "s"} this month
                  </span>
                </p>
              </div>
            </div>

            {volumeTrend && (
              <div className="rounded-2xl bg-card p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="text-xs">Volume trend (last 4 weeks vs. prior 4)</span>
                </div>
                <TrendLine trend={volumeTrend} upLabel="Increasing" downLabel="Decreasing" flatLabel="Stable" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* MUSCLE MAP */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Muscle Activity</h2>
          <p className="text-xs text-muted-foreground">
            Based on completed sets • Tap to explore
          </p>
        </div>

        <div
          className={`mb-5 rounded-xl p-3 ${
            selectedMuscle ? "bg-primary/10" : "bg-secondary/20"
          }`}
        >
          <MuscleMap
            intensity={intensity}
            activeMuscle={selectedMuscle}
            className="max-h-72 w-full"
          />
        </div>

        {/* ===================== */}
        {/* TRAINING BALANCE SNAPSHOT (FIXED EMPTY STATE) */}
        {/* ===================== */}

        <div className="mb-5 rounded-xl border border-border/50 bg-secondary/10 p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Training Balance Snapshot
          </h3>

          {balance.hasData === undefined ? null : !balance.hasData ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No training data yet. Start a workout to see muscle insights.
            </p>
          ) : (
            <div className="space-y-1 text-xs text-muted-foreground">
              {balance.most && (
                <p>
                  Most trained:{" "}
                  <span className="font-medium text-foreground">
                    {balance.most.muscle}
                  </span>
                </p>
              )}

              {balance.leastTrained && (
                <p>
                  Least trained:{" "}
                  <span className="font-medium text-foreground">
                    {balance.leastTrained.muscle}
                  </span>
                </p>
              )}

              {balance.untrained.length > 0 && (
                <p>
                  Untrained:{" "}
                  <span className="font-medium text-foreground">
                    {balance.untrained.slice(0, 3).join(", ")}
                    {balance.untrained.length > 3 ? "…" : ""}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* MUSCLE LIST */}
        <div className="space-y-3">
          {MUSCLE_GROUPS.filter(
            (m) => m !== "Cardio" && (intensity[m] ?? 0) > 0
          )
            .sort((a, b) => (intensity[b] ?? 0) - (intensity[a] ?? 0))
            .slice(0, 7)
            .map((m) => {
              const value = Math.round((intensity[m] ?? 0) * 100);
              const isSelected = selectedMuscle === m;
              const dim = selectedMuscle && !isSelected;

              return (
                <div
                  key={m}
                  className={dim ? "opacity-30" : "opacity-100"}
                  onClick={() => {
                    setSelectedMuscle(m);
                    setDrilldownMuscle(m);
                  }}
                >
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{m}</span>
                    <span className="font-semibold tabular-nums">{value}%</span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* RECENT PROGRESS */}
      {recentProgress.length > 0 && (
        <section className="rounded-2xl border border-border/50 bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">Recent Progress</h2>
          <div className="flex flex-col gap-3">
            {recentProgress.map((row) => (
              <div
                key={row.exerciseId}
                onClick={() => navigate({ to: "/exercise/$id", params: { id: row.exerciseId } })}
                className="flex items-center justify-between gap-3 border-b border-border/30 pb-3 last:border-0 last:pb-0 cursor-pointer active:opacity-70"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  {row.best != null && (
                    <p className="text-xs text-muted-foreground">
                      {formatMetricValue(row.metricKind, row.best)}
                    </p>
                  )}
                </div>
                <StatusPill status={row.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DRILLDOWN */}
      {drilldownMuscle && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="w-full rounded-t-2xl bg-card p-5">
            <div className="mb-3 flex justify-between">
              <h3 className="font-semibold">{drilldownMuscle}</h3>
              <button
                onClick={closeDrilldown}
                className="text-sm text-muted-foreground"
              >
                Close
              </button>
            </div>

            {muscleContributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent workouts have trained this muscle yet.
              </p>
            ) : (
              <div className="mb-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
                {muscleContributions.map((c) => (
                  <div
                    key={c.workoutId}
                    onClick={() =>
                      navigate({ to: "/history/$id", params: { id: String(c.workoutId) } })
                    }
                    className="cursor-pointer rounded-xl bg-secondary/20 p-3 active:opacity-70"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(c.startedAt)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{c.workoutName}</p>
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {c.exerciseNames.map((name, i) => (
                        <li key={i}>• {name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={closeDrilldown}
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

type ExerciseStatus = "improving" | "plateauing" | "stable" | "needs-more-data";

/** Used on the Current Focus card — includes the exercise name context, so
 *  it reads as a sentence rather than a bare pill. */
function StatusLine({ status }: { status: ExerciseStatus }) {
  if (status === "needs-more-data") {
    return <p className="mt-2 text-xs text-muted-foreground">• Needs more data</p>;
  }
  if (status === "improving") {
    return <p className="mt-2 text-xs font-medium text-primary">↗ Improving</p>;
  }
  if (status === "plateauing") {
    return <p className="mt-2 text-xs font-medium text-muted-foreground">↘ Plateauing</p>;
  }
  return <p className="mt-2 text-xs font-medium text-muted-foreground">→ Stable</p>;
}

/** Used in the Recent Progress list — compact pill form. */
function StatusPill({ status }: { status: ExerciseStatus }) {
  if (status === "needs-more-data") {
    return <span className="shrink-0 text-xs text-muted-foreground">• Needs more data</span>;
  }
  if (status === "improving") {
    return <span className="shrink-0 text-xs font-medium text-primary">↗ Improving</span>;
  }
  if (status === "plateauing") {
    return <span className="shrink-0 text-xs font-medium text-muted-foreground">↘ Plateauing</span>;
  }
  return <span className="shrink-0 text-xs font-medium text-muted-foreground">→ Stable</span>;
}

function TrendLine({
  trend,
  upLabel,
  downLabel,
  flatLabel,
}: {
  trend: Trend;
  upLabel: string;
  downLabel: string;
  flatLabel: string;
}) {
  if (trend === "up") {
    return <p className="mt-1 text-base font-bold text-primary">↑ {upLabel}</p>;
  }
  if (trend === "down") {
    return <p className="mt-1 text-base font-bold text-muted-foreground">↓ {downLabel}</p>;
  }
  return <p className="mt-1 text-base font-bold text-muted-foreground">→ {flatLabel}</p>;
}

/* ===================== */

/** Distinct calendar days, within the trailing `windowMs` from now, that
 *  contain at least one workout. Shared by computeStats (7-day window, for
 *  the Summary "Active days" card) and computeConsistency (30-day window)
 *  so "what counts as an active day" is decided in exactly one place. */
function countActiveDays(workouts: Workout[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return new Set(
    workouts
      .filter((w) => w.startedAt >= cutoff)
      .map((w) => {
        const d = new Date(w.startedAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }),
  ).size;
}

function computeStats(workouts: Workout[]) {
  const total = workouts.length;

  const totalVolume = workouts.reduce(
    (acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume,
    0,
  );

  return {
    total,
    totalVolume,
    thisWeek: countActiveDays(workouts, 7 * 86400000),
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

/**
 * Current + best streak of consecutive calendar days containing at least
 * one workout. A day that hasn't happened yet (today, if nothing's logged)
 * doesn't break the current streak — only a genuinely skipped day does.
 */
function computeStreaks(workouts: Workout[]): { current: number; best: number } {
  if (workouts.length === 0) return { current: 0, best: 0 };

  const dayMs = 86400000;
  const dayOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const days = Array.from(new Set(workouts.map((w) => dayOf(w.startedAt)))).sort(
    (a, b) => b - a,
  );

  const today = dayOf(Date.now());
  let current = 0;
  if (days[0] === today || days[0] === today - dayMs) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] === dayMs) current++;
      else break;
    }
  }

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] === dayMs) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return { current, best };
}

/** The three Training Consistency numbers — reuses computeStreaks for the
 *  streak and countActiveDays for the "this month" figure rather than
 *  re-deriving either. "This week"/"this month" are trailing 7- and
 *  30-day windows, matching the rolling-window convention already used
 *  elsewhere on this page (computeStats, computeVolumeTrend), rather than
 *  calendar week/month boundaries this app has no other concept of. */
function computeConsistency(
  workouts: Workout[],
  streaks: { current: number; best: number },
): { streak: number; workoutsThisWeek: number; activeDaysThisMonth: number } {
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    streak: streaks.current,
    workoutsThisWeek: workouts.filter((w) => w.startedAt >= weekAgo).length,
    activeDaysThisMonth: countActiveDays(workouts, 30 * 86400000),
  };
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

/**
 * Simple status for one exercise: compares its two most recent sessions'
 * primary-metric values. Deliberately just a two-point comparison — no
 * plateau detection, no confidence scoring, matching what was asked for.
 */
function computeExerciseStatus(
  workouts: Workout[],
  exerciseId: string,
): { status: ExerciseStatus; best: number | null; metricKind: MetricKind } {
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

  const values = sessionSets
    .map((sets) => getPrimaryMetric(metricKind, sets))
    .filter((v): v is number => v != null);

  const best = values.length > 0 ? Math.max(...values) : null;

  if (values.length < 2) {
    return { status: "needs-more-data", best, metricKind };
  }

  // values is most-recent-first (workouts is), so values[0] is latest.
  const trend = compareTrend(values[1], values[0]);
  const status: ExerciseStatus =
    trend === "up" ? "improving" : trend === "down" ? "plateauing" : "stable";
  return { status, best, metricKind };
}

/**
 * Compares total volume in the last 4 weeks against the 4 weeks before
 * that. Returns null (hide the card) unless there's actual training in
 * both halves — otherwise this would just be reporting "you hadn't
 * started yet", not a real trend.
 */
function computeVolumeTrend(workouts: Workout[]): Trend | null {
  const weekMs = 7 * 86400000;
  const now = Date.now();
  const recentStart = now - 4 * weekMs;
  const priorStart = now - 8 * weekMs;

  const recent = workouts.filter((w) => w.startedAt >= recentStart);
  const prior = workouts.filter((w) => w.startedAt >= priorStart && w.startedAt < recentStart);

  if (recent.length === 0 || prior.length === 0) return null;

  const sum = (ws: Workout[]) =>
    ws.reduce((acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume, 0);

  return compareTrend(sum(prior), sum(recent));
}

interface MuscleContribution {
  workoutId: number;
  workoutName: string;
  startedAt: number;
  exerciseNames: string[];
}

/** Recent workouts where any exercise's primary or secondary muscle
 *  matches — the same primary/secondary weighting computeMuscleIntensity
 *  already uses, just listing contributing workouts instead of a number. */
function computeMuscleContributions(
  workouts: Workout[],
  muscle: MuscleGroup,
  limit: number,
): MuscleContribution[] {
  const out: MuscleContribution[] = [];
  for (const w of workouts) {
    const names: string[] = [];
    for (const ex of w.exercises) {
      if (!ex.sets.some((s) => s.completed)) continue;
      const def = getExercise(ex.exerciseId);
      if (!def) continue;
      if (def.muscle === muscle || def.secondary?.includes(muscle)) {
        names.push(def.name);
      }
    }
    if (names.length > 0 && w.id != null) {
      out.push({ workoutId: w.id, workoutName: w.name, startedAt: w.startedAt, exerciseNames: names });
    }
    if (out.length >= limit) break;
  }
  return out;
}
