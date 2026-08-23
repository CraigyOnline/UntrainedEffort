import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getDb, type PRRecord, type Workout, type WorkoutSet } from "@/lib/db";
import { getExercise, getExerciseLoggingSchema, formatCompletedSet } from "@/lib/exercises";
import {
  getPrimaryMetricKind,
  getPrimaryMetric,
  metricLabel,
  formatMetricValue,
  getCardioRate,
  formatCardioRate,
  formatPRValue,
  formatPRDelta,
  getCardioTrend,
  formatCardioInsight,
  computeExerciseStatusFromValues,
  EXERCISE_STATUS_COPY,
  formatStatusConfidence,
  type DisplayPRType,
  type ExerciseStatus,
} from "@/lib/exerciseProgress";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_app/exercise/$id")({
  component: ExerciseProgressPage,
});

/**
 * One past session containing this exercise, with only its completed sets
 * for THIS exercise — most-recent-first. A plain, ordered array (not a
 * component-specific view model), consumed both by the Recent Sessions
 * list below and by the progress chart, which reverses a copy for
 * chronological (oldest-first) x-axis order rather than re-querying.
 *
 * workouts has no index on the nested exercises[].exerciseId, so this
 * walks the table backward by startedAt and stops once `limit` matching
 * sessions are found — the same cursor pattern LiveSession.tsx already
 * uses for its "previous workout" lookup, rather than loading everything.
 */
interface ExerciseSessionEntry {
  workoutId: number;
  workoutName: string;
  startedAt: number;
  sets: WorkoutSet[];
}

async function fetchRecentSessions(
  exerciseId: string,
  limit: number,
): Promise<ExerciseSessionEntry[]> {
  const entries: ExerciseSessionEntry[] = [];
  await getDb()
    .workouts.orderBy("startedAt")
    .reverse()
    .until(() => entries.length >= limit)
    .each((w: Workout) => {
      const log = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!log) return;
      const completedSets = log.sets.filter((s) => s.completed);
      if (completedSets.length === 0) return;
      entries.push({
        workoutId: w.id!,
        workoutName: w.name,
        startedAt: w.startedAt,
        sets: completedSets,
      });
    });
  return entries;
}

// Fetched once per exercise and shared by both the Recent Sessions list and
// the progress chart below — the list only displays the most recent
// SESSION_LIST_DISPLAY_COUNT of these, the chart uses the full set.
const SESSION_HISTORY_LIMIT = 30;
const SESSION_LIST_DISPLAY_COUNT = 10;

function ExerciseProgressPage() {
  const { id } = Route.useParams();
  const router = useRouter();

  const def = getExercise(id);

  // All PR records for this exercise, sorted by date ascending
  const prs = useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return getDb().prHistory.where("exerciseId").equals(id).sortBy("createdAt");
  }, [id]) as PRRecord[] | undefined;

  // Most recent completed sessions containing this exercise — shared
  // source for both the list below and the chart
  const recentSessions = useLiveQuery(async () => {
    if (typeof window === "undefined") return [];
    return fetchRecentSessions(id, SESSION_HISTORY_LIMIT);
  }, [id]);

  const schema = getExerciseLoggingSchema(def);
  const metricKind = getPrimaryMetricKind(schema);
  const isCardioProgress = schema.distance && !!schema.paceConvention;

  // Chronological (oldest first) for the chart's x-axis — recentSessions
  // itself stays most-recent-first, since that's what the list below wants.
  const chartData = (recentSessions ?? [])
    .map((session) => ({
      date: session.startedAt,
      value: isCardioProgress
        ? getCardioRate(schema, session.sets)
        : getPrimaryMetric(metricKind, session.sets),
    }))
    .filter((p): p is { date: number; value: number } => p.value !== null)
    .reverse();

  const cardioBestRate =
    isCardioProgress && chartData.length > 0
      ? chartData.reduce(
          (best, point) =>
            schema.paceConvention?.style === "pace"
              ? Math.min(best, point.value)
              : Math.max(best, point.value),
          chartData[0].value,
        )
      : null;
  const cardioBestDistance = isCardioProgress
    ? getPrimaryMetric("distance", recentSessions?.flatMap((s) => s.sets) ?? [])
    : null;

  const cardioTrend =
    isCardioProgress && chartData.length >= 2
      ? getCardioTrend(
          schema,
          chartData[chartData.length - 2].value,
          chartData[chartData.length - 1].value,
        )
      : null;

  // chartData is oldest-first (for the chart's x-axis); the classifier
  // wants most-recent-first, same convention as Overview's own values array.
  const exerciseStatus: ExerciseStatus = computeExerciseStatusFromValues(
    [...chartData].reverse().map((p) => p.value),
    schema.paceConvention?.style === "pace",
  );
  const statusConfidence = formatStatusConfidence(chartData.length);

  // Latest PR per type — derived directly from stored records
  const latest: Partial<Record<DisplayPRType, PRRecord>> = {};
  if (prs) {
    for (const pr of prs) {
      latest[pr.type] = pr; // prs is ascending by createdAt, so last wins
    }
  }

  const fmt = (pr: PRRecord, v: number) => formatPRValue(pr.type, v, schema);

  // Group PRs by type for the progression list
  const byType: Record<string, PRRecord[]> = {};
  if (prs) {
    for (const pr of prs) {
      if (!byType[pr.type]) byType[pr.type] = [];
      byType[pr.type].push(pr);
    }
  }

  const typeOrder: DisplayPRType[] = [
    "weight",
    "volume",
    "reps",
    "time",
    "distance",
    "pace",
    "speed",
  ];
  const typeLabel: Record<string, string> = {
    weight: "Weight",
    volume: "Volume",
    reps: "Reps",
    time: "Duration",
    distance: "Distance",
    pace: "Pace",
    speed: schema.paceConvention?.style === "rate" ? "Rate" : "Speed",
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button onClick={() => router.history.back()} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{def?.name ?? id}</h1>
          <p className="text-xs text-muted-foreground">{def?.muscle}</p>
        </div>
      </header>

      {/* Current bests */}
      {isCardioProgress && chartData.length > 0 ? (
        <div className="rounded-xl bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Current Bests</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Best Distance</p>
              <p className="text-base font-bold text-primary">
                {cardioBestDistance != null
                  ? formatMetricValue("distance", cardioBestDistance, schema.distanceUnit)
                  : "—"}
              </p>
            </div>
            {cardioBestRate != null && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Best {schema.paceConvention?.style === "pace" ? "Pace" : "Speed"}
                </p>
                <p className="text-base font-bold text-primary">
                  {formatCardioRate(schema, cardioBestRate)}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : prs && prs.length > 0 ? (
        <div className="rounded-xl bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Current Personal Bests</h2>
          <div className="flex flex-wrap gap-4">
            {typeOrder.map((type) => {
              const pr = latest[type];
              if (!pr) return null;
              return (
                <div key={type}>
                  <p className="text-xs text-muted-foreground">{typeLabel[type]}</p>
                  <p className="text-base font-bold text-primary">{fmt(pr, pr.value)}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Cardio trend */}
      {cardioTrend && (
        <div className="rounded-xl bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Recent Trend</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCardioInsight(schema, cardioTrend)}
              </p>
            </div>
            <span
              className={`shrink-0 text-sm font-semibold ${
                cardioTrend.direction === "improving"
                  ? "text-primary"
                  : cardioTrend.direction === "declining"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {cardioTrend.direction === "improving"
                ? "Improving"
                : cardioTrend.direction === "declining"
                  ? "Slower"
                  : "Steady"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Previous</p>
              <p className="text-base font-bold">
                {formatCardioRate(schema, cardioTrend.previous)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Latest</p>
              <p className="text-base font-bold text-primary">
                {formatCardioRate(schema, cardioTrend.latest)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progression by type */}
      {prs && prs.length === 0 && (
        <EmptyState message="No personal records yet for this exercise." />
      )}

      {prs &&
        prs.length > 0 &&
        typeOrder.map((type) => {
          const records = byType[type];
          if (!records?.length) return null;
          return (
            <div key={type} className="rounded-xl bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{typeLabel[type]} Progression</h2>
              <div className="flex flex-col gap-2">
                {records.map((pr, i) => {
                  const isFirst = (pr.previousBest ?? 0) === 0;
                  const date = new Date(pr.createdAt).toLocaleDateString();
                  return (
                    <div
                      key={pr.id ?? i}
                      className="flex items-center justify-between gap-2 border-b border-muted/20 pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm">
                          {isFirst ? (
                            <span>
                              First PR —{" "}
                              <span className="font-semibold text-primary">
                                {fmt(pr, pr.value)}
                              </span>
                            </span>
                          ) : (
                            <span>
                              {fmt(pr, pr.previousBest ?? 0)} →{" "}
                              <span className="font-semibold text-primary">
                                {fmt(pr, pr.value)}
                              </span>
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                      </div>
                      {!isFirst && (
                        <span className="shrink-0 text-xs font-semibold text-primary">
                          {formatPRDelta(
                            pr.type,
                            pr.delta ?? pr.value - (pr.previousBest ?? 0),
                            schema,
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      {/* Progress chart */}
      {chartData.length >= 2 && (
        <div className="rounded-xl bg-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {isCardioProgress
                ? `${schema.paceConvention?.style === "pace" ? "Pace" : "Speed"} Over Time`
                : `${metricLabel(metricKind)} Over Time`}
            </h2>
            <span className={`text-xs font-medium ${EXERCISE_STATUS_COPY[exerciseStatus].tone}`}>
              {EXERCISE_STATUS_COPY[exerciseStatus].icon}{" "}
              {EXERCISE_STATUS_COPY[exerciseStatus].label}
            </span>
          </div>
          {statusConfidence && (
            <p className="mb-3 text-right text-[11px] text-muted-foreground/70">
              {statusConfidence}
            </p>
          )}
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(ts) =>
                    new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  }
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  labelFormatter={(ts) => formatDate(ts as number)}
                  formatter={(value: number) => [
                    isCardioProgress
                      ? formatCardioRate(schema, value)
                      : formatMetricValue(metricKind, value, schema.distanceUnit),
                    isCardioProgress
                      ? schema.paceConvention?.style === "pace"
                        ? "Pace"
                        : "Speed"
                      : metricLabel(metricKind),
                  ]}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--primary)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="rounded-xl bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent Sessions</h2>
        {!recentSessions ? null : recentSessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No completed sessions with this exercise yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {recentSessions.slice(0, SESSION_LIST_DISPLAY_COUNT).map((session) => (
              <div
                key={session.workoutId}
                className="border-b border-muted/20 pb-3 last:border-0 last:pb-0"
              >
                <p className="text-xs text-muted-foreground">{formatDate(session.startedAt)}</p>
                <div className="mt-1 flex flex-col gap-1">
                  {session.sets.map((s, si) => (
                    <div key={s.id ?? si} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-xs text-muted-foreground">{si + 1}</span>
                      <span>{formatCompletedSet(def, s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
