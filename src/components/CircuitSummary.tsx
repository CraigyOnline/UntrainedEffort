import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { getExercise, isCardio } from "@/lib/exercises";
import { intensityFromExerciseIds } from "@/lib/muscles";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { CardioSignature } from "@/components/CardioSignature";

interface Props {
  name?: string;
  durationSec: number;
  circuit: NonNullable<Workout["circuit"]>;
  showName?: boolean;
}

/**
 * WorkoutSummary's counterpart for circuit/HIIT workouts. Exists because a
 * circuit's data lives entirely in Workout.circuit — exercises stays []
 * for these — so WorkoutSummary has no way to compute meaningful stats or
 * a signature for one: passing a circuit workout's (empty) exercises into
 * it previously produced a nonsense "Sets: 0 / Volume: 0 kg" stat row and
 * an empty, unhighlighted muscle map. Call sites should branch on
 * `workout.circuit` and use this instead of WorkoutSummary for those.
 */
export function CircuitSummary({ name, durationSec, circuit, showName }: Props) {
  const { config, roundsCompleted } = circuit;
  const stationExerciseIds = config.stations.map((s) => s.exerciseId);

  const cardioStationCount = stationExerciseIds.filter((id) => {
    const def = getExercise(id);
    return def ? isCardio(def) : false;
  }).length;
  const strengthStationCount = stationExerciseIds.length - cardioStationCount;
  // Ties favor strength, matching computeDominantSignature's tie-breaking
  // for regular workouts.
  const dominant = cardioStationCount > strengthStationCount ? "cardio" : "strength";

  const intensity = intensityFromExerciseIds(stationExerciseIds);
  const hasMuscleData = Object.keys(intensity).length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="font-bold">{formatDuration(durationSec)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stations</p>
          <p className="font-bold">{config.stations.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rounds</p>
          <p className="font-bold">
            {roundsCompleted}/{config.rounds}
          </p>
        </div>
      </div>

      {dominant === "strength" ? (
        hasMuscleData && <ExpandableMuscleMap intensity={intensity} />
      ) : (
        // Circuits are round-based work/rest by structure regardless of
        // station composition, so "interval" is always the right pattern
        // here — no steady/interval choice to make the way regular
        // cardio workouts have.
        <CardioSignature pattern="interval" className="mx-auto" />
      )}
    </div>
  );
}
