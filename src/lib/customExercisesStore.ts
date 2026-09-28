import { useSyncExternalStore } from "react";
import type { ExerciseDef } from "@/lib/exercises";

/**
 * A user-created exercise — structurally an ExerciseDef (every existing
 * helper that reads one, from getExercise to getExerciseLoggingSchema to
 * matchesExerciseQuery, already knows what to do with it) plus createdAt
 * for sorting newest-first. Persisted in its own Dexie table
 * (AppDB.customExercises in db.ts) rather than appended to the static
 * EXERCISES catalog in exercises.ts.
 */
export interface CustomExerciseDef extends ExerciseDef {
  createdAt: number;
}

/**
 * Synchronous, always-current mirror of the customExercises table.
 *
 * getExercise() and 50+ other call sites across the app read the built-in
 * EXERCISES catalog as a plain synchronous array, not a Dexie query — every
 * one of them stays a pure, synchronous function over static data because
 * of that. Making custom exercises readable the same way (a plain array,
 * not a query) is what lets this feature slot into getExercise without
 * turning any of those call sites async. Kept in sync by
 * CustomExercisesLoader (mounted once in _app.tsx) via setCustomExercisesSnapshot
 * — nothing else should call that directly.
 *
 * Deliberately its own file with no runtime dependency on exercises.ts
 * (only a type import below, erased at compile time): exercises.ts's
 * getExercise needs to read this snapshot, while this store's usual
 * consumers (see useAllExercises in customExercises.ts) need EXERCISES
 * from exercises.ts — splitting the two avoids a circular runtime import
 * between them.
 */
let snapshot: CustomExerciseDef[] = [];
const listeners = new Set<() => void>();

export function getCustomExercisesSnapshot(): CustomExerciseDef[] {
  return snapshot;
}

/** The only writer — called by CustomExercisesLoader whenever the
 *  underlying Dexie query first resolves or changes. */
export function setCustomExercisesSnapshot(next: CustomExerciseDef[]): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read of every custom exercise — re-renders the caller whenever
 *  one is added or the app first loads them, without each caller running
 *  its own Dexie live query. See useAllExercises in customExercises.ts for
 *  the usual way this gets combined with the built-in catalog. */
export function useCustomExercises(): CustomExerciseDef[] {
  return useSyncExternalStore(subscribe, getCustomExercisesSnapshot);
}
