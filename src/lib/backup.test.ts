import { describe, expect, it } from "vitest";
import { isBackupPayload, remapRoutineId } from "@/lib/backup";

function validPayload() {
  return {
    schemaVersion: 1,
    exportedAt: Date.now(),
    routines: [],
    workouts: [],
    prHistory: [],
    exerciseSettings: [],
  };
}

describe("isBackupPayload", () => {
  it("accepts a well-formed payload", () => {
    expect(isBackupPayload(validPayload())).toBe(true);
  });

  it("accepts a payload with exerciseSettings omitted (pre-field backups)", () => {
    const { exerciseSettings: _exerciseSettings, ...rest } = validPayload();
    expect(isBackupPayload(rest)).toBe(true);
  });

  it("rejects a payload where exerciseSettings is present but not an array", () => {
    expect(isBackupPayload({ ...validPayload(), exerciseSettings: "nope" })).toBe(false);
  });

  it("rejects a payload missing a required array field", () => {
    const { routines: _routines, ...rest } = validPayload();
    expect(isBackupPayload(rest)).toBe(false);
  });

  it("rejects a payload where a required field is the wrong type", () => {
    expect(isBackupPayload({ ...validPayload(), workouts: "not an array" })).toBe(false);
    expect(isBackupPayload({ ...validPayload(), schemaVersion: "1" })).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isBackupPayload(null)).toBe(false);
    expect(isBackupPayload(undefined)).toBe(false);
    expect(isBackupPayload("a backup")).toBe(false);
    expect(isBackupPayload(42)).toBe(false);
    expect(isBackupPayload([])).toBe(false);
  });

  it("accepts a payload carrying extra unrecognized fields", () => {
    expect(isBackupPayload({ ...validPayload(), futureField: "whatever" })).toBe(true);
  });
});

describe("remapRoutineId", () => {
  it("leaves an already-absent routineId as undefined", () => {
    expect(remapRoutineId(undefined, new Map())).toBeUndefined();
  });

  it("translates an old routine id to its newly-assigned id", () => {
    const idMap = new Map([[3, 7]]);
    expect(remapRoutineId(3, idMap)).toBe(7);
  });

  it("clears a routineId that has no entry in the map", () => {
    // e.g. the workout's routine wasn't part of this import.
    const idMap = new Map([[1, 5]]);
    expect(remapRoutineId(3, idMap)).toBeUndefined();
  });

  it("clears every routineId when the map is empty", () => {
    // e.g. "Routines" wasn't a selected import category at all, so there
    // is nothing a source routineId could correctly translate to.
    expect(remapRoutineId(3, new Map())).toBeUndefined();
  });
});
