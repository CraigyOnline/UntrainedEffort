import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { z } from "zod";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { computeIntensity } from "@/lib/muscles";
import { syncWorkoutIntegrity } from "@/lib/workoutIntegrity";
import { filterWorkouts, hasActiveFilters } from "@/lib/historyFilters";
import { EmptyState } from "@/components/EmptyState";
import { ExpandableMuscleMap } from "@/components/ExpandableMuscleMap";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Kept in the URL (q/from/to) so a search or date range survives a refresh
// and behaves like a normal back/forward-able navigation, not just local
// component state.
const historySearchSchema = z.object({
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_app/history/")({
  validateSearch: historySearchSchema,
  component: HistoryList,
});

function HistoryList() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [visibleCount, setVisibleCount] = useState(10);
  const [pendingDelete, setPendingDelete] = useState<Workout | null>(null);

  const filterQuery = search.q ?? "";
  const filterDateFrom = search.from;
  const filterDateTo = search.to;
  const filtersActive = hasActiveFilters({
    query: filterQuery,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
  });

  // Merges into the current search params (rather than replacing them) and
  // uses `replace` so typing in the search box doesn't fill up browser
  // history with one entry per keystroke.
  function updateSearch(patch: { q?: string; from?: string; to?: string }) {
    navigate({
      to: "/history",
      search: (prev) => {
        const next = { ...prev, ...patch };
        if (!next.q) delete next.q;
        if (!next.from) delete next.from;
        if (!next.to) delete next.to;
        return next;
      },
      replace: true,
    });
  }

  const workouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  ) as Workout[] | undefined;

  const filteredWorkouts = useMemo(
    () =>
      workouts
        ? filterWorkouts(workouts, {
            query: filterQuery,
            dateFrom: filterDateFrom,
            dateTo: filterDateTo,
          })
        : undefined,
    [workouts, filterQuery, filterDateFrom, filterDateTo],
  );

  const displayedWorkouts = filtersActive
    ? filteredWorkouts
    : filteredWorkouts?.slice(0, visibleCount);

  // Single query for all PR records — grouped in memory, avoids N queries per card
  const allPRs = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<PRRecord[]>([])
        : getDb().prHistory.toArray(),
    [],
  ) as PRRecord[] | undefined;

  // Map workoutId → PR count
  const prCountByWorkout = (() => {
    const map = new Map<number, number>();
    if (!allPRs) return map;
    for (const pr of allPRs) {
      if (pr.workoutId == null) continue;
      map.set(pr.workoutId, (map.get(pr.workoutId) ?? 0) + 1);
    }
    return map;
  })();

  async function remove(workout: Workout) {
    if (!workout.id) return;
    const db = getDb();
    await db.transaction("rw", db.workouts, db.prHistory, async () => {
      await db.workouts.delete(workout.id!);
      await syncWorkoutIntegrity();
    });
    setPendingDelete(null);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold">Workout History</h1>

      <div className="flex flex-col gap-2">
        <input
          value={search.q ?? ""}
          onChange={(e) => updateSearch({ q: e.target.value })}
          placeholder="Search by workout or exercise…"
          className="rounded-lg bg-card px-3 py-2 text-sm outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={search.from ?? ""}
              onChange={(e) => updateSearch({ from: e.target.value })}
              className="rounded-lg bg-card px-2 py-1 text-xs outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={search.to ?? ""}
              onChange={(e) => updateSearch({ to: e.target.value })}
              className="rounded-lg bg-card px-2 py-1 text-xs outline-none"
            />
          </label>

          {filtersActive && (
            <button
              onClick={() => navigate({ to: "/history", search: {} })}
              className="ml-auto text-xs text-muted-foreground underline"
            >
              Clear
            </button>
          )}
        </div>

        {filtersActive && (
          <p className="text-xs text-muted-foreground">
            {filteredWorkouts?.length ?? 0} matching{" "}
            {filteredWorkouts?.length === 1 ? "workout" : "workouts"}
          </p>
        )}
      </div>

      {workouts && workouts.length === 0 && (
        <EmptyState
          message="No workouts yet."
          action={{ label: "Start a workout", onClick: () => navigate({ to: "/workout" }) }}
        />
      )}

      {!!workouts?.length && filtersActive && filteredWorkouts?.length === 0 && (
        <EmptyState message="No workouts match your filters." />
      )}

      <ul className="flex flex-col gap-3">
        {displayedWorkouts?.map((w) => {
          const { totalSets, totalVolume } = computeWorkoutStats(w.exercises);
          const intensity = computeIntensity(w.exercises);
          const hasMuscleData = Object.keys(intensity).length > 0;

          const prCount = w.id != null ? (prCountByWorkout.get(w.id) ?? 0) : 0;

          return (
            <li
              key={w.id}
              className="cursor-pointer rounded-xl bg-card p-4 active:scale-[0.99] transition"
              onClick={() =>
                w.id && navigate({ to: "/history/$id", params: { id: String(w.id) } })
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(w.startedAt).toLocaleDateString()} ·{" "}
                    {Math.max(1, Math.round((w.durationSec ?? 0) / 60))} min ·{" "}
                    {w.exercises.length} ex · {totalSets} sets
                  </p>

                  {totalVolume > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Volume: {totalVolume.toLocaleString()} kg
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {w.exercises.slice(0, 5).map((e, i) => (
                      <span
                        key={i}
                        className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {getExercise(e.exerciseId)?.name ?? e.exerciseId}
                      </span>
                    ))}
                    {w.exercises.length > 5 && (
                      <span className="text-xs text-muted-foreground">
                        +{w.exercises.length - 5}
                      </span>
                    )}
                    {prCount > 0 && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        🏆 {prCount} {prCount === 1 ? "PR" : "PRs"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Muscle map thumbnail — same size/styling as the Workout/Routine cards */}
                  <div className="w-16 shrink-0 flex items-center justify-center px-1">
                    {hasMuscleData && (
                      <ExpandableMuscleMap
                        intensity={intensity}
                        compact
                        className="max-h-16"
                        onTriggerClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>

                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setPendingDelete(w);
                    }}
                    aria-label="Delete workout"
                    className="flex h-11 w-11 items-center justify-center text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!filtersActive && filteredWorkouts && filteredWorkouts.length > visibleCount && (
        <Button variant="outline" onClick={() => setVisibleCount((v) => v + 10)}>
          Load More
        </Button>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && remove(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
