import { EXERCISES } from "@/lib/exercises";
import type { Workout } from "@/lib/db";

/**
 * History search & filtering (workout name, exercise name, date range).
 *
 * All filtering happens in memory over the array `useLiveQuery` already
 * loads for the history list. Exercise names aren't stored on `Workout` —
 * only `exerciseId` is — so exercise-name matching can only ever happen
 * client-side against the static catalog anyway; pushing the other filters
 * into a Dexie query would just split one feature across two layers for no
 * real benefit at this data scale.
 */

/** exerciseId → name, built once from the static catalog rather than
 *  re-running EXERCISES.find() for every exercise of every workout on
 *  every keystroke. */
const EXERCISE_NAME_BY_ID: Map<string, string> = new Map(EXERCISES.map((e) => [e.id, e.name]));

export interface HistoryFilters {
  /** Free-text query matched against workout name and exercise names. */
  query: string;
  /** Inclusive lower bound, as a `YYYY-MM-DD` date-input value. */
  dateFrom?: string;
  /** Inclusive upper bound, as a `YYYY-MM-DD` date-input value. */
  dateTo?: string;
}

/** Whether any filter is actually narrowing the list — used to decide
 *  between the existing paginated view and "show all matches". */
export function hasActiveFilters(filters: HistoryFilters): boolean {
  return filters.query.trim() !== "" || !!filters.dateFrom || !!filters.dateTo;
}

function matchesQuery(workout: Workout, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;

  if (workout.name.toLowerCase().includes(q)) return true;

  return workout.exercises.some((e) => {
    const name = EXERCISE_NAME_BY_ID.get(e.exerciseId);
    return name != null && name.toLowerCase().includes(q);
  });
}

/** Local start-of-day for a `YYYY-MM-DD` value. Parsed without a `Z` suffix
 *  so it resolves in the device's local timezone, matching what the user
 *  picked in a native date input — not UTC midnight. */
function startOfLocalDay(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

/** Local end-of-day for a `YYYY-MM-DD` value — see startOfLocalDay. */
function endOfLocalDay(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999`).getTime();
}

function matchesDateRange(workout: Workout, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && workout.startedAt < startOfLocalDay(dateFrom)) return false;
  if (dateTo && workout.startedAt > endOfLocalDay(dateTo)) return false;
  return true;
}

/** Applies all active filters (AND'ed together) to a list of workouts. */
export function filterWorkouts(workouts: Workout[], filters: HistoryFilters): Workout[] {
  return workouts.filter(
    (w) => matchesQuery(w, filters.query) && matchesDateRange(w, filters.dateFrom, filters.dateTo),
  );
}
