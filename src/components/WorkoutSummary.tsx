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
   *  component running its own separate animation state. Omitted (History's
   *  static usage) defaults to true, i.e. always-revealed — a CSS
   *  transition doesn't play if the property is already at its target
   *  value on first paint, so this is a no-op there, not just a subtle one. */
  revealed?: boolean;
}

export function WorkoutSummary({ name, durationSec, exercises, showName, revealed = true }: Props) {
  const intensity = computeIntensity(exercises);
  const { totalSets, totalVolume } = computeWorkoutStats(exercises);

  const statClass = (delayMs: number) => ({
    className: `transition-all duration-300 ease-out ${revealed ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`,
    style: { transitionDelay: `${delayMs}ms` },
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div {...statClass(80)}>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="font-bold">{formatDuration(durationSec)}</p>
        </div>
        <div {...statClass(140)}>
          <p className="text-xs text-muted-foreground">Sets</p>
          <p className="font-bold">{totalSets}</p>
        </div>
        <div {...statClass(200)}>
          <p className="text-xs text-muted-foreground">Volume</p>
          <p className="font-bold">{Math.round(totalVolume)} kg</p>
        </div>
      </div>
      <ExpandableMuscleMap intensity={intensity} />
    </div>
  );
}
