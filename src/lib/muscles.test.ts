import { describe, expect, it } from "vitest";
import type { Workout, WorkoutSet } from "@/lib/db";
import { computeIntensity, intensityFromExerciseIds } from "@/lib/muscles";

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

  it("does not exclude Cardio the way computeIntensity does", () => {
    // Documents current behavior: unlike computeIntensity, this helper has
    // no Cardio filter, so a cardio-primary exercise id still produces a
    // "Cardio" key in the output.
    const intensity = intensityFromExerciseIds(["treadmill"]);
    expect(intensity.Cardio).toBe(1);
  });

  it("skips unrecognized exercise ids", () => {
    expect(intensityFromExerciseIds(["not-a-real-exercise"])).toEqual({});
  });

  it("returns an empty object for an empty list", () => {
    expect(intensityFromExerciseIds([])).toEqual({});
  });
});
