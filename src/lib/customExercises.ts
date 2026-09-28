import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { EXERCISES, type ExerciseDef, type MuscleGroup, type Equipment } from "@/lib/exercises";
import {
  type CustomExerciseDef,
  setCustomExercisesSnapshot,
  useCustomExercises,
} from "@/lib/customExercisesStore";

export type { CustomExerciseDef } from "@/lib/customExercisesStore";

/** EXERCISES plus every custom exercise, reactively — re-renders the
 *  caller when one is added. Use this in place of a bare EXERCISES import
 *  wherever the UI browses/filters/searches the catalog (ExercisePicker,
 *  the Exercise Library page, Exercise Rest Times); getExercise() in
 *  exercises.ts already covers lookup-by-id on its own. */
export function useAllExercises(): ExerciseDef[] {
  const custom = useCustomExercises();
  // Memoized on the snapshot (which only changes identity when the set of
  // custom exercises does), so callers get a stable array between renders.
  return useMemo(() => (custom.length === 0 ? EXERCISES : [...EXERCISES, ...custom]), [custom]);
}

/** True for a custom (user-created) exercise, as opposed to one from the
 *  built-in catalog — used to show a "Custom" tag in list rows. Checking
 *  for `createdAt` rather than importing CustomExerciseDef keeps callers
 *  that only have an ExerciseDef able to ask this without a cast. */
export function isCustomExercise(def: ExerciseDef): boolean {
  return "createdAt" in def;
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

/**
 * The tracking-type choices offered by the creation form — a simplified
 * front for the cardio/time/equipment flag combinations
 * getExerciseLoggingSchema (exercises.ts) already knows how to read. Not a
 * field on ExerciseDef itself; createCustomExercise below is what
 * translates a choice here into the actual flags.
 */
export type CustomExerciseTrackingType = "weighted" | "bodyweight" | "timed" | "cardio";

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
 * — all easy to layer on later without changing what's here. Editing and
 * deleting are a deliberate follow-up too, not part of this.
 */
export async function createCustomExercise(
  input: CreateCustomExerciseInput,
): Promise<CustomExerciseDef> {
  const name = input.name.trim();
  if (name === "") throw new Error("Name is required.");

  const id = `custom-${slugify(name) || "exercise"}-${randomSuffix()}`;
  const base = { id, name, createdAt: Date.now() };

  let def: CustomExerciseDef;
  switch (input.trackingType) {
    case "cardio":
      // time:true alongside cardio:true matches every built-in cardio
      // entry (see exercises.ts) — getExerciseLoggingSchema checks
      // isCardio first regardless, but every catalog entry carries both.
      def = { ...base, muscle: "Cardio", equipment: "Cardio", cardio: true, time: true };
      break;
    case "timed":
      def = {
        ...base,
        muscle: input.muscle ?? "Abs",
        equipment: "Bodyweight",
        time: true,
      };
      break;
    case "bodyweight":
      def = { ...base, muscle: input.muscle ?? "Chest", equipment: "Bodyweight" };
      break;
    case "weighted":
    default:
      def = {
        ...base,
        muscle: input.muscle ?? "Chest",
        equipment: input.equipment ?? "Barbell",
      };
      break;
  }

  await getDb().customExercises.add(def);
  return def;
}
