import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import { List } from "lucide-react";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { TrainingConsistencyHeatmap } from "@/features/history/TrainingConsistencyHeatmap";
import { LifetimeSummary } from "@/features/history/LifetimeSummary";
import { CurrentYearSummary } from "@/features/history/CurrentYearSummary";
import { MonthlySummaries } from "@/features/history/MonthlySummaries";
import { Milestones } from "@/features/history/Milestones";
import { EmptyState } from "@/components/EmptyState";

// Kept for symmetry with the old combined route — no search UI lives here
// any more (that moved to /history/timeline), but an empty schema avoids
// a breaking change if anything still links here with old query params.
const historySearchSchema = z.object({});

export const Route = createFileRoute("/_app/history/")({
  validateSearch: historySearchSchema,
  component: ProgressPage,
});

function ProgressPage() {
  const navigate = useNavigate();

  const workouts = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<Workout[]>([])
        : getDb().workouts.orderBy("startedAt").reverse().toArray(),
    [],
  ) as Workout[] | undefined;

  // Single query for all PR records — reused by Milestones for the
  // lifetime PR count, same query the Workout Timeline route runs
  // independently for its per-workout PR badges.
  const allPRs = useLiveQuery(
    () =>
      typeof window === "undefined"
        ? Promise.resolve<PRRecord[]>([])
        : getDb().prHistory.toArray(),
    [],
  ) as PRRecord[] | undefined;

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Progress</h1>
          <p className="text-sm text-muted-foreground">Every workout counts.</p>
        </div>
        {!!workouts?.length && (
          <button
            onClick={() => navigate({ to: "/history/timeline" })}
            className="flex shrink-0 items-center gap-1 pt-1 text-xs text-muted-foreground underline underline-offset-2"
          >
            <List className="h-3.5 w-3.5" />
            Timeline
          </button>
        )}
      </div>

      <TrainingConsistencyHeatmap workouts={workouts ?? []} />

      {!!workouts?.length && <LifetimeSummary workouts={workouts} />}

      <CurrentYearSummary workouts={workouts ?? []} />

      <MonthlySummaries workouts={workouts ?? []} />

      <Milestones workouts={workouts ?? []} totalPRs={allPRs?.length ?? 0} />

      {workouts && workouts.length === 0 && (
        <EmptyState
          message="No workouts yet."
          action={{ label: "Start a workout", onClick: () => navigate({ to: "/workout" }) }}
        />
      )}
    </div>
  );
}
