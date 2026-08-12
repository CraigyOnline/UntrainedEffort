import { getExercise } from "@/lib/exercises";
import { CircuitHUD, CIRCUIT_HUD_HEIGHT } from "./CircuitHUD";
import { CircuitTimer } from "./CircuitTimer";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { ActiveSession } from "./workoutHelpers";

export interface CircuitLiveSessionProps {
  session: ActiveSession;
  setSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  onFinish: (save: boolean) => void;
}

/**
 * The live-session screen for a circuit/HIIT workout — the counterpart to
 * LiveSession, used instead of it whenever `session.circuit` is set (see
 * _app.workout.tsx). Deliberately a separate component rather than a
 * branch inside LiveSession: a circuit session has no per-set logging, no
 * rest timer (CircuitTimer's own rest phases replace it), no PR tracking,
 * and a fixed station list decided at start — none of the machinery
 * LiveSession carries for those applies here. Uses CircuitHUD rather than
 * WorkoutHUD for the same reason — see CircuitHUD's doc comment.
 */
export function CircuitLiveSession({ session, setSession, onFinish }: CircuitLiveSessionProps) {
  const [hudHeight, setHudHeight] = useState(CIRCUIT_HUD_HEIGHT);
  const circuit = session.circuit;
  if (!circuit) return null;

  const isRest = circuit.state?.phase === "rest" || circuit.state?.phase === "roundRest";

  return (
    <div className="flex flex-col gap-4 px-4 pb-8" style={{ paddingTop: hudHeight + 16 }}>
      <CircuitHUD
        session={session}
        setSession={setSession}
        onFinish={onFinish}
        onHeightChange={setHudHeight}
      />

      <CircuitTimer
        config={circuit.config}
        state={circuit.state}
        onChange={(next) =>
          setSession((s) => (s && s.circuit ? { ...s, circuit: { ...s.circuit, state: next } } : s))
        }
        onComplete={() => onFinish(true)}
      />

      <ol className="flex flex-col gap-2">
        {circuit.config.stations.map((s, i) => {
          const def = getExercise(s.exerciseId);
          const isCurrent =
            circuit.state !== undefined &&
            circuit.state.stationIndex === i &&
            (circuit.state.phase === "work" || circuit.state.phase === "rest");
          return (
            <li
              key={i}
              className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${
                isCurrent ? (isRest ? "bg-circuit-rest/15" : "bg-intensity/15") : "bg-card"
              }`}
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

      <Button
        variant="ghost"
        onClick={() => onFinish(false)}
        className="mt-2 self-center px-6 text-muted-foreground active:text-destructive"
      >
        Cancel
      </Button>
    </div>
  );
}
