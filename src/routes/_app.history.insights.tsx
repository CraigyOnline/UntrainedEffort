import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { type ReactNode } from "react";
import { Dumbbell } from "lucide-react";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { TrainingConsistencyHeatmap } from "@/features/history/TrainingConsistencyHeatmap";
import { Totals } from "@/features/history/Totals";
import { MonthlySummaries } from "@/features/history/MonthlySummaries";
import { Milestones } from "@/features/history/Milestones";
import { CardioSummary } from "@/features/history/CardioSummary";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_app/history/insights")({
  head: () => ({
    meta: [{ title: "Insights · Untrained Effort" }],
  }),
  component: InsightsPage,
});

// Section header style shared across Training/Cardio/Milestones below —
// bare text, no card, matching the "no-surface for section labels" tier
// introduced by the Overview redesign work (kept consistent here even
// though this commit doesn't otherwise restyle these components).
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function InsightsPage() {
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
      typeof window === "undefined" ? Promise.resolve<PRRecord[]>([]) : getDb().prHistory.toArray(),
    [],
  ) as PRRecord[] | undefined;

  const hasWorkouts = !!workouts?.length;

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <div className="flex items-center justify-end">
        <button
          onClick={() => navigate({ to: "/exercises" })}
          className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground/80 active:scale-[0.98]"
        >
          <Dumbbell className="h-3.5 w-3.5" />
          Exercises
        </button>
      </div>

      {!hasWorkouts && (
        <EmptyState
          message="No workouts yet."
          action={{ label: "Start a workout", onClick: () => navigate({ to: "/workout" }) }}
        />
      )}

      {hasWorkouts && (
        <>
          <SectionLabel>Training</SectionLabel>
          <Totals workouts={workouts ?? []} />
          <TrainingConsistencyHeatmap workouts={workouts ?? []} />
          <MonthlySummaries workouts={workouts ?? []} />

          {/* Strength (volume trend, exercise progression, PRs) intentionally
              not yet here — that content still lives on Overview and moves
              into this section when Overview's composition work relocates
              it, per the redesign spec's implementation sequence. */}

          <SectionLabel>Cardio</SectionLabel>
          <CardioSummary workouts={workouts ?? []} />

          <SectionLabel>Milestones</SectionLabel>
          <Milestones workouts={workouts ?? []} totalPRs={allPRs?.length ?? 0} />
        </>
      )}
    </div>
  );
}
