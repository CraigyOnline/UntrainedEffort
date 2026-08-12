import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import type { CircuitConfig, CircuitTimerState } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { formatTime } from "@/lib/format";
import {
  isCircuitDone,
  peekNextStationIndex,
  phaseSeconds,
  skipBack,
  skipForward,
  stepForward,
  type CircuitStep,
} from "@/features/workout/circuitTimer";

export interface CircuitTimerProps {
  config: CircuitConfig;
  /** Undefined means "never started" — the Ready state. There is no
   *  separate started/done flag; both are derived below. */
  state: CircuitTimerState | undefined;
  onChange: (next: CircuitTimerState | undefined) => void;
  onComplete: () => void;
}

/**
 * Walks a running timer forward past any station/phase/round boundaries
 * that have already elapsed in real time — the circuit counterpart of
 * IntervalTimer's advance(). The actual sequence logic (what phase comes
 * next) lives in circuitTimer.ts's stepForward, shared with skipForward;
 * this just calls it in a loop until the deadline is back in the future,
 * so it can cross several boundaries at once if the app was closed
 * through more than one. Each new deadline is chained off the previous
 * one (never off "now"), so it can't drift.
 */
function advance(state: CircuitTimerState, config: CircuitConfig, now: number): CircuitTimerState {
  if (state.status.kind !== "running") return state;

  let step: CircuitStep = {
    round: state.round,
    stationIndex: state.stationIndex,
    phase: state.phase,
  };
  let endsAt = state.status.endsAt;

  while (endsAt <= now && step.round <= config.rounds) {
    const next = stepForward(step, config);
    if (next.round > config.rounds) {
      step = next;
      break;
    }
    endsAt += phaseSeconds(config, next.stationIndex, next.phase) * 1000;
    step = next;
  }

  if (step.round > config.rounds) {
    return { ...step, status: { kind: "paused", remaining: 0 } };
  }
  return { ...step, status: { kind: "running", endsAt } };
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
  const isRest = phase === "rest" || phase === "roundRest";

  const currentStation = config.stations[Math.min(stationIndex, config.stations.length - 1)];
  const currentStationName =
    getExercise(currentStation?.exerciseId)?.name ?? currentStation?.exerciseId;

  const nextIndex = peekNextStationIndex(state, config);
  const nextStationName =
    nextIndex !== undefined
      ? (getExercise(config.stations[nextIndex]?.exerciseId)?.name ??
        config.stations[nextIndex]?.exerciseId)
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

  function handleSkipForward() {
    if (done) return;
    onChange(skipForward(state, config, Date.now()));
  }

  function handleSkipBack() {
    onChange(skipBack(state, config, Date.now()));
  }

  const phaseLabel = done
    ? "Complete"
    : !started
      ? "Ready"
      : phase === "work"
        ? "WORK"
        : phase === "rest"
          ? "REST"
          : "ROUND REST";

  // Work uses --intensity (amber/orange, "active exertion" — see
  // styles.css), rest and round rest share --circuit-rest (blue/cyan).
  // Both were chosen specifically to avoid colliding with --destructive
  // (red = delete/cancel/error elsewhere in the app) — see styles.css's
  // comments on both tokens. Full literal class strings on purpose —
  // Tailwind can't resolve a dynamically-interpolated class name like
  // `text-${x}` at build time, so this has to be an explicit ternary per
  // element rather than one shared "color class" variable.
  const textColorClass =
    done || !started ? "text-foreground" : isRest ? "text-circuit-rest" : "text-intensity";
  const labelColorClass =
    done || !started ? "text-muted-foreground" : isRest ? "text-circuit-rest" : "text-intensity";

  return (
    <div className="mt-3">
      <div
        className={`rounded-2xl border-2 px-4 py-6 text-center transition-colors ${
          done
            ? "border-primary/40 bg-primary/10"
            : !started
              ? "border-border bg-secondary/50"
              : isRest
                ? "border-circuit-rest bg-circuit-rest/20"
                : "border-intensity bg-intensity/20"
        }`}
      >
        <p className={`text-xs font-bold uppercase tracking-widest ${labelColorClass}`}>
          {phaseLabel} · Round {Math.min(round, config.rounds)}/{config.rounds}
        </p>

        {!done && currentStationName && (
          <p className={`mt-2 truncate text-2xl font-extrabold ${textColorClass}`}>
            {currentStationName}
          </p>
        )}
        {done && <p className="mt-2 text-2xl font-extrabold text-primary">Circuit complete!</p>}

        {!done && (
          <p className={`mt-4 tabular-nums text-6xl font-black leading-none ${textColorClass}`}>
            {formatTime(Math.max(0, remaining))}
          </p>
        )}

        {!done && nextStationName && (
          <p className="mt-3 truncate text-sm text-muted-foreground">Up next: {nextStationName}</p>
        )}

        {!done && (
          <div className="mt-5 flex items-center justify-center gap-4">
            <button
              onClick={handleSkipBack}
              disabled={!started}
              aria-label="Previous phase"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground disabled:opacity-30"
            >
              <SkipBack className="h-4 w-4 fill-current" />
            </button>
            <button
              onClick={toggle}
              aria-label={running ? "Pause" : started ? "Resume" : "Start"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              {running ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="h-6 w-6 fill-current" />
              )}
            </button>
            <button
              onClick={handleSkipForward}
              aria-label="Next phase"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-foreground"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </div>
        )}

        <button
          onClick={reset}
          className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground active:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
    </div>
  );
}
