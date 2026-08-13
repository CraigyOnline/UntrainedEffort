// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, type Workout, type ActiveWorkoutDraft } from "@/lib/db";
import { selectHomeGreeting } from "@/lib/homeGreetings";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

beforeEach(async () => {
  const db = getDb();
  await db.workouts.clear();
  await db.activeWorkout.clear();
  await db.routines.clear();
  await db.prHistory.clear();
  await db.exerciseSettings.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type WorkoutInput = Omit<Workout, "id">;

function workoutInput(overrides: Partial<WorkoutInput> = {}): WorkoutInput {
  return {
    name: "Workout",
    startedAt: 0,
    endedAt: 0,
    durationSec: 0,
    exercises: [],
    ...overrides,
  };
}

async function seedWorkout(overrides: Partial<WorkoutInput> = {}): Promise<void> {
  await getDb().workouts.add(workoutInput(overrides));
}

function setNow(now: number): void {
  vi.spyOn(Date, "now").mockReturnValue(now);
}

describe("selectHomeGreeting", () => {
  it("prioritizes a workout in progress above everything else", async () => {
    const now = 10_000 * WEEK_MS;
    setNow(now);
    const draft: Omit<ActiveWorkoutDraft, "id"> = {
      routine: null,
      name: "In progress",
      startedAt: now,
      exercises: [],
    };
    await getDb().activeWorkout.add(draft);
    // Even with a rich, otherwise-streak-worthy history present, the
    // active session should still win.
    await seedWorkout({ startedAt: now - 2 * WEEK_MS, endedAt: now - 2 * WEEK_MS });
    await seedWorkout({ startedAt: now - WEEK_MS, endedAt: now - WEEK_MS });
    await seedWorkout({ startedAt: now, endedAt: now });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("workout-active");
  });

  it("greets a brand new user with no workout history", async () => {
    setNow(20_000 * WEEK_MS);
    const result = await selectHomeGreeting();
    expect(result.kind).toBe("first-workout");
  });

  it("recognizes a 3-week consecutive streak counted from last week backward", async () => {
    const now = 30_000 * WEEK_MS;
    setNow(now);
    // Streak counts consecutive weeks *before* today, so today doesn't
    // need a workout logged yet to count toward it.
    await seedWorkout({ startedAt: now - WEEK_MS, endedAt: now - WEEK_MS });
    await seedWorkout({ startedAt: now - 2 * WEEK_MS, endedAt: now - 2 * WEEK_MS });
    await seedWorkout({ startedAt: now - 3 * WEEK_MS, endedAt: now - 3 * WEEK_MS });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("streak");
  });

  it("recognizes 3+ workouts within the trailing week when there's no 3-week streak", async () => {
    const now = 40_000 * WEEK_MS;
    setNow(now);
    await seedWorkout({ startedAt: now - DAY_MS, endedAt: now - DAY_MS });
    await seedWorkout({ startedAt: now - 2 * DAY_MS, endedAt: now - 2 * DAY_MS });
    await seedWorkout({ startedAt: now - 3 * DAY_MS, endedAt: now - 3 * DAY_MS });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("momentum");
  });

  it("falls to the default pool when a workout was already logged today", async () => {
    const now = 50_000 * WEEK_MS + 12 * 3600_000; // noon — avoids landing on a day boundary
    setNow(now);
    await seedWorkout({ startedAt: now - 3600_000, endedAt: now - 1800_000 });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("default");
  });

  it("recognizes a workout logged yesterday", async () => {
    const now = 60_000 * WEEK_MS;
    setNow(now);
    await seedWorkout({ startedAt: now - DAY_MS, endedAt: now - DAY_MS });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("yesterday");
  });

  it("recognizes a return within the last week (but not yesterday)", async () => {
    const now = 70_000 * WEEK_MS;
    setNow(now);
    await seedWorkout({ startedAt: now - 4 * DAY_MS, endedAt: now - 4 * DAY_MS });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("few-days");
  });

  it("recognizes a longer break", async () => {
    const now = 80_000 * WEEK_MS;
    setNow(now);
    await seedWorkout({ startedAt: now - 20 * DAY_MS, endedAt: now - 20 * DAY_MS });

    const result = await selectHomeGreeting();
    expect(result.kind).toBe("longer-break");
  });
});
