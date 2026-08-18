import { describe, expect, it, vi, afterEach } from "vitest";
import type { Workout, WorkoutSet, PRRecord } from "@/lib/db";
import { selectTrainingSignal, type CurrentFocus } from "@/lib/trainingSignal";

const DAY_MS = 86400000;

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { weight: 0, reps: 0, completed: true, ...overrides };
}

function makeWorkouts(count: number, exerciseId: string, startedAt: number): Workout[] {
  const sets: WorkoutSet[] =
    exerciseId === "treadmill"
      ? [makeSet({ weight: 5, duration: 1500 })]
      : [makeSet({ weight: 20, reps: 8 })];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: "Workout",
    startedAt: startedAt - i * DAY_MS,
    endedAt: startedAt - i * DAY_MS,
    durationSec: 1800,
    exercises: [{ exerciseId, sets }],
  }));
}

function makePR(overrides: Partial<PRRecord> = {}): PRRecord {
  return {
    id: 1,
    exerciseId: "bench-press",
    type: "weight",
    value: 42.5,
    previousBest: 40,
    delta: 2.5,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeFocus(overrides: Partial<CurrentFocus> = {}): CurrentFocus {
  return {
    exerciseId: "bench-press",
    name: "Bench Press",
    status: "improving",
    best: 42.5,
    metricKind: "weight",
    lastTrainedAt: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectTrainingSignal", () => {
  it("returns null when nothing is eligible", () => {
    expect(selectTrainingSignal([], [], null)).toBeNull();
  });

  it("a recent PR outranks everything else", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const workouts = makeWorkouts(5, "treadmill", now);
    const prs = [makePR({ createdAt: now - 1 * DAY_MS })];
    const focus = makeFocus({ status: "improving", lastTrainedAt: now });

    const signal = selectTrainingSignal(workouts, prs, focus);
    expect(signal?.headline).toContain("new best");
  });

  it("a PR older than the eligibility window does not win, falling through", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const staleprs = [makePR({ createdAt: now - 21 * DAY_MS })];
    const focus = makeFocus({ status: "improving", lastTrainedAt: now });

    const signal = selectTrainingSignal([], staleprs, focus);
    expect(signal?.headline).not.toContain("new best");
    expect(signal?.headline).toContain("Moving well");
  });

  it("an improving exercise not trained recently is not eligible either", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const focus = makeFocus({ status: "improving", lastTrainedAt: now - 30 * DAY_MS });

    const signal = selectTrainingSignal([], [], focus);
    expect(signal).toBeNull();
  });

  it("3+ sessions this week is a consistency signal when nothing higher-priority fires", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const workouts = makeWorkouts(3, "bench-press", now);

    const signal = selectTrainingSignal(workouts, [], null);
    expect(signal?.headline).toBe("You're training consistently");
  });

  it("2+ recent cardio sessions is a signal when nothing else qualifies", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const workouts = makeWorkouts(2, "treadmill", now);

    const signal = selectTrainingSignal(workouts, [], null);
    expect(signal?.headline).toContain("Cardio");
  });

  it("a single cardio session is not enough on its own", () => {
    const now = 10_000 * DAY_MS;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const workouts = makeWorkouts(1, "treadmill", now);

    expect(selectTrainingSignal(workouts, [], null)).toBeNull();
  });
});
