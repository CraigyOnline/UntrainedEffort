import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { getExercise } from "@/lib/exercises";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { computeIntensity } from "@/lib/muscles";
import { syncWorkoutIntegrity } from "@/lib/workoutIntegrity";
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

export const Route = createFileRoute("/_app/history/")({
  component: HistoryList,
});

function HistoryList() {
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(10);
  const [pendingDelete, setPendingDelete] = useState<Workout | null>(null);

  const workouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  ) as Workout[] | undefined;

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

      {!workouts?.length && (
        <p className="text-sm text-muted-foreground">
          No workouts yet. Start one from the Workout tab.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {workouts?.slice(0, visibleCount).map((w) => {
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

      {workouts && workouts.length > visibleCount && (
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
