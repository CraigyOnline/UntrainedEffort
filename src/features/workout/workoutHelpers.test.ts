import { describe, expect, it } from "vitest";
import { findProgressionSuggestions } from "@/features/workout/workoutHelpers";
import type { Routine, Workout } from "@/lib/db";

function routineWith(exercises: { exerciseId: string; weight: number; reps: number }[]): Routine {
  return {
    id: 1,
    name: "Test Routine",
    exercises: exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: [
        { targetWeight: e.weight, targetReps: e.reps },
        { targetWeight: e.weight, targetReps: e.reps },
      ],
    })),
    createdAt: 0,
  };
}

function workoutAt(
  id: number,
  startedAt: number,
  logs: { exerciseId: string; weight: number; reps: number[] }[],
): Workout {
  return {
    id,
    name: "Test Routine",
    startedAt,
    endedAt: startedAt + 1000,
    durationSec: 1000,
    routineId: 1,
    exercises: logs.map((l) => ({
      exerciseId: l.exerciseId,
      sets: l.reps.map((reps) => ({ weight: l.weight, reps, completed: true })),
    })),
  };
}

describe("findProgressionSuggestions", () => {
  it("returns a suggestion for every qualifying exercise, not just the first", () => {
    const routine = routineWith([
      { exerciseId: "bench-press", weight: 15, reps: 10 },
      { exerciseId: "db-row", weight: 15, reps: 10 },
      { exerciseId: "goblet-squat", weight: 15, reps: 10 }, // stays right on target — shouldn't qualify
    ]);

    const previous = workoutAt(1, 1000, [
      { exerciseId: "bench-press", weight: 15, reps: [12, 12] },
      { exerciseId: "db-row", weight: 15, reps: [8, 8] }, // missed target both times
      { exerciseId: "goblet-squat", weight: 15, reps: [10, 10] },
    ]);
    const finished = workoutAt(2, 2000, [
      { exerciseId: "bench-press", weight: 15, reps: [12, 12] },
      { exerciseId: "db-row", weight: 15, reps: [8, 8] },
      { exerciseId: "goblet-squat", weight: 15, reps: [10, 10] },
    ]);

    const suggestions = findProgressionSuggestions(routine, finished, [finished, previous]);

    expect(suggestions).toHaveLength(2);
    expect(suggestions.find((s) => s.exerciseId === "bench-press")).toMatchObject({
      kind: "add-reps",
    });
    expect(suggestions.find((s) => s.exerciseId === "db-row")).toMatchObject({ kind: "ease-off" });
    expect(suggestions.find((s) => s.exerciseId === "goblet-squat")).toBeUndefined();
  });

  it("returns an empty array when nothing qualifies", () => {
    const routine = routineWith([{ exerciseId: "bench-press", weight: 15, reps: 10 }]);
    const previous = workoutAt(1, 1000, [
      { exerciseId: "bench-press", weight: 15, reps: [10, 10] },
    ]);
    const finished = workoutAt(2, 2000, [
      { exerciseId: "bench-press", weight: 15, reps: [10, 10] },
    ]);

    expect(findProgressionSuggestions(routine, finished, [finished, previous])).toEqual([]);
  });

  it("skips exercises with no routine-defined target (e.g. duration-based)", () => {
    const routine: Routine = {
      id: 1,
      name: "Test Routine",
      exercises: [{ exerciseId: "plank", sets: [{ targetDuration: 60 }] }],
      createdAt: 0,
    };
    const finished = workoutAt(2, 2000, [{ exerciseId: "plank", weight: 0, reps: [1] }]);

    expect(findProgressionSuggestions(routine, finished, [finished])).toEqual([]);
  });
});
