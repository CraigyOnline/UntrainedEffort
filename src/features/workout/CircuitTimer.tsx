import { useEffect, useRef, useState } from "react";
import type { CircuitConfig, CircuitTimerState } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { isCircuitDone } from "@/features/workout/circuitTimer";

export interface CircuitTimerProps {
  config: CircuitConfig;
  /** Undefined means "never started" — the Ready state. There is no
   *  separate started/done flag; both are derived below. */
  state: CircuitTimerState | undefined;
  onChange: (next: CircuitTimerState | undefined) => void;
  onComplete: () => void;
}

function phaseSeconds(
  config: CircuitConfig,
  stationIndex: number,
  phase: "work" | "rest" | "roundRest",
): number {
  if (phase === "roundRest") return config.roundRestSeconds;
  const station = config.stations[stationIndex];
  return phase === "work" ? station.workSeconds : station.restSeconds;
}

/**
 * Walks a running timer forward past any station/phase/round boundaries
 * that have already elapsed in real time — the circuit counterpart of
 * IntervalTimer's advance(), generalized from a fixed two-phase cycle to
 * an arbitrary sequence: each station's work → rest, stepping to the next
 * station's work after that, until the last station's rest ends a lap —
 * at which point it's the final round (done), a round rest (if enabled),
 * or straight into round 2's first station. Each new deadline is chained
 * off the previous one (never off "now"), so it can't drift, and the loop
 * can cross several boundaries at once if the app was closed through
 * more than one.
 */
function advance(state: CircuitTimerState, config: CircuitConfig, now: number): CircuitTimerState {
  if (state.status.kind !== "running") return state;

  let { round, stationIndex, phase } = state;
  let endsAt = state.status.endsAt;

  while (endsAt <= now && round <= config.rounds) {
    const isLastStation = stationIndex >= config.stations.length - 1;

    if (phase === "work") {
      phase = "rest";
      endsAt += phaseSeconds(config, stationIndex, phase) * 1000;
    } else if (phase === "rest" && !isLastStation) {
      stationIndex += 1;
      phase = "work";
      endsAt += phaseSeconds(config, stationIndex, phase) * 1000;
    } else if (phase === "rest" && isLastStation) {
      // A full lap through every station just finished.
      if (round >= config.rounds) {
        // Bump round past the max so isCircuitDone reads true, rather
        // than a separate flag — same trick IntervalTimer uses.
        round += 1;
        break;
      } else if (config.roundRestEnabled) {
        phase = "roundRest";
        endsAt += config.roundRestSeconds * 1000;
      } else {
        round += 1;
        stationIndex = 0;
        phase = "work";
        endsAt += phaseSeconds(config, stationIndex, phase) * 1000;
      }
    } else {
      // phase === "roundRest"
      round += 1;
      stationIndex = 0;
      phase = "work";
      endsAt += phaseSeconds(config, stationIndex, phase) * 1000;
    }
  }

  if (round > config.rounds) {
    return { round, stationIndex, phase, status: { kind: "paused", remaining: 0 } };
  }
  return { round, stationIndex, phase, status: { kind: "running", endsAt } };
}

export function CircuitTimer({ config, state, onChange, onComplete }: CircuitTimerProps) {
  // Same 250ms re-render tick IntervalTimer uses, for the same reason —
  // the deadline is the source of truth; this just forces a re-read of
  // Date.now() against it while running.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state?.status.kind !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [state?.status.kind]);

  useEffect(() => {
    if (!state || state.status.kind !== "running") return;
    const now = Date.now();
    if (state.status.endsAt > now) return;
    onChange(advance(state, config, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config, tick]);

  // Fires onComplete exactly once, on the false→true transition of "done"
  // observed during this component's lifetime — see IntervalTimer for
  // why this matters (avoids re-firing on every app reopen).
  const prevDoneRef = useRef(isCircuitDone(state, config));
  useEffect(() => {
    const done = isCircuitDone(state, config);
    if (done && !prevDoneRef.current) onComplete();
    prevDoneRef.current = done;
  }, [state, config, onComplete]);

  const done = isCircuitDone(state, config);
  const started = state !== undefined;
  const running = state?.status.kind === "running";
  const round = state?.round ?? 1;
  const stationIndex = state?.stationIndex ?? 0;
  const phase = state?.phase ?? "work";

  const currentStation = config.stations[Math.min(stationIndex, config.stations.length - 1)];
  const currentStationName =
    getExercise(currentStation?.exerciseId)?.name ?? currentStation?.exerciseId;
  const nextStationName =
    phase === "roundRest"
      ? (getExercise(config.stations[0]?.exerciseId)?.name ?? config.stations[0]?.exerciseId)
      : undefined;

  const remaining = !state
    ? (config.stations[0]?.workSeconds ?? 0)
    : state.status.kind === "paused"
      ? state.status.remaining
      : Math.max(0, Math.ceil((state.status.endsAt - Date.now()) / 1000));

  function toggle() {
    if (done) return;
    if (!state) {
      onChange({
        round: 1,
        stationIndex: 0,
        phase: "work",
        status: {
          kind: "running",
          endsAt: Date.now() + (config.stations[0]?.workSeconds ?? 0) * 1000,
        },
      });
      return;
    }
    if (state.status.kind === "running") {
      const remainingSec = Math.max(0, Math.round((state.status.endsAt - Date.now()) / 1000));
      onChange({ ...state, status: { kind: "paused", remaining: remainingSec } });
    } else {
      onChange({
        ...state,
        status: { kind: "running", endsAt: Date.now() + state.status.remaining * 1000 },
      });
    }
  }

  function reset() {
    // Clearing back to undefined is the same as "never started" — there's
    // no separate flag to zero out in step with it.
    onChange(undefined);
  }

  const mm = Math.floor(Math.max(0, remaining) / 60);
  const ss = Math.max(0, remaining) % 60;

  const phaseLabel = done
    ? "Complete"
    : !started
      ? "Ready"
      : phase === "work"
        ? "WORK"
        : phase === "rest"
          ? "REST"
          : "ROUND REST";

  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Circuit
        </p>
        <div className="mt-1 flex gap-4 tabular-nums">
          <span>
            Rounds: <b>{config.rounds}</b>
          </span>
          <span>
            Stations: <b>{config.stations.length}</b>
          </span>
        </div>
      </div>

      <div
        className={`rounded-lg px-3 py-2 ${
          done
            ? "bg-primary/10"
            : !started
              ? "bg-secondary"
              : phase === "work"
                ? "bg-intensity/15"
                : "bg-primary/15"
        }`}
      >
        {/* Same colour reasoning as IntervalTimer: work uses --intensity
            (amber, reads as exertion), rest and round rest reuse primary
            (green, reads as recovery) rather than --destructive. */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Circuit Timer
            </p>
            <p className="text-sm font-semibold">
              {phaseLabel} · Round {Math.min(round, config.rounds)}/{config.rounds}
            </p>
            {!done && (phase === "work" || phase === "rest") && currentStationName && (
              <p className="truncate text-xs text-muted-foreground">{currentStationName}</p>
            )}
            {!done && phase === "roundRest" && nextStationName && (
              <p className="truncate text-xs text-muted-foreground">Up next: {nextStationName}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums text-2xl font-bold">
              {mm}:{String(ss).padStart(2, "0")}
            </span>
            {!done && (
              <button
                onClick={toggle}
                className="min-w-[64px] rounded-lg bg-primary px-2 py-1 text-center text-xs text-primary-foreground"
              >
                {running ? "Pause" : started ? "Resume" : "Start"}
              </button>
            )}
            <button
              onClick={reset}
              className="min-w-[56px] rounded-lg bg-secondary px-2 py-1 text-center text-xs"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
