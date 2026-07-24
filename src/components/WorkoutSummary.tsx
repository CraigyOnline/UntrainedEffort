import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { computeIntensity } from "@/lib/muscles";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";

interface Props {
  name?: string;
  durationSec: number;
  exercises: Workout["exercises"];
  showName?: boolean;
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

export function WorkoutSummary({ name, durationSec, exercises, showName, revealed }: Props) {
  const intensity = computeIntensity(exercises);
  const { totalSets, totalVolume } = computeWorkoutStats(exercises);

  const animated = revealed !== undefined;

  const statClass = (delayMs: number) => {
    if (!animated) return { className: "", style: undefined };
    return {
      className: revealed ? "animate-[drop-settle-stat_380ms_linear_forwards]" : "opacity-0",
      style: { animationDelay: `${delayMs}ms` },
    };
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div {...statClass(320)}>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="font-bold">{formatDuration(durationSec)}</p>
        </div>
        <div {...statClass(390)}>
          <p className="text-xs text-muted-foreground">Sets</p>
          <p className="font-bold">{totalSets}</p>
        </div>
        <div {...statClass(460)}>
          <p className="text-xs text-muted-foreground">Volume</p>
          <p className="font-bold">{Math.round(totalVolume)} kg</p>
        </div>
      </div>
      <ExpandableMuscleMap intensity={intensity} />
    </div>
  );
}
