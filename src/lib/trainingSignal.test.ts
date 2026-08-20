import { describe, expect, it, vi, afterEach } from "vitest";
import type { Workout, WorkoutSet, PRRecord } from "@/lib/db";
import { selectTrainingSignal, type RecentExerciseStatus } from "@/lib/trainingSignal";
import { getCalendarWeekStart } from "@/lib/format";

const DAY_MS = 86400000;

// Thursday, noon, of whatever real calendar week the test suite happens to
// run in — computed once, before any Date.now mocking below. Deliberately
// mid-week (not Monday) so a 2-3 day lookback in the consistency-signal
// tests stays inside the same calendar week rather than spilling into the
// previous one, which a naive "N days ago" literal would risk depending on
// which real-world weekday the suite runs on.
const NOW = getCalendarWeekStart(Date.now()) + 3 * DAY_MS + 43_200_000;

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

function makeExercise(overrides: Partial<RecentExerciseStatus> = {}): RecentExerciseStatus {
  return {
    exerciseId: "bench-press",
    name: "Bench Press",
    status: "improving",
    best: 42.5,
    metricKind: "weight",
    lastTrainedAt: Date.now(),
    sampleSize: 5,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectTrainingSignal", () => {
  it("returns null when nothing is eligible", () => {
    expect(selectTrainingSignal([], [], [])).toBeNull();
  });

  it("a recent PR outranks everything else", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const workouts = makeWorkouts(5, "treadmill", NOW);
    const prs = [makePR({ createdAt: NOW - 1 * DAY_MS })];
    const recent = [makeExercise({ status: "improving", lastTrainedAt: NOW })];

    const signal = selectTrainingSignal(workouts, prs, recent);
    expect(signal?.headline).toContain("new best");
  });

  it("a PR older than the eligibility window does not win, falling through", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const staleprs = [makePR({ createdAt: NOW - 21 * DAY_MS })];
    const recent = [makeExercise({ status: "improving", lastTrainedAt: NOW })];

    const signal = selectTrainingSignal([], staleprs, recent);
    expect(signal?.headline).not.toContain("new best");
    expect(signal?.headline).toContain("Moving well");
  });

  it("an improving exercise not trained recently is not eligible either", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const recent = [makeExercise({ status: "improving", lastTrainedAt: NOW - 30 * DAY_MS })];

    const signal = selectTrainingSignal([], [], recent);
    expect(signal).toBeNull();
  });

  it("the improvement signal includes a confidence caption, matching the volume-trend signal's format", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const recent = [makeExercise({ status: "improving", lastTrainedAt: NOW, sampleSize: 5 })];

    const signal = selectTrainingSignal([], [], recent);
    expect(signal?.detail).toContain("Well-established");
    expect(signal?.detail).toContain("42.5");
  });

  it("scans every recent exercise, not just the most-recently-trained one", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    // Most-recently-trained exercise is flat; a different one trained a
    // couple of days ago is genuinely improving. The old single-exercise
    // implementation would have missed this entirely.
    const recent = [
      makeExercise({
        exerciseId: "squat",
        name: "Squat",
        status: "stable",
        lastTrainedAt: NOW,
      }),
      makeExercise({
        exerciseId: "bench-press",
        name: "Bench Press",
        status: "improving",
        lastTrainedAt: NOW - 2 * DAY_MS,
        sampleSize: 5,
      }),
    ];

    const signal = selectTrainingSignal([], [], recent);
    expect(signal?.headline).toContain("Bench Press");
  });

  it("prefers established evidence over early evidence when multiple exercises are improving", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const recent = [
      makeExercise({
        exerciseId: "bench-press",
        name: "Bench Press",
        status: "improving",
        lastTrainedAt: NOW,
        sampleSize: 2, // early
      }),
      makeExercise({
        exerciseId: "squat",
        name: "Squat",
        status: "improving",
        lastTrainedAt: NOW - 1 * DAY_MS,
        sampleSize: 6, // established
      }),
    ];

    const signal = selectTrainingSignal([], [], recent);
    expect(signal?.headline).toContain("Squat");
  });

  it("3+ sessions this calendar week is a consistency signal when nothing higher-priority fires", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const workouts = makeWorkouts(3, "bench-press", NOW);

    const signal = selectTrainingSignal(workouts, [], []);
    expect(signal?.headline).toBe("You're training consistently");
  });

  it("sessions from the previous calendar week don't count toward this week's consistency", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    // One session today, plus two more that land before this week's
    // Monday — under the old rolling-7-day logic these would have
    // counted; under calendar-week logic they must not.
    const weekStart = getCalendarWeekStart(NOW);
    const workouts = [
      ...makeWorkouts(1, "bench-press", NOW),
      ...makeWorkouts(2, "bench-press", weekStart - DAY_MS),
    ];

    const signal = selectTrainingSignal(workouts, [], []);
    expect(signal).toBeNull();
  });

  it("2+ recent cardio sessions is a signal when nothing else qualifies", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const workouts = makeWorkouts(2, "treadmill", NOW);

    const signal = selectTrainingSignal(workouts, [], []);
    expect(signal?.headline).toContain("Cardio");
  });

  it("a single cardio session is not enough on its own", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const workouts = makeWorkouts(1, "treadmill", NOW);

    expect(selectTrainingSignal(workouts, [], [])).toBeNull();
  });
});
