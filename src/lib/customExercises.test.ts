// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { getExercise, getAllExercises, getExerciseLoggingSchema } from "@/lib/exercises";
import {
  createCustomExercise,
  updateCustomExercise,
  archiveCustomExercise,
  trackingTypeOf,
  isCustomExercise,
  isArchivedExercise,
} from "@/lib/customExercises";
import { getCustomExercisesSnapshot, setCustomExercisesSnapshot } from "@/lib/customExercisesStore";

beforeEach(async () => {
  await getDb().customExercises.clear();
  setCustomExercisesSnapshot([]);
});

describe("createCustomExercise", () => {
  it("builds a weighted exercise with the chosen equipment and muscle", async () => {
    const def = await createCustomExercise({
      name: "Landmine Press",
      trackingType: "weighted",
      equipment: "Dumbbell",
      muscle: "Shoulders",
    });
    expect(def.name).toBe("Landmine Press");
    expect(def.equipment).toBe("Dumbbell");
    expect(def.muscle).toBe("Shoulders");
    expect(def.cardio).toBeUndefined();
    expect(def.time).toBeUndefined();
    expect(getExerciseLoggingSchema(def)).toMatchObject({ weight: "required", reps: true });
  });

  it("forces Bodyweight equipment and optional weight for a bodyweight exercise", async () => {
    const def = await createCustomExercise({
      name: "Pistol Squat",
      trackingType: "bodyweight",
      muscle: "Quads",
    });
    expect(def.equipment).toBe("Bodyweight");
    expect(getExerciseLoggingSchema(def)).toMatchObject({ weight: "optional", reps: true });
  });

  it("sets time:true and Bodyweight equipment for a timed hold, ignoring any equipment passed in", async () => {
    const def = await createCustomExercise({
      name: "Hollow Hold",
      trackingType: "timed",
      muscle: "Abs",
      equipment: "Barbell",
    });
    expect(def.time).toBe(true);
    expect(def.equipment).toBe("Bodyweight");
    expect(getExerciseLoggingSchema(def)).toMatchObject({ duration: true, reps: false });
  });

  it("forces Cardio muscle/equipment for a cardio exercise, ignoring any muscle passed in", async () => {
    const def = await createCustomExercise({
      name: "Sled Push",
      trackingType: "cardio",
      muscle: "Quads",
    });
    expect(def.muscle).toBe("Cardio");
    expect(def.equipment).toBe("Cardio");
    expect(def.cardio).toBe(true);
    expect(getExerciseLoggingSchema(def)).toMatchObject({ duration: true, distance: false });
  });

  it("rejects an empty name", async () => {
    await expect(
      createCustomExercise({ name: "   ", trackingType: "weighted", equipment: "Barbell" }),
    ).rejects.toThrow();
  });

  it("gives two exercises created with the same name different ids", async () => {
    const a = await createCustomExercise({
      name: "Curl Variation",
      trackingType: "weighted",
      equipment: "Cable",
      muscle: "Biceps",
    });
    const b = await createCustomExercise({
      name: "Curl Variation",
      trackingType: "weighted",
      equipment: "Cable",
      muscle: "Biceps",
    });
    expect(a.id).not.toBe(b.id);
  });

  it("persists to the customExercises table", async () => {
    const def = await createCustomExercise({
      name: "Chest Fly Machine Variant",
      trackingType: "weighted",
      equipment: "Machine",
      muscle: "Chest",
    });
    const row = await getDb().customExercises.get(def.id);
    expect(row?.name).toBe("Chest Fly Machine Variant");
  });

  it("makes the new exercise findable via getExercise as soon as it resolves, without waiting for CustomExercisesLoader's live query", async () => {
    // This is the bug the inline creation flow in ExercisePicker would hit
    // otherwise: it calls onPick(def.id) right after createCustomExercise
    // resolves, and onPick's callers (RoutineEditor etc.) call getExercise
    // synchronously — there's no later tick in which a live-query update
    // could still land in time.
    const def = await createCustomExercise({
      name: "Reverse Nordic Curl",
      trackingType: "bodyweight",
      muscle: "Quads",
    });
    expect(getExercise(def.id)).toEqual(def);
  });
});

describe("updateCustomExercise", () => {
  it("updates name, equipment, and muscle, keeping id and createdAt", async () => {
    const created = await createCustomExercise({
      name: "Old Name",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    const updated = await updateCustomExercise(created.id, {
      name: "New Name",
      equipment: "Dumbbell",
      muscle: "Shoulders",
    });
    expect(updated.name).toBe("New Name");
    expect(updated.equipment).toBe("Dumbbell");
    expect(updated.muscle).toBe("Shoulders");
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("keeps the tracking type's flags fixed regardless of equipment/muscle passed in", async () => {
    const created = await createCustomExercise({
      name: "Plank Variant",
      trackingType: "timed",
      muscle: "Abs",
    });
    const updated = await updateCustomExercise(created.id, {
      name: "Plank Variant 2",
      equipment: "Barbell",
      muscle: "Chest",
    });
    expect(updated.time).toBe(true);
    expect(updated.equipment).toBe("Bodyweight");
  });

  it("persists the change to Dexie and makes it visible via getExercise", async () => {
    const created = await createCustomExercise({
      name: "Row Variant",
      trackingType: "weighted",
      equipment: "Cable",
      muscle: "Lats",
    });
    await updateCustomExercise(created.id, { name: "Row Variant Updated" });
    const row = await getDb().customExercises.get(created.id);
    expect(row?.name).toBe("Row Variant Updated");
    expect(getExercise(created.id)?.name).toBe("Row Variant Updated");
  });

  it("rejects an empty name", async () => {
    const created = await createCustomExercise({
      name: "Something",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    await expect(updateCustomExercise(created.id, { name: "   " })).rejects.toThrow();
  });

  it("rejects an id that doesn't exist", async () => {
    await expect(updateCustomExercise("not-a-real-id", { name: "X" })).rejects.toThrow();
  });
});

describe("archiveCustomExercise", () => {
  it("sets archivedAt without removing the row", async () => {
    const created = await createCustomExercise({
      name: "To Delete",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    await archiveCustomExercise(created.id);
    const row = await getDb().customExercises.get(created.id);
    expect(typeof row?.archivedAt).toBe("number");
  });

  it("keeps the exercise findable via getExercise after archiving", async () => {
    const created = await createCustomExercise({
      name: "Archived But Findable",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    await archiveCustomExercise(created.id);
    expect(getExercise(created.id)?.name).toBe("Archived But Findable");
  });

  it("is excluded from getAllExercises by default but included with includeArchived", async () => {
    const created = await createCustomExercise({
      name: "Archived Item",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    await archiveCustomExercise(created.id);
    expect(getAllExercises().some((e) => e.id === created.id)).toBe(false);
    expect(getAllExercises({ includeArchived: true }).some((e) => e.id === created.id)).toBe(true);
  });

  it("does nothing, without throwing, for an id that doesn't exist", async () => {
    await expect(archiveCustomExercise("not-a-real-id")).resolves.toBeUndefined();
  });
});

describe("isArchivedExercise", () => {
  it("distinguishes archived from active custom exercises", async () => {
    const created = await createCustomExercise({
      name: "Active One",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    expect(isArchivedExercise(created)).toBe(false);
    await archiveCustomExercise(created.id);
    expect(isArchivedExercise(getExercise(created.id)!)).toBe(true);
  });
});

describe("trackingTypeOf", () => {
  it("recovers weighted, bodyweight, timed, and cardio from a definition's flags", async () => {
    const weighted = await createCustomExercise({
      name: "W",
      trackingType: "weighted",
      equipment: "Barbell",
      muscle: "Chest",
    });
    const bodyweight = await createCustomExercise({
      name: "B",
      trackingType: "bodyweight",
      muscle: "Chest",
    });
    const timed = await createCustomExercise({ name: "T", trackingType: "timed", muscle: "Abs" });
    const cardio = await createCustomExercise({ name: "C", trackingType: "cardio" });

    expect(trackingTypeOf(weighted)).toBe("weighted");
    expect(trackingTypeOf(bodyweight)).toBe("bodyweight");
    expect(trackingTypeOf(timed)).toBe("timed");
    expect(trackingTypeOf(cardio)).toBe("cardio");
  });
});

describe("getExercise / getAllExercises with custom exercises loaded", () => {
  it("still finds a built-in exercise when custom exercises are loaded", () => {
    setCustomExercisesSnapshot([
      { id: "custom-foo-abc123", name: "Foo", muscle: "Chest", equipment: "Barbell", createdAt: 1 },
    ]);
    expect(getExercise("push-up")?.name).toBe("Push Up");
  });

  it("finds a custom exercise by id once it's in the snapshot", () => {
    setCustomExercisesSnapshot([
      {
        id: "custom-landmine-press-abc123",
        name: "Landmine Press",
        muscle: "Shoulders",
        equipment: "Dumbbell",
        createdAt: 1,
      },
    ]);
    expect(getExercise("custom-landmine-press-abc123")?.name).toBe("Landmine Press");
  });

  it("returns undefined for an id in neither the catalog nor the snapshot", () => {
    expect(getExercise("does-not-exist")).toBeUndefined();
  });

  it("getAllExercises appends custom exercises after the built-in catalog", () => {
    expect(getCustomExercisesSnapshot()).toEqual([]);
    const before = getAllExercises().length;
    setCustomExercisesSnapshot([
      { id: "custom-foo-abc123", name: "Foo", muscle: "Chest", equipment: "Barbell", createdAt: 1 },
    ]);
    const after = getAllExercises();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].id).toBe("custom-foo-abc123");
  });

  it("isCustomExercise distinguishes catalog entries from custom ones", () => {
    const builtIn = getExercise("push-up");
    expect(builtIn && isCustomExercise(builtIn)).toBe(false);
    setCustomExercisesSnapshot([
      { id: "custom-foo-abc123", name: "Foo", muscle: "Chest", equipment: "Barbell", createdAt: 1 },
    ]);
    const custom = getExercise("custom-foo-abc123");
    expect(custom && isCustomExercise(custom)).toBe(true);
  });
});
