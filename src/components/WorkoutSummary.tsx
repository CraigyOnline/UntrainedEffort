import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { computeIntensity } from "@/lib/muscles";
import { formatDistanceValue } from "@/lib/exercises";
import { computeWorkoutDisplayStats, formatCardioActivity } from "@/lib/workoutStats";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";

interface StatsRowProps {
  durationSec: number;
  exercises: Workout["exercises"];
  /** Externally controlled reveal flag for the stat values' staggered
   *  entrance — driven by the Workout Complete screen's own completion
   *  timing so the whole sequence stays on one clock rather than this
   *  component running its own separate animation state.
   *
   *  Omitted entirely (History's static usage) means "not animated at
   *  all" — a CSS @keyframes animation plays on mount regardless of
   *  whether anything changed, unlike a transition, so `revealed` needs a
   *  real three-state distinction (undefined vs true vs false), not just
   *  a `?? true` default, or History's static render would visibly
   *  animate too. */
  revealed?: boolean;
}

/**
 * The three headline numbers (Duration/Sets/Volume) on their own, without
 * the name heading or muscle map — split out of WorkoutSummary so the
 * Workout Complete screen's staged reveal can show these in one beat and
 * the muscle map in a separate, later beat (reference material arriving
 * after the achievement, not bundled with it). History's WorkoutSummary
 * usage below is unaffected — it still composes this internally.
 */
export function WorkoutStatsRow({ durationSec, exercises, revealed }: StatsRowProps) {
  const stats = computeWorkoutDisplayStats(exercises);
  const animated = revealed !== undefined;

  const statClass = (delayMs: number) => {
    if (!animated) return { className: "", style: undefined };
    return {
      className: revealed ? "animate-[drop-settle-stat_380ms_linear_forwards]" : "opacity-0",
      style: { animationDelay: `${delayMs}ms` },
    };
  };

  const cells =
    stats.mode === "cardio"
      ? [
          { label: "Duration", value: formatDuration(durationSec) },
          {
            label: stats.primaryCardio ? "Distance" : "Activities",
            value: stats.primaryCardio
              ? stats.primaryCardio.distance != null && stats.primaryCardio.distanceUnit
                ? formatDistanceValue(stats.primaryCardio.distanceUnit, stats.primaryCardio.distance)
                : "—"
              : String(stats.cardioActivities.length),
          },
          {
            label: stats.primaryCardio ? "Pace / Speed" : "Training",
            value: stats.primaryCardio?.pace ?? "Cardio",
          },
        ]
      : [
          { label: "Duration", value: formatDuration(durationSec) },
          { label: "Sets", value: String(stats.totalSets) },
          { label: "Volume", value: `${Math.round(stats.totalVolume)} kg` },
        ];

  const intervalCells = stats.primaryInterval
    ? [
        { label: "Duration", value: formatDuration(durationSec) },
        { label: "Rounds", value: String(stats.primaryInterval.rounds) },
        {
          label: "Work / Rest",
          value: `${formatDuration(stats.primaryInterval.workSeconds)} / ${formatDuration(stats.primaryInterval.restSeconds)}`,
        },
      ]
    : [
        { label: "Duration", value: formatDuration(durationSec) },
        { label: "Intervals", value: String(stats.intervalActivities.length) },
        { label: "Training", value: "Intervals" },
      ];

  const displayCells = stats.mode === "interval" ? intervalCells : cells;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        {displayCells.map((cell, index) => (
          <div key={cell.label} {...statClass(index * 70)}>
            <p className="text-xs text-muted-foreground">{cell.label}</p>
            <p className="font-bold">{cell.value}</p>
          </div>
        ))}
      </div>

      {stats.mode === "cardio" && stats.primaryCardio && (
        <p className="text-center text-xs text-muted-foreground">
          {stats.primaryCardio.name}
        </p>
      )}

      {stats.mode === "cardio" && !stats.primaryCardio && stats.cardioActivities.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {stats.cardioActivities.length} cardio activities
        </p>
      )}

      {stats.mode === "mixed" && stats.cardioActivities.length > 0 && (
        <div className="rounded-lg bg-secondary/40 px-3 py-2 text-center text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Cardio</span>
          {stats.cardioActivities.map((activity) => (
            <span key={activity.exerciseId} className="ml-1.5">
              {activity.name}
              {activity.distance != null && activity.distanceUnit
                ? ` · ${formatDistanceValue(activity.distanceUnit, activity.distance)}`
                : ""}
              {activity.pace ? ` · ${activity.pace}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  name?: string;
  durationSec: number;
  exercises: Workout["exercises"];
  showName?: boolean;
  revealed?: boolean;
}

export function CardioPerformanceCard({ exercises }: { exercises: Workout["exercises"] }) {
  const stats = computeWorkoutDisplayStats(exercises);
  if (stats.mode !== "cardio" || stats.cardioActivities.length === 0) return null;

  if (stats.primaryCardio) {
    const activity = stats.primaryCardio;
    const hasPrimaryMetric = Boolean(activity.pace);

    return (
      <div className="rounded-xl bg-card px-4 py-4 ring-1 ring-border/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cardio Performance
        </p>
        <p className="mt-1 text-sm font-medium">{activity.name}</p>
        {hasPrimaryMetric ? (
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{activity.pace}</p>
        ) : (
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
            {formatDuration(activity.durationSec)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {activity.distance != null && activity.distanceUnit && (
            <span>{formatDistanceValue(activity.distanceUnit, activity.distance)}</span>
          )}
          {activity.durationSec > 0 && <span>{formatDuration(activity.durationSec)}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card px-4 py-4 ring-1 ring-border/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Cardio Performance
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {stats.cardioActivities.map((activity) => (
          <div
            key={activity.exerciseId}
            className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm font-medium">{activity.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatCardioActivity(activity)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IntervalPerformanceCard({ exercises }: { exercises: Workout["exercises"] }) {
  const stats = computeWorkoutDisplayStats(exercises);
  if (stats.intervalActivities.length === 0) return null;

  return (
    <div className="rounded-xl bg-card px-4 py-4 ring-1 ring-border/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Interval Performance
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {stats.intervalActivities.map((activity) => (
          <div key={activity.exerciseId} className="rounded-lg bg-muted/50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{activity.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">
                {activity.rounds} rounds
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>{formatDuration(activity.durationSec)}</span>
              <span>{formatDuration(activity.workSeconds)} work</span>
              <span>{formatDuration(activity.restSeconds)} rest</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkoutSummary({ name, durationSec, exercises, showName, revealed }: Props) {
  const intensity = computeIntensity(exercises);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <WorkoutStatsRow durationSec={durationSec} exercises={exercises} revealed={revealed} />
      <ExpandableMuscleMap intensity={intensity} />
    </div>
  );
}
