import type { CircuitConfig, CircuitTimerState } from "@/lib/db";

export type CircuitPhase = "work" | "rest" | "roundRest";

/** The three fields that identify a point in the sequence, without the
 *  running/paused status wrapper — the shared shape stepForward/
 *  stepBackward operate on, since neither cares whether the timer is
 *  currently ticking. */
export interface CircuitStep {
  round: number;
  stationIndex: number;
  phase: CircuitPhase;
}

export function isCircuitDone(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
): boolean {
  return !!state && state.round > config.rounds;
}

export function phaseSeconds(
  config: CircuitConfig,
  stationIndex: number,
  phase: CircuitPhase,
): number {
  if (phase === "roundRest") return config.roundRestSeconds;
  const station = config.stations[stationIndex];
  return phase === "work" ? station.workSeconds : station.restSeconds;
}

/**
 * Steps forward exactly one phase in the sequence: work → rest → (next
 * station's work, or — if that was the last station — either done, round
 * rest, or straight into round 2 depending on config). This is the single
 * source of truth for "what comes next," used both by CircuitTimer's
 * advance() (which calls it in a loop, once per elapsed boundary) and by
 * skipForward below (which calls it once, ignoring remaining time).
 * roundRest deliberately leaves stationIndex at the last station rather
 * than resetting it — see CircuitTimerState's doc comment in db.ts.
 */
export function stepForward(step: CircuitStep, config: CircuitConfig): CircuitStep {
  const isLastStation = step.stationIndex >= config.stations.length - 1;

  if (step.phase === "work") {
    return { ...step, phase: "rest" };
  }
  if (step.phase === "rest" && !isLastStation) {
    return { round: step.round, stationIndex: step.stationIndex + 1, phase: "work" };
  }
  if (step.phase === "rest" && isLastStation) {
    if (step.round >= config.rounds) {
      // Bump round past the max so isCircuitDone reads true, rather than
      // a separate flag — same trick IntervalTimer uses.
      return { ...step, round: step.round + 1 };
    }
    if (config.roundRestEnabled) {
      return { ...step, phase: "roundRest" };
    }
    return { round: step.round + 1, stationIndex: 0, phase: "work" };
  }
  // phase === "roundRest"
  return { round: step.round + 1, stationIndex: 0, phase: "work" };
}

/**
 * The inverse of stepForward — steps back exactly one phase. Only ever
 * called by manual skip-back (there's no "reverse time" concept for the
 * auto-advancing timer, so this has no forward counterpart in advance()).
 * Written as a direct case-by-case mirror of stepForward's transitions
 * rather than derived from it, since inverting a step function generally
 * isn't well-defined without knowing which case produced a given state —
 * here it happens to be, because each case's *input* phase is unique, so
 * checking the current phase is enough to know which forward case to
 * undo.
 */
export function stepBackward(step: CircuitStep, config: CircuitConfig): CircuitStep {
  const lastStationIndex = config.stations.length - 1;

  if (step.phase === "rest") {
    return { ...step, phase: "work" };
  }
  if (step.phase === "roundRest") {
    return { ...step, phase: "rest", stationIndex: lastStationIndex };
  }
  // phase === "work"
  if (step.stationIndex > 0) {
    return { ...step, stationIndex: step.stationIndex - 1, phase: "rest" };
  }
  if (step.round <= 1) {
    // Already at the very first phase — nothing earlier to go to.
    return step;
  }
  const prevRound = step.round - 1;
  return {
    round: prevRound,
    stationIndex: lastStationIndex,
    phase: config.roundRestEnabled ? "roundRest" : "rest",
  };
}

function stepToState(
  step: CircuitStep,
  config: CircuitConfig,
  running: boolean,
  now: number,
): CircuitTimerState {
  if (step.round > config.rounds) {
    return { ...step, status: { kind: "paused", remaining: 0 } };
  }
  const duration = phaseSeconds(config, step.stationIndex, step.phase);
  return {
    ...step,
    status: running
      ? { kind: "running", endsAt: now + duration * 1000 }
      : { kind: "paused", remaining: duration },
  };
}

/** Jumps immediately to the next phase, resetting it to its full
 *  duration — as if the current phase's timer had just expired. Starting
 *  it running from an unstarted timer matches Start's own behavior. */
export function skipForward(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
  now: number,
): CircuitTimerState {
  const step: CircuitStep = state ?? { round: 1, stationIndex: 0, phase: "work" };
  const running = state ? state.status.kind === "running" : true;
  return stepToState(stepForward(step, config), config, running, now);
}

/** Jumps immediately to the previous phase, resetting it to its full
 *  duration. A no-op before the timer has ever been started (there's
 *  nothing earlier to go to). */
export function skipBack(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
  now: number,
): CircuitTimerState | undefined {
  if (!state) return state;
  const running = state.status.kind === "running";
  return stepToState(stepBackward(state, config), config, running, now);
}

/**
 * Total time remaining across the rest of the circuit — the current
 * phase's remaining time plus every phase after it, up to completion.
 * Walks stepForward the same way advance() does, but by count of steps
 * rather than elapsed time, so this has no dependency on the timer
 * actually running.
 */
export function totalRemainingSeconds(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
  now: number,
): number {
  if (isCircuitDone(state, config)) return 0;
  if (!state) return fullDurationSeconds(config);

  const currentPhaseRemaining =
    state.status.kind === "running"
      ? Math.max(0, Math.ceil((state.status.endsAt - now) / 1000))
      : state.status.remaining;

  let total = currentPhaseRemaining;
  let step: CircuitStep = {
    round: state.round,
    stationIndex: state.stationIndex,
    phase: state.phase,
  };
  for (;;) {
    const next = stepForward(step, config);
    if (next.round > config.rounds) break;
    total += phaseSeconds(config, next.stationIndex, next.phase);
    step = next;
  }
  return total;
}

function fullDurationSeconds(config: CircuitConfig): number {
  const perRound = config.stations.reduce((sum, s) => sum + s.workSeconds + s.restSeconds, 0);
  const roundRest = config.roundRestEnabled ? config.roundRestSeconds : 0;
  return perRound * config.rounds + roundRest * Math.max(0, config.rounds - 1);
}

/**
 * The exercise coming up after the current station, for an always-visible
 * "up next" line — as opposed to isCircuitDone's binary done/not-done,
 * this is undefined exactly when there's no station left after this one
 * (the current station is the circuit's last). Deliberately keyed off
 * stationIndex/round alone rather than phase: during "work" it's the
 * upcoming rest's station, during "rest" it's the same next station
 * (only now separated by nothing further), and during "roundRest"
 * stationIndex is already sitting at the last station — so one formula
 * covers all three without a phase branch.
 */
export function peekNextStationIndex(
  state: CircuitTimerState | undefined,
  config: CircuitConfig,
): number | undefined {
  const stationIndex = state?.stationIndex ?? 0;
  const round = state?.round ?? 1;
  if (stationIndex < config.stations.length - 1) return stationIndex + 1;
  if (round < config.rounds) return 0;
  return undefined;
}
