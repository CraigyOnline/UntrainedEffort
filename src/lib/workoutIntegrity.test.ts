// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, type Workout } from "@/lib/db";
import { recordNewWorkoutPRs, syncWorkoutIntegrity } from "@/lib/workoutIntegrity";

// Real catalog ids:
//   bench-press   weight-tracked strength exercise
//   push-up       bodyweight strength exercise (weight optional, defaults 0)
//   treadmill     cardio — schema.weight is "hidden" (holds distance, not load)

beforeEach(async () => {
  const db = getDb();
  await db.workouts.clear();
  await db.prHistory.clear();
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

async function saveAndRecord(overrides: Partial<WorkoutInput> = {}): Promise<Workout> {
  const db = getDb();
  const input = workoutInput(overrides);
  const id = await db.workouts.add(input);
  const workout = { ...input, id };
  await recordNewWorkoutPRs(workout);
  return workout;
}

describe("recordNewWorkoutPRs — volume", () => {
  it("records a first-ever volume PR with previousBest 0 and delta equal to the value", async () => {
    await saveAndRecord({
      exercises: [
        {
          exerciseId: "bench-press",
          sets: [
            { weight: 20, reps: 5, completed: true }, // 100
            { weight: 20, reps: 5, completed: true }, // 100
          ],
        },
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    expect(prs).toHaveLength(1);
    expect(prs[0].value).toBe(200);
    expect(prs[0].previousBest).toBe(0);
    expect(prs[0].delta).toBe(200);
  });

  it("does not record a new PR when a later workout's volume doesn't beat the best", async () => {
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
      ],
    });
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 4, completed: true }] }, // 80 — lower
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    expect(prs).toHaveLength(1); // only the first workout's PR
    expect(prs[0].value).toBe(100);
  });

  it("records a second PR when a later workout beats the previous volume, with the correct previousBest/delta", async () => {
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
      ],
    });
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 8, completed: true }] }, // 160
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    expect(prs).toHaveLength(2);
    expect(prs[1].value).toBe(160);
    expect(prs[1].previousBest).toBe(100);
    expect(prs[1].delta).toBe(60);
  });

  it("sums volume across two occurrences of the same exercise within one workout", async () => {
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
        { exerciseId: "push-up", sets: [{ weight: 0, reps: 10, completed: true }] }, // filler, 0 volume
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100 more
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    expect(prs).toHaveLength(1);
    expect(prs[0].value).toBe(200); // both occurrences combined, not just the first
  });

  it("excludes uncompleted sets from the volume total", async () => {
    await saveAndRecord({
      exercises: [
        {
          exerciseId: "bench-press",
          sets: [
            { weight: 20, reps: 5, completed: true }, // 100
            { weight: 999, reps: 999, completed: false }, // excluded
          ],
        },
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    expect(prs[0].value).toBe(100);
  });

  it("never records a volume PR for a cardio exercise, even though it has a numeric 'weight' field (distance)", async () => {
    await saveAndRecord({
      exercises: [
        {
          exerciseId: "treadmill",
          sets: [{ weight: 5, reps: 0, duration: 1500, completed: true }],
        },
      ],
    });

    const prs = await getDb()
      .prHistory.where({ exerciseId: "treadmill", type: "volume" })
      .toArray();
    expect(prs).toHaveLength(0);
  });

  it("does not record a volume PR for a pure-bodyweight exercise with no added weight logged", async () => {
    await saveAndRecord({
      exercises: [
        { exerciseId: "push-up", sets: [{ weight: 0, reps: 20, completed: true }] }, // 0 volume
      ],
    });

    const prs = await getDb().prHistory.where({ exerciseId: "push-up", type: "volume" }).toArray();
    expect(prs).toHaveLength(0);
  });

  it("records volume and weight PRs independently from the same workout", async () => {
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 50, reps: 3, completed: true }] }, // 150 volume
      ],
    });

    const volumePrs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "volume" })
      .toArray();
    const weightPrs = await getDb()
      .prHistory.where({ exerciseId: "bench-press", type: "weight" })
      .toArray();
    expect(volumePrs).toHaveLength(1);
    expect(volumePrs[0].value).toBe(150);
    expect(weightPrs).toHaveLength(1);
    expect(weightPrs[0].value).toBe(50);
  });
});

describe("syncWorkoutIntegrity's rebuild — consistency with the incremental path", () => {
  it("produces the same volume PR history as recordNewWorkoutPRs for the same sequence of workouts", async () => {
    const db = getDb();
    // Same shape as the "second PR" + "duplicate exercise" cases above,
    // saved incrementally first...
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
      ],
    });
    await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100
        { exerciseId: "bench-press", sets: [{ weight: 20, reps: 5, completed: true }] }, // 100 more -> 200 total
      ],
    });
    const incremental = await db.prHistory
      .where({ exerciseId: "bench-press", type: "volume" })
      .toArray();

    // ...then rebuilt from scratch and compared.
    await syncWorkoutIntegrity();
    const rebuilt = await db.prHistory
      .where({ exerciseId: "bench-press", type: "volume" })
      .toArray();

    expect(rebuilt.map((p) => p.value)).toEqual(incremental.map((p) => p.value));
    expect(rebuilt.map((p) => p.previousBest)).toEqual(incremental.map((p) => p.previousBest));
    expect(rebuilt.map((p) => p.delta)).toEqual(incremental.map((p) => p.delta));
  });

  it("retracts a volume PR that an edit removed, on rebuild", async () => {
    const db = getDb();
    const workout = await saveAndRecord({
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 40, reps: 5, completed: true }] }, // 200
      ],
    });
    let prs = await db.prHistory.where({ exerciseId: "bench-press", type: "volume" }).toArray();
    expect(prs).toHaveLength(1);

    // Simulate an edit that lowers the workout's volume — recordNewWorkoutPRs
    // is explicitly not safe for this (see its own doc comment); only a
    // full rebuild can correctly retract the now-invalid PR.
    await db.workouts.update(workout.id!, {
      exercises: [
        { exerciseId: "bench-press", sets: [{ weight: 10, reps: 5, completed: true }] }, // 50
      ],
    });
    await syncWorkoutIntegrity();

    prs = await db.prHistory.where({ exerciseId: "bench-press", type: "volume" }).toArray();
    expect(prs).toHaveLength(1);
    expect(prs[0].value).toBe(50);
  });
});
