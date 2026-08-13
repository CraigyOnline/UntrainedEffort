// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, type Workout } from "@/lib/db";
import { selectCompletionMessage } from "@/lib/completionMessages";

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

/** Adds a workout to the fake db and returns it with its assigned id. */
async function seedWorkout(overrides: Partial<WorkoutInput> = {}): Promise<Workout> {
  const db = getDb();
  const input = workoutInput(overrides);
  const id = await db.workouts.add(input);
  return { ...input, id };
}

describe("selectCompletionMessage", () => {
  it("returns the PR message immediately, without consulting history", async () => {
    const justFinished = await seedWorkout({ startedAt: 1000, endedAt: 2000 });
    const result = await selectCompletionMessage(justFinished, true);
    expect(result).toEqual({ headline: "New Personal Best!", kind: "pr" });
  });

  it("falls back to the universal pool for a first-ever workout with no history", async () => {
    const justFinished = await seedWorkout({ startedAt: 1_000_000, endedAt: 1_001_000 });
    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("universal");
    expect(result.headline.length).toBeGreaterThan(0);
  });

  it("recognizes a 3-week consecutive streak", async () => {
    const base = 100_000 * WEEK_MS; // an arbitrary whole-week-aligned anchor
    await seedWorkout({ startedAt: base - 2 * WEEK_MS, endedAt: base - 2 * WEEK_MS });
    await seedWorkout({ startedAt: base - WEEK_MS, endedAt: base - WEEK_MS });
    const justFinished = await seedWorkout({ startedAt: base, endedAt: base });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("streak");
    expect(result.headline).toContain("3"); // the streak count itself
  });

  it("breaks the streak on a skipped week and falls through toward welcome-back", async () => {
    const base = 100_000 * WEEK_MS;
    // week N-2 has a workout, week N-1 is skipped, week N is justFinished —
    // not a consecutive streak, and the resulting 2-week gap since the
    // last workout reads as a genuine return.
    await seedWorkout({ startedAt: base - 2 * WEEK_MS, endedAt: base - 2 * WEEK_MS });
    const justFinished = await seedWorkout({ startedAt: base, endedAt: base });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("welcome-back");
  });

  it("recognizes 3+ workouts within the trailing week when there's no streak", async () => {
    const base = 200_000 * WEEK_MS;
    await seedWorkout({ startedAt: base - 2 * DAY_MS, endedAt: base - 2 * DAY_MS });
    await seedWorkout({ startedAt: base - DAY_MS, endedAt: base - DAY_MS });
    const justFinished = await seedWorkout({ startedAt: base, endedAt: base });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("weekly-frequency");
  });

  it("recognizes a return after a week or more away", async () => {
    const base = 300_000 * WEEK_MS;
    await seedWorkout({ startedAt: base - 10 * DAY_MS, endedAt: base - 10 * DAY_MS });
    const justFinished = await seedWorkout({ startedAt: base, endedAt: base });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("welcome-back");
  });

  it("recognizes the longest session of the calendar month", async () => {
    const monthStart = Date.UTC(2026, 7, 1); // Aug 2026
    await seedWorkout({
      startedAt: monthStart + 12 * DAY_MS,
      endedAt: monthStart + 12 * DAY_MS + 1000,
      durationSec: 1800,
    });
    const justFinished = await seedWorkout({
      startedAt: monthStart + 15 * DAY_MS,
      endedAt: monthStart + 15 * DAY_MS + 1000,
      durationSec: 3600, // longer than the earlier session this month
    });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("longest-session");
  });

  it("recognizes more total volume than the last comparable session", async () => {
    const prevMonthDay = Date.UTC(2026, 6, 30); // July 30 2026 — a different month
    await seedWorkout({
      startedAt: prevMonthDay,
      endedAt: prevMonthDay,
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 10, reps: 5, completed: true }] }, // 50
      ],
    });
    const justFinished = await seedWorkout({
      startedAt: prevMonthDay + 4 * DAY_MS, // Aug 3 — different month, gap < a week
      endedAt: prevMonthDay + 4 * DAY_MS,
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
      ],
    });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("more-volume");
  });

  it("recognizes long-term tenure with a consistent pace and no current gap", async () => {
    const anchor = 400_000 * WEEK_MS;
    const tenureDays = 100; // lands in the 3-month bucket (90 <= x < 180)
    const db = getDb();
    // One workout roughly every 10 days across the whole tenure window —
    // satisfies the "totalWorkouts >= tenureDays / 10" pace requirement.
    for (let day = 0; day < tenureDays - 1; day += 10) {
      await db.workouts.add(
        workoutInput({ startedAt: anchor + day * DAY_MS, endedAt: anchor + day * DAY_MS }),
      );
    }
    // The most recent workout before today, within a week — tenure requires
    // no active gap (a real gap should read as welcome-back instead).
    await seedWorkout({
      startedAt: anchor + (tenureDays - 1) * DAY_MS,
      endedAt: anchor + (tenureDays - 1) * DAY_MS,
    });
    const justFinished = await seedWorkout({
      startedAt: anchor + tenureDays * DAY_MS,
      endedAt: anchor + tenureDays * DAY_MS,
    });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("tenure");
  });

  it("prefers welcome-back over tenure when there's a real gap since the last workout", async () => {
    const anchor = 500_000 * WEEK_MS;
    const tenureDays = 100;
    // Nearest prior workout lands 10 days before justFinished — comfortably
    // past the "no active gap" week-long window tenure requires.
    for (let day = 0; day <= tenureDays - 10; day += 10) {
      await getDb().workouts.add(
        workoutInput({ startedAt: anchor + day * DAY_MS, endedAt: anchor + day * DAY_MS }),
      );
    }
    const justFinished = await seedWorkout({
      startedAt: anchor + tenureDays * DAY_MS,
      endedAt: anchor + tenureDays * DAY_MS,
    });

    const result = await selectCompletionMessage(justFinished, false);
    expect(result.kind).toBe("welcome-back");
  });
});
