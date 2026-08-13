import { describe, expect, it } from "vitest";
import type { CircuitConfig, CircuitTimerState } from "@/lib/db";
import {
  isCircuitDone,
  peekNextStationIndex,
  phaseSeconds,
  skipBack,
  skipForward,
  stepBackward,
  stepForward,
  totalRemainingSeconds,
  type CircuitStep,
} from "@/features/workout/circuitTimer";

// Two stations, two rounds, round rest on — enough to exercise every
// transition (last-station wraparound, round rest, final-round completion)
// without a bigger fixture than the logic needs.
function config(overrides: Partial<CircuitConfig> = {}): CircuitConfig {
  return {
    stations: [
      { exerciseId: "a", workSeconds: 10, restSeconds: 5 },
      { exerciseId: "b", workSeconds: 8, restSeconds: 4 },
    ],
    rounds: 2,
    roundRestSeconds: 30,
    roundRestEnabled: true,
    ...overrides,
  };
}

describe("isCircuitDone", () => {
  it("is false with no state, and false while round is within range", () => {
    expect(isCircuitDone(undefined, config())).toBe(false);
    const inRange: CircuitTimerState = {
      round: 2,
      stationIndex: 0,
      phase: "work",
      status: { kind: "paused", remaining: 10 },
    };
    expect(isCircuitDone(inRange, config())).toBe(false);
  });

  it("is true once round has been bumped past the configured max", () => {
    const done: CircuitTimerState = {
      round: 3,
      stationIndex: 1,
      phase: "rest",
      status: { kind: "paused", remaining: 0 },
    };
    expect(isCircuitDone(done, config())).toBe(true);
  });
});

describe("phaseSeconds", () => {
  it("reads work/rest duration from the station, and roundRest from config", () => {
    const c = config();
    expect(phaseSeconds(c, 0, "work")).toBe(10);
    expect(phaseSeconds(c, 0, "rest")).toBe(5);
    expect(phaseSeconds(c, 1, "work")).toBe(8);
    expect(phaseSeconds(c, 1, "rest")).toBe(4);
    // roundRest ignores the station index entirely
    expect(phaseSeconds(c, 0, "roundRest")).toBe(30);
    expect(phaseSeconds(c, 1, "roundRest")).toBe(30);
  });
});

describe("stepForward", () => {
  it("work moves to rest at the same station", () => {
    const step: CircuitStep = { round: 1, stationIndex: 0, phase: "work" };
    expect(stepForward(step, config())).toEqual({
      round: 1,
      stationIndex: 0,
      phase: "rest",
    });
  });

  it("rest at a non-last station moves to the next station's work", () => {
    const step: CircuitStep = { round: 1, stationIndex: 0, phase: "rest" };
    expect(stepForward(step, config())).toEqual({
      round: 1,
      stationIndex: 1,
      phase: "work",
    });
  });

  it("rest at the last station goes to roundRest when enabled and rounds remain", () => {
    const step: CircuitStep = { round: 1, stationIndex: 1, phase: "rest" };
    expect(stepForward(step, config())).toEqual({
      round: 1,
      stationIndex: 1, // deliberately not reset — see db.ts's doc comment
      phase: "roundRest",
    });
  });

  it("rest at the last station skips straight to round 2 work when round rest is disabled", () => {
    const step: CircuitStep = { round: 1, stationIndex: 1, phase: "rest" };
    const c = config({ roundRestEnabled: false });
    expect(stepForward(step, c)).toEqual({
      round: 2,
      stationIndex: 0,
      phase: "work",
    });
  });

  it("roundRest always advances into the next round's first station", () => {
    const step: CircuitStep = { round: 1, stationIndex: 1, phase: "roundRest" };
    expect(stepForward(step, config())).toEqual({
      round: 2,
      stationIndex: 0,
      phase: "work",
    });
  });

  it("rest at the last station of the final round bumps round past max instead of wrapping", () => {
    const step: CircuitStep = { round: 2, stationIndex: 1, phase: "rest" };
    const result = stepForward(step, config());
    expect(result).toEqual({ round: 3, stationIndex: 1, phase: "rest" });
    const asState: CircuitTimerState = {
      ...result,
      status: { kind: "paused", remaining: 0 },
    };
    expect(isCircuitDone(asState, config())).toBe(true);
  });
});

describe("stepBackward", () => {
  it("mirrors stepForward's work->rest transition", () => {
    const step: CircuitStep = { round: 1, stationIndex: 0, phase: "rest" };
    expect(stepBackward(step, config())).toEqual({
      round: 1,
      stationIndex: 0,
      phase: "work",
    });
  });

  it("mirrors the roundRest transition back to the last station's rest", () => {
    const step: CircuitStep = { round: 1, stationIndex: 1, phase: "roundRest" };
    expect(stepBackward(step, config())).toEqual({
      round: 1,
      stationIndex: 1,
      phase: "rest",
    });
  });

  it("mirrors a mid-circuit station wraparound", () => {
    const step: CircuitStep = { round: 1, stationIndex: 1, phase: "work" };
    expect(stepBackward(step, config())).toEqual({
      round: 1,
      stationIndex: 0,
      phase: "rest",
    });
  });

  it("is a no-op at the very first phase", () => {
    const step: CircuitStep = { round: 1, stationIndex: 0, phase: "work" };
    expect(stepBackward(step, config())).toEqual(step);
  });

  it("mirrors the round boundary, landing on roundRest when enabled or rest when not", () => {
    const step: CircuitStep = { round: 2, stationIndex: 0, phase: "work" };
    expect(stepBackward(step, config())).toEqual({
      round: 1,
      stationIndex: 1,
      phase: "roundRest",
    });
    expect(stepBackward(step, config({ roundRestEnabled: false }))).toEqual({
      round: 1,
      stationIndex: 1,
      phase: "rest",
    });
  });

  it("round-trips with stepForward for every mid-circuit transition", () => {
    const c = config();
    const steps: CircuitStep[] = [
      { round: 1, stationIndex: 0, phase: "work" },
      { round: 1, stationIndex: 0, phase: "rest" },
      { round: 1, stationIndex: 1, phase: "work" },
      { round: 1, stationIndex: 1, phase: "rest" },
      { round: 1, stationIndex: 1, phase: "roundRest" },
    ];
    for (const step of steps) {
      expect(stepBackward(stepForward(step, c), c)).toEqual(step);
    }
  });
});

describe("skipForward", () => {
  it("starts a fresh circuit and advances one phase, running by default", () => {
    const now = 1_000_000;
    const result = skipForward(undefined, config(), now);
    expect(result.round).toBe(1);
    expect(result.stationIndex).toBe(0);
    expect(result.phase).toBe("rest");
    expect(result.status).toEqual({ kind: "running", endsAt: now + 5 * 1000 });
  });

  it("preserves the paused/running status of the state it started from", () => {
    const now = 1_000_000;
    const paused: CircuitTimerState = {
      round: 1,
      stationIndex: 0,
      phase: "work",
      status: { kind: "paused", remaining: 3 },
    };
    const result = skipForward(paused, config(), now);
    expect(result.phase).toBe("rest");
    expect(result.status).toEqual({ kind: "paused", remaining: 5 });
  });

  it("reports paused/remaining-0 once skipping forward finishes the circuit, regardless of running status", () => {
    const now = 1_000_000;
    const lastRest: CircuitTimerState = {
      round: 2,
      stationIndex: 1,
      phase: "rest",
      status: { kind: "running", endsAt: now + 4000 },
    };
    const result = skipForward(lastRest, config(), now);
    expect(isCircuitDone(result, config())).toBe(true);
    expect(result.status).toEqual({ kind: "paused", remaining: 0 });
  });
});

describe("skipBack", () => {
  it("is a no-op when the timer has never been started", () => {
    expect(skipBack(undefined, config(), 1_000_000)).toBeUndefined();
  });

  it("steps back one phase and resets to that phase's full duration", () => {
    const now = 1_000_000;
    const state: CircuitTimerState = {
      round: 1,
      stationIndex: 1,
      phase: "work",
      status: { kind: "running", endsAt: now + 2000 },
    };
    const result = skipBack(state, config(), now);
    expect(result).toEqual({
      round: 1,
      stationIndex: 0,
      phase: "rest",
      status: { kind: "running", endsAt: now + 5 * 1000 },
    });
  });
});

describe("totalRemainingSeconds", () => {
  it("is 0 once the circuit is done", () => {
    const done: CircuitTimerState = {
      round: 3,
      stationIndex: 1,
      phase: "rest",
      status: { kind: "paused", remaining: 0 },
    };
    expect(totalRemainingSeconds(done, config(), 0)).toBe(0);
  });

  it("returns the full circuit duration when the timer hasn't started", () => {
    // perRound = (10+5)+(8+4) = 27; *2 rounds = 54; +1 roundRest(30) = 84
    expect(totalRemainingSeconds(undefined, config(), 0)).toBe(84);
  });

  it("sums the current phase's remaining time (paused) plus every phase after it", () => {
    const state: CircuitTimerState = {
      round: 1,
      stationIndex: 1, // last station
      phase: "work", // 8s
      status: { kind: "paused", remaining: 3 },
    };
    // remaining: 3 (current work) + 4 (rest) + 30 (roundRest)
    // + round 2: 10 (work) + 5 (rest) + 8 (work) + 4 (rest) = 57
    expect(totalRemainingSeconds(state, config(), 0)).toBe(3 + 4 + 30 + 10 + 5 + 8 + 4);
  });

  it("computes the current phase's remaining time from endsAt when running", () => {
    const now = 1_000_000;
    const state: CircuitTimerState = {
      round: 2,
      stationIndex: 1,
      phase: "rest", // last phase before completion
      status: { kind: "running", endsAt: now + 2500 },
    };
    // ceil(2500/1000) = 3, nothing left after the final round's last rest
    expect(totalRemainingSeconds(state, config(), now)).toBe(3);
  });
});

describe("peekNextStationIndex", () => {
  it("returns the next station index mid-round", () => {
    const state: CircuitTimerState = {
      round: 1,
      stationIndex: 0,
      phase: "work",
      status: { kind: "paused", remaining: 10 },
    };
    expect(peekNextStationIndex(state, config())).toBe(1);
  });

  it("wraps to station 0 at the last station when another round remains", () => {
    const state: CircuitTimerState = {
      round: 1,
      stationIndex: 1,
      phase: "rest",
      status: { kind: "paused", remaining: 4 },
    };
    expect(peekNextStationIndex(state, config())).toBe(0);
  });

  it("returns undefined at the last station of the final round", () => {
    const state: CircuitTimerState = {
      round: 2,
      stationIndex: 1,
      phase: "work",
      status: { kind: "paused", remaining: 8 },
    };
    expect(peekNextStationIndex(state, config())).toBeUndefined();
  });

  it("defaults to round 1 / station 0 when there's no state yet", () => {
    expect(peekNextStationIndex(undefined, config())).toBe(1);
  });
});
