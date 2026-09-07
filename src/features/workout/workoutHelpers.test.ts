import { describe, expect, it } from "vitest";
import {
  findOtherRoutinesForExercise,
  findProgressionSuggestions,
  withProgressionSuggestionApplied,
  withProgressionSuggestionSnoozed,
} from "@/features/workout/workoutHelpers";
import type { ProgressionSuggestion } from "@/lib/progressionSuggestions";
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

const DAY_MS = 86_400_000;

function suggestion(overrides: Partial<ProgressionSuggestion> = {}): ProgressionSuggestion {
  return {
    exerciseId: "db-bench-press",
    kind: "add-weight",
    currentWeight: 15,
    currentReps: 15,
    proposedWeight: 17.5,
    proposedReps: 10,
    nextState: { weight: 17.5, repFloor: 10, lastPromptedReps: 15, lastPromptedAt: 0 },
    ...overrides,
  };
}

describe("findOtherRoutinesForExercise", () => {
  it("finds another routine sharing the exercise and excludes the source routine", () => {
    const source = routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]);
    const other: Routine = {
      ...routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]),
      id: 2,
    };
    const lastUsed = new Map([[2, Date.now()]]);

    const options = findOtherRoutinesForExercise(
      "db-bench-press",
      source.id!,
      [source, other],
      lastUsed,
    );

    expect(options).toHaveLength(1);
    expect(options[0].routine.id).toBe(2);
  });

  it("classifies a routine used within the window as recent and one past it as not", () => {
    const recent: Routine = {
      ...routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]),
      id: 2,
    };
    const stale: Routine = {
      ...routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]),
      id: 3,
    };
    const lastUsed = new Map([
      [2, Date.now() - 10 * DAY_MS],
      [3, Date.now() - 90 * DAY_MS],
    ]);

    const options = findOtherRoutinesForExercise("db-bench-press", 1, [recent, stale], lastUsed);

    expect(options.find((o) => o.routine.id === 2)?.daysSinceLastUsed).toBeLessThanOrEqual(10);
    expect(options.find((o) => o.routine.id === 3)?.daysSinceLastUsed).toBeGreaterThanOrEqual(90);
  });

  it("reports a routine with no logged usage as null rather than 0", () => {
    const neverUsed: Routine = {
      ...routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]),
      id: 2,
    };

    const options = findOtherRoutinesForExercise("db-bench-press", 1, [neverUsed], new Map());

    expect(options[0].daysSinceLastUsed).toBeNull();
  });

  it("leaves circuit routines out, since they have no weighted exercises to match against", () => {
    const circuit: Routine = {
      id: 2,
      name: "Circuit",
      type: "circuit",
      exercises: [],
      circuit: {
        stations: [{ exerciseId: "db-bench-press", workSeconds: 30, restSeconds: 30 }],
        rounds: 3,
        roundRestSeconds: 60,
        roundRestEnabled: true,
      },
      createdAt: 0,
    };

    expect(findOtherRoutinesForExercise("db-bench-press", 1, [circuit], new Map())).toEqual([]);
  });
});

describe("withProgressionSuggestionApplied", () => {
  it("updates the matching exercise's target and progressionState, and clears pendingSuggestion", () => {
    const routine = routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]);
    routine.exercises[0].pendingSuggestion = suggestion();

    const result = withProgressionSuggestionApplied(routine.exercises, suggestion());

    expect(result[0].sets[0]).toMatchObject({ targetWeight: 17.5, targetReps: 10 });
    expect(result[0].progressionState).toMatchObject({ weight: 17.5, repFloor: 10 });
    expect(result[0].pendingSuggestion).toBeUndefined();
  });

  it("leaves other exercises in the routine untouched", () => {
    const routine = routineWith([
      { exerciseId: "db-bench-press", weight: 15, reps: 10 },
      { exerciseId: "db-row", weight: 20, reps: 8 },
    ]);

    const result = withProgressionSuggestionApplied(routine.exercises, suggestion());

    expect(result[1].exerciseId).toBe("db-row");
    expect(result[1].sets.every((s) => s.targetWeight === 20 && s.targetReps === 8)).toBe(true);
  });
});

describe("withProgressionSuggestionSnoozed", () => {
  it("advances progressionState without touching the target, and stashes pendingSuggestion when asked to", () => {
    const routine = routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]);

    const result = withProgressionSuggestionSnoozed(routine.exercises, suggestion(), true);

    expect(result[0].sets[0]).toMatchObject({ targetWeight: 15, targetReps: 10 });
    expect(result[0].progressionState).toMatchObject({ weight: 17.5 });
    expect(result[0].pendingSuggestion).toEqual(suggestion());
  });

  it("clears pendingSuggestion instead of stashing it when keepAsPending is false", () => {
    const routine = routineWith([{ exerciseId: "db-bench-press", weight: 15, reps: 10 }]);

    const result = withProgressionSuggestionSnoozed(routine.exercises, suggestion(), false);

    expect(result[0].pendingSuggestion).toBeUndefined();
  });
});
