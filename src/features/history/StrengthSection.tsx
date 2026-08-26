import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Workout } from "@/lib/db";
import { getExercise, MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import {
  computeVolumeByPeriod,
  computeVolumeTrend,
  volumeTrendConfidence,
  type VolumePeriodGranularity,
} from "@/lib/workoutStats";
import {
  trendConfidenceLabel,
  getTrendConfidence,
  getRecentlyTrainedExercises,
  computeExerciseStatus,
  formatMetricValue,
  EXERCISE_STATUS_COPY,
  type Trend,
  type ExerciseStatus,
} from "@/lib/exerciseProgress";
import {
  computeAggregateMuscleIntensity,
  computeMuscleActivityByPeriod,
  computeMuscleRecovery,
  MUSCLE_RECOVERY_COPY,
} from "@/lib/muscles";
import { formatRelativeDate } from "@/lib/format";
import { useDismissOnBack } from "@/lib/backHandler";
import { MuscleMap } from "@/components/MuscleMap";

/** How many recently-trained exercises Exercise Progression shows —
 *  wider than Overview's Recent Progress (3), since this is the deep-dive
 *  destination, not the quick glance. See the redesign review's point 8. */
const EXERCISE_PROGRESSION_COUNT = 10;

type HeatmapRange = 7 | 30 | 90 | null;

const HEATMAP_RANGES: { label: string; value: HeatmapRange }[] = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "All", value: null },
];

interface MuscleContribution {
  workoutId: number;
  workoutName: string;
  startedAt: number;
  exerciseNames: string[];
}

/** Recent workouts where any exercise's primary or secondary muscle
 *  matches — same primary/secondary weighting computeAggregateMuscleIntensity
 *  uses, just listing contributing workouts instead of a number. */
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
      out.push({
        workoutId: w.id,
        workoutName: w.name,
        startedAt: w.startedAt,
        exerciseNames: names,
      });
    }
    if (out.length >= limit) break;
  }
  return out;
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

function StatusArrow({ status }: { status: ExerciseStatus }) {
  const { icon, tone } = EXERCISE_STATUS_COPY[status];
  return <span className={`shrink-0 text-sm font-medium ${tone}`}>{icon}</span>;
}

// Section header style — bare text, no card, matching the "no-surface for
// section labels" tier from the Overview redesign work. Duplicated from
// _app.history.insights.tsx's own SectionLabel rather than shared — both
// are this exact 4-line wrapper, and importing across a route/feature
// boundary for something this small isn't worth the coupling.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * Explicit, guaranteed-ascending ticks for the volume chart's Y-axis —
 * 0 and 4 even steps up to a "nice" round number at or above the data's
 * max. Recharts' own auto-generated ticks were observed rendering out of
 * order (e.g. 4000, 500, 7000, 3500, 0) with nothing custom in this file
 * to explain it, pointing at a ResponsiveContainer measurement/mount-
 * timing issue rather than a formatting bug. Computing the ticks
 * ourselves sidesteps that code path entirely regardless of the exact
 * cause.
 */
function computeVolumeAxisTicks(dataMax: number): number[] {
  if (dataMax <= 0) return [0, 1, 2, 3, 4];
  const magnitude = 10 ** Math.floor(Math.log10(dataMax / 4));
  const niceMultiples = [1, 2, 2.5, 5, 10];
  const step =
    niceMultiples.map((m) => m * magnitude).find((candidate) => candidate * 4 >= dataMax) ??
    10 * magnitude;
  return [0, step, step * 2, step * 3, step * 4];
}

/**
 * Insights → Strength: "Are you getting stronger?" — volume trend and
 * chart, the interactive muscle map with training-balance callout and
 * per-muscle drill-down, and exercise progression. Only rendered while
 * hasWorkouts is true (see the parent's gating), so `workouts` here is
 * always non-empty in practice even though its type stays Workout[] to
 * match how the rest of this file already passes `workouts ?? []` around.
 */
export function StrengthSection({ workouts }: { workouts: Workout[] }) {
  const navigate = useNavigate();

  const [volumeGranularity, setVolumeGranularity] = useState<VolumePeriodGranularity>("week");
  const volumeTrend = useMemo(() => computeVolumeTrend(workouts), [workouts]);
  const volumeSeries = useMemo(
    () => computeVolumeByPeriod(workouts, volumeGranularity, volumeGranularity === "week" ? 8 : 6),
    [workouts, volumeGranularity],
  );
  const volumeAxisTicks = useMemo(
    () => computeVolumeAxisTicks(Math.max(0, ...volumeSeries.map((d) => d.volume))),
    [volumeSeries],
  );

  // Exercise Progression — every recently-trained exercise with enough
  // evidence to say something, not just the 3 Overview shows.
  const exerciseProgression = useMemo(() => {
    const ids = getRecentlyTrainedExercises(workouts, EXERCISE_PROGRESSION_COUNT);
    return ids
      .map((exerciseId) => {
        const def = getExercise(exerciseId);
        const result = computeExerciseStatus(workouts, exerciseId);
        const current = result.values[0];
        const previous = result.comparisonPrevious;
        const evidence =
          current != null && previous != null
            ? `${formatMetricValue(result.metricKind, previous, result.distanceUnit)} → ${formatMetricValue(result.metricKind, current, result.distanceUnit)}`
            : null;
        return { exerciseId, name: def?.name ?? exerciseId, ...result, evidence };
      })
      .filter((ex) => getTrendConfidence(ex.sampleSize) !== null);
  }, [workouts]);

  // Full interactive muscle exploration.
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [drilldownMuscle, setDrilldownMuscle] = useState<MuscleGroup | null>(null);
  const [drilldownGranularity, setDrilldownGranularity] = useState<VolumePeriodGranularity>("week");
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>(30);

  const heatmapWorkouts = useMemo(() => {
    if (heatmapRange === null) return workouts;
    const since = Date.now() - heatmapRange * 86400000;
    return workouts.filter((w) => w.startedAt >= since);
  }, [workouts, heatmapRange]);

  const intensity = useMemo(
    () => computeAggregateMuscleIntensity(heatmapWorkouts),
    [heatmapWorkouts],
  );
  const recovery = useMemo(() => computeMuscleRecovery(workouts), [workouts]);

  const balance = useMemo(() => {
    const entries = MUSCLE_GROUPS.filter((m) => m !== "Cardio").map((m) => ({
      muscle: m,
      value: intensity[m] ?? 0,
    }));
    const anyTrainingData = entries.some((e) => e.value > 0);
    if (!anyTrainingData) {
      return { hasData: false as const, most: null, leastTrained: null, untrained: [] };
    }

    const trained = entries.filter((e) => e.value > 0);
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    const most = sorted[0];
    const leastTrained = trained.reduce((min, cur) => (cur.value < min.value ? cur : min));
    const untrained = entries.filter((e) => e.value === 0).map((e) => e.muscle);

    return { hasData: true as const, most, leastTrained, untrained };
  }, [intensity]);

  const muscleContributions = useMemo(() => {
    if (!drilldownMuscle) return [];
    return computeMuscleContributions(heatmapWorkouts, drilldownMuscle, 5);
  }, [drilldownMuscle, heatmapWorkouts]);

  const muscleActivity = useMemo(() => {
    if (!drilldownMuscle) return [];
    return computeMuscleActivityByPeriod(
      workouts,
      drilldownMuscle,
      drilldownGranularity,
      drilldownGranularity === "week" ? 8 : 6,
    );
  }, [drilldownMuscle, drilldownGranularity, workouts]);

  function closeDrilldown() {
    setDrilldownMuscle(null);
    setSelectedMuscle(null);
  }

  useDismissOnBack(!!drilldownMuscle, closeDrilldown);

  return (
    <>
      <div className="rounded-2xl bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">
          Volume trend (last 4 weeks vs. prior 4)
        </p>
        {volumeTrend ? (
          <>
            <TrendLine
              trend={volumeTrend.trend}
              upLabel="Increasing"
              downLabel="Decreasing"
              flatLabel="Stable"
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              {trendConfidenceLabel(
                volumeTrendConfidence(volumeTrend.recentCount, volumeTrend.priorCount),
              )}{" "}
              · {volumeTrend.recentCount} workout{volumeTrend.recentCount === 1 ? "" : "s"} vs.{" "}
              {volumeTrend.priorCount} workout{volumeTrend.priorCount === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground/70">
            Not enough history yet for a trend — keep logging workouts.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {(["week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setVolumeGranularity(g)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                volumeGranularity === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground active:bg-secondary/70"
              }`}
            >
              {g === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>

        <div className="mt-3 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval={volumeGranularity === "week" ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={32}
                domain={[0, volumeAxisTicks[volumeAxisTicks.length - 1]]}
                ticks={volumeAxisTicks}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", radius: 4 }}
                formatter={(value: number) => [`${Math.round(value).toLocaleString()}`, "Volume"]}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="volume" fill="var(--primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <SectionLabel>Muscle Activity</SectionLabel>
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <p className="mb-4 text-xs text-muted-foreground">
          Based on completed sets
          {heatmapRange !== null ? ` in the last ${heatmapRange} days` : ""} • Tap to explore
        </p>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {HEATMAP_RANGES.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => setHeatmapRange(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                heatmapRange === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground active:bg-secondary/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className={`mb-5 rounded-xl p-3 ${selectedMuscle ? "bg-primary/10" : "bg-secondary/50"}`}
        >
          <MuscleMap intensity={intensity} activeMuscle={selectedMuscle} className="w-full" />
        </div>

        <div className="mb-5 rounded-xl border border-border/50 bg-secondary/10 p-4">
          <h3 className="mb-2 text-sm font-semibold">Training Balance Snapshot</h3>
          {!balance.hasData ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {heatmapRange !== null
                ? `No training data in the last ${heatmapRange} days.`
                : "No training data yet. Start a workout to see muscle insights."}
            </p>
          ) : (
            <div className="space-y-1 text-xs text-muted-foreground">
              {balance.most && (
                <p>
                  Most trained:{" "}
                  <span className="font-medium text-foreground">{balance.most.muscle}</span>
                </p>
              )}
              {balance.leastTrained && (
                <p>
                  Least trained:{" "}
                  <span className="font-medium text-foreground">{balance.leastTrained.muscle}</span>
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

        <div className="space-y-3">
          {MUSCLE_GROUPS.filter((m) => m !== "Cardio" && (intensity[m] ?? 0) > 0)
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
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{m}</span>
                      {recovery[m] && (
                        <span className={MUSCLE_RECOVERY_COPY[recovery[m]!.status].tone}>
                          {MUSCLE_RECOVERY_COPY[recovery[m]!.status].label} ·{" "}
                          {formatRelativeDate(recovery[m]!.lastTrainedAt)}
                        </span>
                      )}
                    </span>
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
      </div>

      <SectionLabel>Exercise Progression</SectionLabel>
      {exerciseProgression.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          Keep training — progression shows up here once an exercise has a couple of sessions
          logged.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {exerciseProgression.map((ex) => (
            <div
              key={ex.exerciseId}
              onClick={() => navigate({ to: "/exercise/$id", params: { id: ex.exerciseId } })}
              className="flex cursor-pointer items-center justify-between gap-3 active:opacity-70"
            >
              <span className="truncate text-sm">{ex.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                {ex.evidence && (
                  <span className="text-xs text-muted-foreground">{ex.evidence}</span>
                )}
                <StatusArrow status={ex.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {drilldownMuscle && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="w-full rounded-t-2xl bg-card p-5">
            <div className="mb-3 flex justify-between">
              <h3 className="font-semibold">{drilldownMuscle}</h3>
              <button onClick={closeDrilldown} className="text-sm text-muted-foreground">
                Close
              </button>
            </div>

            {muscleActivity.some((p) => p.score > 0) && (
              <div className="mb-4">
                <div className="flex gap-2">
                  {(["week", "month"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setDrilldownGranularity(g)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        drilldownGranularity === g
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground active:bg-secondary/70"
                      }`}
                    >
                      {g === "week" ? "Weekly" : "Monthly"}
                    </button>
                  ))}
                </div>

                <div className="mt-3 h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={muscleActivity}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                        interval={drilldownGranularity === "week" ? 1 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", radius: 4 }}
                        formatter={(value: number) => [`${Math.round(value * 10) / 10}`, "Sets"]}
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="score" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

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
    </>
  );
}
