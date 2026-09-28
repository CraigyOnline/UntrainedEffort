// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { getExercise, getAllExercises, getExerciseLoggingSchema } from "@/lib/exercises";
import { createCustomExercise, isCustomExercise } from "@/lib/customExercises";
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
