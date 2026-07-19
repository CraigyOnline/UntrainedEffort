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
}

export function WorkoutSummary({ name, durationSec, exercises, showName }: Props) {
  const intensity = computeIntensity(exercises);
  const { totalSets, totalVolume } = computeWorkoutStats(exercises);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="font-bold">{formatDuration(durationSec)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sets</p>
          <p className="font-bold">{totalSets}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Volume</p>
          <p className="font-bold">{Math.round(totalVolume)} kg</p>
        </div>
      </div>
      <ExpandableMuscleMap intensity={intensity} />
    </div>
  );
}
