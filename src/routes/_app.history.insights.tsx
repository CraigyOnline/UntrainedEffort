import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { Dumbbell } from "lucide-react";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import { computeMonthOverMonth } from "@/lib/workoutStats";
import { TrainingConsistencyHeatmap } from "@/features/history/TrainingConsistencyHeatmap";
import { Totals } from "@/features/history/Totals";
import { MonthlySummaries } from "@/features/history/MonthlySummaries";
import { Milestones } from "@/features/history/Milestones";
import { CardioSummary } from "@/features/history/CardioSummary";
import { StrengthSection } from "@/features/history/StrengthSection";
import { EmptyState } from "@/components/EmptyState";

type InsightsSection = "training" | "strength" | "cardio" | "achievements";

const SECTIONS: { id: InsightsSection; label: string; question: string }[] = [
  { id: "training", label: "Training", question: "How consistently are you training?" },
  { id: "strength", label: "Strength", question: "Are you getting stronger?" },
  { id: "cardio", label: "Cardio", question: "How's your cardio developing?" },
  { id: "achievements", label: "Achievements", question: "What have you accomplished?" },
];

// Kept in the URL (section) so a direct link — e.g. Overview's "View
// muscle activity" — can land on a specific tab instead of always the
// "training" default, same rationale as timeline's own q/from/to.
const insightsSearchSchema = z.object({
  section: z.enum(["training", "strength", "cardio", "achievements"]).optional(),
});

export const Route = createFileRoute("/_app/history/insights")({
  validateSearch: insightsSearchSchema,
  head: () => ({
    meta: [{ title: "Insights · Untrained Effort" }],
  }),
  component: InsightsPage,
});

// Section header style — bare text, no card, matching the "no-surface for
// section labels" tier from the Overview redesign work.
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * This month vs last month, promoted above the full monthly list per
 * point 11 — the list itself is real, useful data, but a scrolling
 * database of past months isn't an *insight* on its own. Shares
 * computeMonthOverMonth with Totals' own "Month" toggle position.
 */
function MonthComparison({ workouts }: { workouts: Workout[] }) {
  const { thisMonth, lastMonth } = useMemo(() => computeMonthOverMonth(workouts), [workouts]);

  const sessionsDelta = thisMonth.sessions - lastMonth.sessions;
  const sessionsCaption =
    lastMonth.sessions === 0
      ? null
      : sessionsDelta === 0
        ? "same as last month"
        : `${sessionsDelta > 0 ? "+" : ""}${sessionsDelta} vs last month`;

  const volumePct =
    lastMonth.volume > 0
      ? Math.round(((thisMonth.volume - lastMonth.volume) / lastMonth.volume) * 100)
      : null;
  const volumeCaption =
    volumePct === null ? null : `${volumePct > 0 ? "+" : ""}${volumePct}% vs last month`;

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-2xl font-bold">{thisMonth.sessions.toLocaleString()} workouts</p>
        <p className="text-2xl font-bold">{Math.round(thisMonth.volume).toLocaleString()} kg</p>
      </div>
      <div className="mt-1 flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">{sessionsCaption}</p>
        <p className="text-xs text-muted-foreground">{volumeCaption}</p>
      </div>
    </div>
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
  );

  const allPRs = useLiveQuery(
    () =>
      typeof window === "undefined" ? Promise.resolve<PRRecord[]>([]) : getDb().prHistory.toArray(),
    [],
  );

  const searchParams = Route.useSearch();
  const [section, setSection] = useState<InsightsSection>(searchParams.section ?? "training");
  const [monthsExpanded, setMonthsExpanded] = useState(false);

  const hasWorkouts = !!workouts?.length;
  const activeSection = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                section === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground active:bg-secondary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate({ to: "/exercises" })}
          aria-label="Browse exercises"
          className="flex shrink-0 items-center justify-center rounded-full bg-secondary/60 p-2 text-foreground/80 active:scale-[0.96]"
        >
          <Dumbbell className="h-4 w-4" />
        </button>
      </div>

      {hasWorkouts && <p className="text-xs text-muted-foreground">{activeSection.question}</p>}

      {!hasWorkouts && (
        <EmptyState
          message="No workouts yet."
          action={{ label: "Start a workout", onClick: () => navigate({ to: "/workout" }) }}
        />
      )}

      {hasWorkouts && section === "training" && (
        <>
          <Totals workouts={workouts ?? []} />

          <SectionLabel>Consistency</SectionLabel>
          <TrainingConsistencyHeatmap workouts={workouts ?? []} />

          <SectionLabel>This month</SectionLabel>
          <MonthComparison workouts={workouts ?? []} />
          {!monthsExpanded ? (
            <button
              onClick={() => setMonthsExpanded(true)}
              className="text-left text-xs font-medium text-primary active:opacity-70"
            >
              View all months →
            </button>
          ) : (
            <MonthlySummaries workouts={workouts ?? []} />
          )}
        </>
      )}

      {hasWorkouts && section === "strength" && <StrengthSection workouts={workouts ?? []} />}

      {hasWorkouts && section === "cardio" && <CardioSummary workouts={workouts ?? []} />}

      {hasWorkouts && section === "achievements" && (
        <Milestones workouts={workouts ?? []} totalPRs={allPRs?.length ?? 0} />
      )}
    </div>
  );
}
