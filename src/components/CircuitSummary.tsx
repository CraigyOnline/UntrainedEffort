import type { Workout } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { getExercise } from "@/lib/exercises";
import { intensityFromExerciseIds } from "@/lib/muscles";
import { computeDominantCircuitSignature } from "@/lib/workoutStats";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { CardioSignature } from "@/components/CardioSignature";

type Circuit = NonNullable<Workout["circuit"]>;

interface StatsRowProps {
  durationSec: number;
  circuit: Circuit;
}

/** The Duration/Stations/Rounds counterpart to WorkoutStatsRow, for a
 *  circuit's actual data shape (stations/rounds, not exercises/sets). */
export function CircuitStatsRow({ durationSec, circuit }: StatsRowProps) {
  const { config, roundsCompleted } = circuit;
  return (
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
  );
}

interface SignatureIconProps {
  circuit: Circuit;
  className?: string;
}

/** Muscle map or CardioSignature, chosen by station composition. Circuits
 *  are round-based work/rest by structure regardless of that composition,
 *  so a cardio-dominant circuit always gets the "interval" pattern — no
 *  steady/interval judgment call to make the way regular cardio workouts
 *  have (see resolveCardioPattern). */
export function CircuitSignatureIcon({ circuit, className }: SignatureIconProps) {
  const stationExerciseIds = circuit.config.stations.map((s) => s.exerciseId);
  const dominant = computeDominantCircuitSignature(circuit.config.stations);

  if (dominant === "strength") {
    const intensity = intensityFromExerciseIds(stationExerciseIds);
    if (Object.keys(intensity).length === 0) return null;
    return <ExpandableMuscleMap intensity={intensity} className={className} />;
  }

  return <CardioSignature pattern="interval" tone="circuit" className={className} />;
}

interface StationListProps {
  circuit: Circuit;
}

/** Read-only station-by-station breakdown — the "what you did" answer for
 *  a circuit, since its stations live in circuit.config rather than
 *  exercises and so don't show up in any exercise-list rendering built
 *  for regular workouts. Mirrors CircuitLiveSession's in-progress row
 *  styling, minus the current-station highlighting (nothing is "current"
 *  once the circuit is finished). Uses bg-muted rather than
 *  CircuitLiveSession's bg-card since these rows sit nested inside a
 *  bg-card container here (the default CircuitSummary export below) or
 *  directly on the page (the workout-complete screen) — bg-muted reads
 *  correctly in both, matching the convention already used for nested
 *  rows in WorkoutSummary's CardioPerformanceCard/IntervalPerformanceCard. */
export function CircuitStationList({ circuit }: StationListProps) {
  return (
    <ol className="flex flex-col gap-2">
      {circuit.config.stations.map((s, i) => {
        const def = getExercise(s.exerciseId);
        return (
          <li
            key={i}
            className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5"
          >
            <span className="truncate text-sm font-medium">
              {i + 1}. {def?.name ?? s.exerciseId}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {s.workSeconds}s / {s.restSeconds}s
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  name?: string;
  durationSec: number;
  circuit: Circuit;
  showName?: boolean;
}

/**
 * WorkoutSummary's counterpart for circuit/HIIT workouts, composing all
 * three pieces above for the history detail screen. Exists because a
 * circuit's data lives entirely in Workout.circuit — exercises stays []
 * for these — so WorkoutSummary has no way to compute meaningful stats or
 * a signature for one: passing a circuit workout's (empty) exercises into
 * it previously produced a nonsense "Sets: 0 / Volume: 0 kg" stat row and
 * an empty, unhighlighted muscle map. Call sites should branch on
 * `workout.circuit` and use this instead of WorkoutSummary for those.
 *
 * The workout-complete screen (_app.workout.tsx) uses the three exported
 * pieces individually instead, to preserve its own staged reveal timing
 * rather than mounting them all at once via this component.
 */
export function CircuitSummary({ name, durationSec, circuit, showName }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3">
      {showName && name && <h2 className="text-lg font-bold">{name}</h2>}
      <CircuitStatsRow durationSec={durationSec} circuit={circuit} />
      <CircuitSignatureIcon circuit={circuit} className="mx-auto" />
      <CircuitStationList circuit={circuit} />
    </div>
  );
}
