import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSet } from "@/lib/db";
import {
  computeIntensity,
  computeMuscleRecovery,
  intensityFromExerciseIds,
  MUSCLE_RECOVERY_THRESHOLDS,
} from "@/lib/muscles";

const DAY_MS = 24 * 60 * 60 * 1000;

// Real catalog ids used across these fixtures:
//   bench-press   primary Chest, secondary [Triceps, Shoulders]
//   push-up       primary Chest, secondary [Triceps, Shoulders] (bodyweight)
//   treadmill     primary Cardio, secondary [Quads, Hamstrings, Calves, Glutes]

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { weight: 0, reps: 0, completed: true, ...overrides };
}

function makeExercises(entries: Array<[string, WorkoutSet[]]>): Workout["exercises"] {
  return entries.map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

describe("computeIntensity", () => {
  it("gives the primary muscle full intensity and secondaries half, for a single exercise", () => {
    const exercises = makeExercises([
      [
        "bench-press",
        [makeSet(), makeSet(), makeSet()], // 3 completed sets
      ],
    ]);
    const intensity = computeIntensity(exercises);
    expect(intensity.Chest).toBe(1);
    expect(intensity.Triceps).toBe(0.5);
    expect(intensity.Shoulders).toBe(0.5);
  });

  it("excludes Cardio from the output even though it drives secondary-muscle intensity", () => {
    const exercises = makeExercises([["treadmill", [makeSet(), makeSet(), makeSet()]]]);
    const intensity = computeIntensity(exercises);
    expect(intensity.Cardio).toBeUndefined();
    expect("Cardio" in intensity).toBe(false);
    // secondary muscles from the cardio exercise still register
    expect(intensity.Quads).toBe(0.5);
    expect(intensity.Hamstrings).toBe(0.5);
  });

  it("only counts completed sets by default, but falls back to the full set count when nothing was marked complete", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ completed: false }), makeSet({ completed: false })]],
    ]);
    // finished-workout fallback: exercise still counts as trained
    const intensity = computeIntensity(exercises);
    expect(intensity.Chest).toBe(1);
  });

  it("skips a fully-incomplete exercise entirely in live mode instead of falling back", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet({ completed: false }), makeSet({ completed: false })]],
    ]);
    const intensity = computeIntensity(exercises, { live: true });
    expect(intensity).toEqual({});
  });

  it("normalizes across multiple exercises sharing the same primary muscle", () => {
    const exercises = makeExercises([
      ["bench-press", [makeSet(), makeSet()]], // 2 completed, primary Chest
      ["push-up", [makeSet(), makeSet()]], // 2 completed, primary Chest
    ]);
    const intensity = computeIntensity(exercises);
    expect(intensity.Chest).toBe(1);
    expect(intensity.Triceps).toBe(0.5);
  });

  it("skips exercises with an unrecognized id", () => {
    const exercises = makeExercises([["not-a-real-exercise", [makeSet()]]]);
    expect(computeIntensity(exercises)).toEqual({});
  });

  it("returns an empty object for an empty workout", () => {
    expect(computeIntensity([])).toEqual({});
  });
});

describe("intensityFromExerciseIds", () => {
  it("gives the primary muscle full weight and secondaries half weight", () => {
    const intensity = intensityFromExerciseIds(["bench-press"]);
    expect(intensity.Chest).toBe(1);
    expect(intensity.Triceps).toBe(0.5);
    expect(intensity.Shoulders).toBe(0.5);
  });

  it("does not accumulate repeated secondary hits — stays at the equal-weight ceiling", () => {
    const intensity = intensityFromExerciseIds(["bench-press", "push-up"]);
    // Triceps/Shoulders are secondary in both — still 0.5, not 1 or 0.5+0.5
    expect(intensity.Triceps).toBe(0.5);
    expect(intensity.Shoulders).toBe(0.5);
    expect(intensity.Chest).toBe(1);
  });

  it("excludes Cardio from the output, same as computeIntensity", () => {
    const intensity = intensityFromExerciseIds(["treadmill"]);
    expect(intensity.Cardio).toBeUndefined();
    expect("Cardio" in intensity).toBe(false);
    // secondary muscles from the cardio exercise still register
    expect(intensity.Quads).toBe(0.5);
    expect(intensity.Hamstrings).toBe(0.5);
  });

  it("skips unrecognized exercise ids", () => {
    expect(intensityFromExerciseIds(["not-a-real-exercise"])).toEqual({});
  });

  it("returns an empty object for an empty list", () => {
    expect(intensityFromExerciseIds([])).toEqual({});
  });
});

describe("computeMuscleRecovery", () => {
  const now = Date.parse("2026-08-16T00:00:00.000Z");

  function makeWorkout(startedAt: number, exercises: Workout["exercises"]): Workout {
    return { id: 1, startedAt, exercises } as Workout;
  }

  it("counts both primary and secondary muscles as trained", () => {
    const workouts = [makeWorkout(now, makeExercises([["bench-press", [makeSet()]]]))];
    const recovery = computeMuscleRecovery(workouts, now);
    expect(recovery.Chest?.status).toBe("recent");
    expect(recovery.Triceps?.status).toBe("recent");
    expect(recovery.Shoulders?.status).toBe("recent");
  });

  it("excludes Cardio from the output, same as computeIntensity", () => {
    const workouts = [makeWorkout(now, makeExercises([["treadmill", [makeSet()]]]))];
    const recovery = computeMuscleRecovery(workouts, now);
    expect(recovery.Cardio).toBeUndefined();
    expect("Cardio" in recovery).toBe(false);
  });

  it("ignores a workout with no completed sets for that exercise", () => {
    const workouts = [
      makeWorkout(now, makeExercises([["bench-press", [makeSet({ completed: false })]]])),
    ];
    expect(computeMuscleRecovery(workouts, now)).toEqual({});
  });

  it("classifies as 'recent' just under the recentMaxDays threshold", () => {
    const ts = now - (MUSCLE_RECOVERY_THRESHOLDS.recentMaxDays * DAY_MS - 1);
    const workouts = [makeWorkout(ts, makeExercises([["bench-press", [makeSet()]]]))];
    expect(computeMuscleRecovery(workouts, now).Chest?.status).toBe("recent");
  });

  it("classifies as 'recovered' at the recentMaxDays boundary", () => {
    const ts = now - MUSCLE_RECOVERY_THRESHOLDS.recentMaxDays * DAY_MS;
    const workouts = [makeWorkout(ts, makeExercises([["bench-press", [makeSet()]]]))];
    expect(computeMuscleRecovery(workouts, now).Chest?.status).toBe("recovered");
  });

  it("classifies as 'recovered' just under the recoveredMaxDays threshold", () => {
    const ts = now - (MUSCLE_RECOVERY_THRESHOLDS.recoveredMaxDays * DAY_MS - 1);
    const workouts = [makeWorkout(ts, makeExercises([["bench-press", [makeSet()]]]))];
    expect(computeMuscleRecovery(workouts, now).Chest?.status).toBe("recovered");
  });

  it("classifies as 'overdue' at the recoveredMaxDays boundary and beyond", () => {
    const ts = now - MUSCLE_RECOVERY_THRESHOLDS.recoveredMaxDays * DAY_MS;
    const workouts = [makeWorkout(ts, makeExercises([["bench-press", [makeSet()]]]))];
    expect(computeMuscleRecovery(workouts, now).Chest?.status).toBe("overdue");

    const wayOld = now - 30 * DAY_MS;
    const oldWorkouts = [makeWorkout(wayOld, makeExercises([["bench-press", [makeSet()]]]))];
    expect(computeMuscleRecovery(oldWorkouts, now).Chest?.status).toBe("overdue");
  });

  it("uses the most recent workout when a muscle is trained multiple times", () => {
    const older = now - 10 * DAY_MS;
    const newer = now - 1 * DAY_MS;
    const workouts = [
      makeWorkout(older, makeExercises([["bench-press", [makeSet()]]])),
      makeWorkout(newer, makeExercises([["bench-press", [makeSet()]]])),
    ];
    const recovery = computeMuscleRecovery(workouts, now);
    expect(recovery.Chest?.lastTrainedAt).toBe(newer);
    expect(recovery.Chest?.status).toBe("recent");
  });

  it("omits muscles that have never been trained", () => {
    const workouts = [makeWorkout(now, makeExercises([["bench-press", [makeSet()]]]))];
    const recovery = computeMuscleRecovery(workouts, now);
    expect(recovery.Calves).toBeUndefined();
  });

  it("returns an empty object for no workouts", () => {
    expect(computeMuscleRecovery([], now)).toEqual({});
  });
});
