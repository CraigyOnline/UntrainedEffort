import { useEffect, useRef, useState } from "react";
import type { IntervalTimerState } from "@/lib/db";
import type { IntervalConfig } from "@/lib/exercises";

export interface IntervalTimerProps {
  config: IntervalConfig;
  /** Undefined means "never started" — the Ready state. There is no
   *  separate started/done flag; both are derived below. */
  state: IntervalTimerState | undefined;
  onChange: (next: IntervalTimerState | undefined) => void;
  onComplete: () => void;
}

function phaseSeconds(config: IntervalConfig, phase: "work" | "rest"): number {
  return phase === "work" ? config.workSeconds : config.restSeconds;
}

export function isIntervalDone(
  state: IntervalTimerState | undefined,
  config: IntervalConfig,
): boolean {
  return !!state && state.round > config.rounds;
}

/**
 * Walks a running timer forward past any phase/round boundaries that have
 * already elapsed in real time. This is what makes resuming after the app
 * was closed for any length of time land on the correct round, phase and
 * remaining time — each new deadline is chained off the previous one
 * (never off "now"), so it can't drift, and the loop can cross several
 * boundaries at once if the app was closed through more than one.
 */
function advance(
  state: IntervalTimerState,
  config: IntervalConfig,
  now: number,
): IntervalTimerState {
  if (state.status.kind !== "running") return state;

  let round = state.round;
  let phase = state.phase;
  let endsAt = state.status.endsAt;

  while (endsAt <= now && round <= config.rounds) {
    if (phase === "work") {
      phase = "rest";
      endsAt += phaseSeconds(config, phase) * 1000;
    } else if (round >= config.rounds) {
      // Final round's rest just ended — bump round past the max so
      // isIntervalDone reads true, rather than a separate flag.
      round += 1;
      break;
    } else {
      round += 1;
      phase = "work";
      endsAt += phaseSeconds(config, phase) * 1000;
    }
  }

  if (round > config.rounds) {
    return { round, phase, status: { kind: "paused", remaining: 0 } };
  }
  return { round, phase, status: { kind: "running", endsAt } };
}

export function IntervalTimer({ config, state, onChange, onComplete }: IntervalTimerProps) {
  // Forces a re-render every 250ms while running so the live countdown
  // stays current. The deadline (state.status.endsAt) is the actual
  // source of truth — this tick never drives the value itself, only
  // when we re-read Date.now() against it. Also included in the
  // catch-up effect's deps below, so that effect actually re-checks the
  // deadline every 250ms rather than only once when state/config change.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state?.status.kind !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [state?.status.kind]);

  // Catch-up: on mount (app just reopened) and on every tick, fold in any
  // boundaries that have already passed.
  useEffect(() => {
    if (!state || state.status.kind !== "running") return;
    const now = Date.now();
    if (state.status.endsAt > now) return;
    onChange(advance(state, config, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config, tick]);

  // Fires onComplete exactly once, on the false→true transition of "done"
  // observed during this component's lifetime — not on mount if resuming
  // an already-completed interval, which would otherwise redundantly
  // re-trigger completeIntervalExercise every time the app reopens.
  const prevDoneRef = useRef(isIntervalDone(state, config));
  useEffect(() => {
    const done = isIntervalDone(state, config);
    if (done && !prevDoneRef.current) onComplete();
    prevDoneRef.current = done;
  }, [state, config, onComplete]);

  const done = isIntervalDone(state, config);
  const started = state !== undefined;
  const running = state?.status.kind === "running";
  const round = state?.round ?? 1;
  const phase = state?.phase ?? "work";

  const remaining = !state
    ? config.workSeconds
    : state.status.kind === "paused"
      ? state.status.remaining
      : Math.max(0, Math.ceil((state.status.endsAt - Date.now()) / 1000));

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function toggle() {
    if (done) return;
    if (!state) {
      onChange({
        round: 1,
        phase: "work",
        status: { kind: "running", endsAt: Date.now() + config.workSeconds * 1000 },
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

  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Interval
        </p>
        <div className="mt-1 flex gap-4 tabular-nums">
          <span>
            Rounds: <b>{config.rounds}</b>
          </span>
          <span>
            Work: <b>{fmt(config.workSeconds)}</b>
          </span>
          <span>
            Rest: <b>{fmt(config.restSeconds)}</b>
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
        {/* Work phase uses the dedicated --intensity token (amber, reads as
            exertion); rest phase reuses primary (green, reads as recovery).
            Work previously reused --destructive (red) here, but that token
            already means delete/cancel/error everywhere else in the app —
            an intense-but-fine phase of a workout shouldn't borrow the
            colour a user has learned to associate with something going
            wrong. See --intensity's definition in styles.css. */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Interval Timer
            </p>
            <p className="text-sm font-semibold">
              {done ? "Complete" : !started ? "Ready" : phase === "work" ? "WORK" : "REST"} · Round{" "}
              {Math.min(round, config.rounds)}/{config.rounds}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
