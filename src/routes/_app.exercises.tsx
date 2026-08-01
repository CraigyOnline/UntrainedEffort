import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Search } from "lucide-react";
import { getDb, type Workout } from "@/lib/db";
import { EXERCISES, matchesExerciseQuery } from "@/lib/exercises";
import { computeLastTrainedAt } from "@/lib/exerciseProgress";
import { formatRelativeDate } from "@/lib/format";

export const Route = createFileRoute("/_app/exercises")({
  head: () => ({
    meta: [
      { title: "Exercises · Untrained Effort" },
      { name: "description", content: "Browse every exercise and when you last trained it." },
    ],
  }),
  component: ExercisesListPage,
});

function formatMuscle(mg: string) {
  if (mg === "UpperBack") return "Upper Back";
  if (mg === "LowerBack") return "Lower Back";
  return mg;
}

/**
 * The one full, browsable list of every exercise in the catalog — search
 * plus a row per exercise, each linking to its progress page
 * (/exercise/$id). Reachable from both Profile (Recent Progress's "See
 * all") and Progress (the "Exercises" pill next to "Timeline"), rather
 * than being nested under either — neither page owns exercise browsing,
 * they both just link into it.
 *
 * Same search/list shape as Settings → Exercise Rest Times, but unfiltered
 * (that list drops cardio/interval exercises since they can't get a rest
 * timer; progress applies to every exercise) and with a "last trained"
 * badge instead of a rest-duration one.
 */
function ExercisesListPage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const workouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  ) as Workout[] | undefined;

  const lastTrainedAt = useMemo(() => computeLastTrainedAt(workouts ?? []), [workouts]);

  const filtered = EXERCISES.filter((e) => matchesExerciseQuery(e, q));

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => router.history.back()} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">Exercises</h1>
          <p className="text-xs text-muted-foreground">Browse every exercise and its progress</p>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises…"
          className="w-full rounded-lg border border-border/50 bg-card py-2 pr-3 pl-9 text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No exercises found</p>
        )}
        {filtered.map((e, i) => {
          const trainedAt = lastTrainedAt.get(e.id);
          return (
            <Link
              key={e.id}
              to="/exercise/$id"
              params={{ id: e.id }}
              className={`flex items-center justify-between px-4 py-3 text-left active:bg-secondary/40 ${
                i > 0 ? "border-t border-border/30" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="text-xs text-muted-foreground">{formatMuscle(e.muscle)}</p>
              </div>
              <span className="shrink-0 pl-3 text-xs text-muted-foreground">
                {trainedAt != null
                  ? `Last trained ${formatRelativeDate(trainedAt)}`
                  : "Not yet trained"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
