import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { computeIntensity } from "@/lib/muscles";
import { formatDistanceValue } from "@/lib/exercises";
import { computeWorkoutDisplayStats } from "@/lib/workoutStats";
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

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        {cells.map((cell, index) => (
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
