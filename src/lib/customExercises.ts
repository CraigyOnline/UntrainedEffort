import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { EXERCISES, type ExerciseDef, type MuscleGroup, type Equipment } from "@/lib/exercises";
import {
  type CustomExerciseDef,
  getCustomExercisesSnapshot,
  setCustomExercisesSnapshot,
  useCustomExercises,
} from "@/lib/customExercisesStore";

export type { CustomExerciseDef } from "@/lib/customExercisesStore";

/** EXERCISES plus every custom exercise, reactively — re-renders the
 *  caller when one is added, edited, or archived. Use this in place of a
 *  bare EXERCISES import wherever the UI browses/filters/searches the
 *  catalog (ExercisePicker, the Exercise Library page, Exercise Rest
 *  Times); getExercise() in exercises.ts already covers lookup-by-id on
 *  its own, archived or not.
 *
 *  Archived (soft-deleted — see archiveCustomExercise below) custom
 *  exercises are left out by default, matching every current caller
 *  except the Exercise Library page, which still shows them since their
 *  logged history and progress are still real and worth being able to
 *  see; pass { includeArchived: true } to get them back. */
export function useAllExercises(options?: { includeArchived?: boolean }): ExerciseDef[] {
  const custom = useCustomExercises();
  const includeArchived = options?.includeArchived ?? false;
  // Memoized on the snapshot (which only changes identity when the set of
  // custom exercises does), so callers get a stable array between renders.
  return useMemo(() => {
    const visible = includeArchived ? custom : custom.filter((e) => e.archivedAt === undefined);
    return visible.length === 0 ? EXERCISES : [...EXERCISES, ...visible];
  }, [custom, includeArchived]);
}

/** True for a custom (user-created) exercise, as opposed to one from the
 *  built-in catalog — used to show a "Custom" tag in list rows. Checking
 *  for `createdAt` rather than importing CustomExerciseDef keeps callers
 *  that only have an ExerciseDef able to ask this without a cast. */
export function isCustomExercise(def: ExerciseDef): def is CustomExerciseDef {
  return "createdAt" in def;
}

/** True for a custom exercise that's been archived (see
 *  archiveCustomExercise) — used to show an "Archived" tag in place of
 *  "Custom" on the Exercise Library page, the one place archived
 *  exercises still appear (see useAllExercises' includeArchived). */
export function isArchivedExercise(def: ExerciseDef): boolean {
  return "archivedAt" in def;
}

/**
 * Mounted once at the app root (see _app.tsx) to keep
 * customExercisesStore's synchronous snapshot fed from Dexie — every other
 * reader (getExercise, useAllExercises) is downstream of this, not its own
 * independent subscription, so there's exactly one live query for custom
 * exercises no matter how many components read them.
 *
 * Renders its children only once the first load has been copied into the
 * store. getExercise() reads the store synchronously, so a screen that
 * rendered before that copy — resuming an in-progress workout after the
 * app was killed, say, whose exercise ids come out of Dexie in parallel
 * with this query — would look a custom exercise up while the store was
 * still empty, and nothing would prompt it to look again. The gate costs
 * one IndexedDB read (a few ms) at startup; after that, later changes
 * reach components through the store as usual.
 */
export function CustomExercisesLoader({ children }: { children: ReactNode }) {
  const rows = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<CustomExerciseDef[]>([])
        : getDb().customExercises.toArray(),
    [],
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (rows === undefined) return;
    setCustomExercisesSnapshot(rows);
    setReady(true);
  }, [rows]);

  return ready ? children : null;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Short and effectively collision-proof — unlike a catalog id, a custom
 *  exercise's id is never displayed or typed anywhere, so it only needs to
 *  be unique, not stable or memorable. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type CustomExerciseTrackingType = "weighted" | "bodyweight" | "timed" | "cardio";

/** The reverse of deriveExerciseFields below — recovers which creation-
 *  form choice produced a given custom exercise's current flags, so the
 *  edit form can show (and lock — see updateCustomExercise) the right
 *  one without a separate stored field for it. */
export function trackingTypeOf(def: ExerciseDef): CustomExerciseTrackingType {
  if (def.cardio) return "cardio";
  if (def.time) return "timed";
  if (def.equipment === "Bodyweight") return "bodyweight";
  return "weighted";
}

/** Translates a tracking-type choice (plus, for "weighted", which
 *  equipment, and for anything but cardio, which muscle) into the actual
 *  cardio/time/equipment/muscle combination getExerciseLoggingSchema
 *  (exercises.ts) reads — shared by createCustomExercise and
 *  updateCustomExercise so a freshly-created and a freshly-edited exercise
 *  with the same choices always end up with an identical shape. */
function deriveExerciseFields(
  trackingType: CustomExerciseTrackingType,
  equipment: Equipment | undefined,
  muscle: MuscleGroup | undefined,
): Pick<ExerciseDef, "muscle" | "equipment" | "cardio" | "time"> {
  switch (trackingType) {
    case "cardio":
      // time:true alongside cardio:true matches every built-in cardio
      // entry (see exercises.ts) — getExerciseLoggingSchema checks
      // isCardio first regardless, but every catalog entry carries both.
      return { muscle: "Cardio", equipment: "Cardio", cardio: true, time: true };
    case "timed":
      return { muscle: muscle ?? "Abs", equipment: "Bodyweight", time: true };
    case "bodyweight":
      return { muscle: muscle ?? "Chest", equipment: "Bodyweight" };
    case "weighted":
    default:
      return { muscle: muscle ?? "Chest", equipment: equipment ?? "Barbell" };
  }
}

export interface CreateCustomExerciseInput {
  name: string;
  trackingType: CustomExerciseTrackingType;
  /** Which non-bodyweight equipment this is — required for "weighted"
   *  only (drives plate-calculator eligibility and equipment filtering);
   *  ignored for every other tracking type. */
  equipment?: Equipment;
  /** Primary muscle — required for weighted/bodyweight/timed; ignored
   *  (and forced to "Cardio") for cardio, matching every built-in cardio
   *  entry (see exercises.ts). */
  muscle?: MuscleGroup;
}

/**
 * Builds and persists a new custom exercise from the creation form's
 * choices. Kept intentionally small for v1: no interval config, no
 * secondary muscles, no distance/pace (custom cardio is duration-only),
 * no restCategory override (falls back to DEFAULT_REST_DURATION_SEC, 90s)
 * — all easy to layer on later without changing what's here.
 */
export async function createCustomExercise(
  input: CreateCustomExerciseInput,
): Promise<CustomExerciseDef> {
  const name = input.name.trim();
  if (name === "") throw new Error("Name is required.");

  const id = `custom-${slugify(name) || "exercise"}-${randomSuffix()}`;
  const def: CustomExerciseDef = {
    id,
    name,
    createdAt: Date.now(),
    ...deriveExerciseFields(input.trackingType, input.equipment, input.muscle),
  };

  await getDb().customExercises.add(def);

  // CustomExercisesLoader's live query will pick this up too, a tick
  // later — but a caller that adds this id to a routine/workout
  // immediately after creating it (see ExercisePicker's inline creation
  // flow) needs getExercise/useAllExercises to already know about it the
  // instant this promise resolves, not after Dexie's change event fires.
  setCustomExercisesSnapshot([...getCustomExercisesSnapshot(), def]);

  return def;
}

export interface UpdateCustomExerciseInput {
  name: string;
  equipment?: Equipment;
  muscle?: MuscleGroup;
}

/**
 * Updates name/equipment/muscle on an existing custom exercise. Tracking
 * type is deliberately not editable here: letting it change on an exercise
 * that already has sets logged under its old shape (reps under one
 * schema, none under another) would leave that history inconsistent with
 * what the exercise now claims to log. CustomExerciseForm derives and
 * locks the type from the existing record (via trackingTypeOf) for this
 * reason — delete and recreate is the path for a genuine type change.
 */
export async function updateCustomExercise(
  id: string,
  input: UpdateCustomExerciseInput,
): Promise<CustomExerciseDef> {
  const name = input.name.trim();
  if (name === "") throw new Error("Name is required.");

  const existing = getCustomExercisesSnapshot().find((e) => e.id === id);
  if (!existing) throw new Error("Exercise not found.");

  const updated: CustomExerciseDef = {
    ...existing,
    name,
    ...deriveExerciseFields(trackingTypeOf(existing), input.equipment, input.muscle),
  };

  await getDb().customExercises.put(updated);
  setCustomExercisesSnapshot(getCustomExercisesSnapshot().map((e) => (e.id === id ? updated : e)));
  return updated;
}

/**
 * Soft-deletes a custom exercise: sets archivedAt rather than removing the
 * row. A hard delete would leave every workout/PR that ever logged this
 * exercise pointing at nothing — getExercise would return undefined for
 * it, and every place that renders a logged set (history, this exercise's
 * own progress charts, formatCompletedSet) would have to handle a vanished
 * definition instead of just carrying on showing old data. Archiving keeps
 * getExercise resolving it, so that history keeps working exactly as
 * before, while useAllExercises excludes it by default, so it stops being
 * offered anywhere a NEW exercise gets picked. No unarchive UI yet, but
 * the row isn't destroyed, so restoring one by hand is a one-line change
 * if that's ever needed.
 */
export async function archiveCustomExercise(id: string): Promise<void> {
  const existing = getCustomExercisesSnapshot().find((e) => e.id === id);
  if (!existing) return;

  const updated: CustomExerciseDef = { ...existing, archivedAt: Date.now() };
  await getDb().customExercises.put(updated);
  setCustomExercisesSnapshot(getCustomExercisesSnapshot().map((e) => (e.id === id ? updated : e)));
}
