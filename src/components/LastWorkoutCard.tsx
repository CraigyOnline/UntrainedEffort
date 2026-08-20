import { useNavigate } from "@tanstack/react-router";
import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { computeIntensity } from "@/lib/muscles";
import {
  computeDominantSignature,
  computeWorkoutDisplayStats,
  formatCardioActivity,
  resolveCardioPattern,
} from "@/lib/workoutStats";
import { MuscleMap } from "@/components/MuscleMap";
import { CardioSignature } from "@/components/CardioSignature";

interface LastWorkoutCardProps {
  workout: Workout;
}

/** Icon height, in px — matches CardioSignature's own compact default so
 *  every workout type reads at the same visual weight regardless of
 *  which icon it resolves to. */
const ICON_HEIGHT = 60;

/**
 * Overview's Last Workout, built specifically for this compact context —
 * NOT a shrunken WorkoutSummary. WorkoutSummary's 3-cell centered stat
 * grid and full-size map were designed to be the showcase of a whole
 * screen (Workout Complete, History detail); forcing that layout to sit
 * next to a small icon produced exactly the "shrunken workout-detail
 * screen" feel this component replaces. It reuses the same underlying
 * data (computeWorkoutDisplayStats, computeDominantSignature,
 * resolveCardioPattern, computeIntensity, formatCardioActivity) — only
 * the presentation is new, per the redesign review's point 3 distinction
 * between reusing business logic and reusing UI.
 */
export function LastWorkoutCard({ workout }: LastWorkoutCardProps) {
  const navigate = useNavigate();

  const isCircuit = !!workout.circuit;
  const stats = isCircuit ? null : computeWorkoutDisplayStats(workout.exercises);
  const dominant = stats ? computeDominantSignature(stats) : null;

  const icon = isCircuit ? (
    <CardioSignature pattern="interval" tone="circuit" height={ICON_HEIGHT} />
  ) : dominant === "strength" ? (
    <MuscleMap intensity={computeIntensity(workout.exercises)} height={ICON_HEIGHT} />
  ) : (
    <CardioSignature pattern={resolveCardioPattern(stats!)} height={ICON_HEIGHT} />
  );

  const statLine = isCircuit
    ? `${formatDuration(workout.durationSec)} · ${workout.circuit!.config.stations.length} stations · ${workout.circuit!.roundsCompleted}/${workout.circuit!.config.rounds} rounds`
    : stats!.mode === "cardio"
      ? `${formatDuration(workout.durationSec)}${
          stats!.primaryCardio
            ? ` · ${formatCardioActivity(stats!.primaryCardio)}`
            : stats!.cardioActivities.length > 0
              ? ` · ${stats!.cardioActivities.length} cardio activities`
              : ""
        }`
      : `${formatDuration(workout.durationSec)} · ${stats!.totalSets} sets · ${Math.round(stats!.totalVolume)} kg`;

  return (
    <div
      onClick={() => navigate({ to: "/history/$id", params: { id: String(workout.id) } })}
      className="flex cursor-pointer items-center gap-4 rounded-2xl bg-card p-4 transition active:scale-[0.99]"
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-base font-semibold">{workout.name}</h2>
        <p className="text-xs text-muted-foreground">{statLine}</p>
      </div>
    </div>
  );
}
