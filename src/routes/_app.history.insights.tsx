import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, type ReactNode } from "react";
import { Dumbbell } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDb, type Workout, type PRRecord } from "@/lib/db";
import {
  computeVolumeByPeriod,
  computeVolumeTrend,
  volumeTrendConfidence,
  type VolumePeriodGranularity,
} from "@/lib/workoutStats";
import { trendConfidenceLabel, type Trend } from "@/lib/exerciseProgress";
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

// Section header style shared across Training/Strength/Cardio/Milestones
// below — bare text, no card, matching the "no-surface for section
// labels" tier introduced by the Overview redesign work (kept consistent
// here even though this commit doesn't otherwise restyle these components).
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** Moved verbatim from the old Overview page's Volume trend card. */
function TrendLine({
  trend,
  upLabel,
  downLabel,
  flatLabel,
}: {
  trend: Trend;
  upLabel: string;
  downLabel: string;
  flatLabel: string;
}) {
  if (trend === "up") {
    return <p className="mt-1 text-base font-bold text-primary">↑ {upLabel}</p>;
  }
  if (trend === "down") {
    return <p className="mt-1 text-base font-bold text-muted-foreground">↓ {downLabel}</p>;
  }
  return <p className="mt-1 text-base font-bold text-muted-foreground">→ {flatLabel}</p>;
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

  const [volumeGranularity, setVolumeGranularity] = useState<VolumePeriodGranularity>("week");

  const volumeTrend = useMemo(() => computeVolumeTrend(workouts ?? []), [workouts]);

  const volumeSeries = useMemo(
    () =>
      computeVolumeByPeriod(
        workouts ?? [],
        volumeGranularity,
        volumeGranularity === "week" ? 8 : 6,
      ),
    [workouts, volumeGranularity],
  );

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

          {/* Strength — relocated verbatim from the old Overview page's
              "Volume trend" card. Exercise progression and PRs are still
              not here — flagged separately as a real gap, not yet
              relocated anywhere. */}
          <SectionLabel>Strength</SectionLabel>
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Volume trend (last 4 weeks vs. prior 4)
            </p>
            {volumeTrend ? (
              <>
                <TrendLine
                  trend={volumeTrend.trend}
                  upLabel="Increasing"
                  downLabel="Decreasing"
                  flatLabel="Stable"
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {trendConfidenceLabel(
                    volumeTrendConfidence(volumeTrend.recentCount, volumeTrend.priorCount),
                  )}{" "}
                  · {volumeTrend.recentCount} workout{volumeTrend.recentCount === 1 ? "" : "s"} vs.{" "}
                  {volumeTrend.priorCount} workout{volumeTrend.priorCount === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground/70">
                Not enough history yet for a trend — keep logging workouts.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              {(["week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setVolumeGranularity(g)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    volumeGranularity === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground active:bg-secondary/70"
                  }`}
                >
                  {g === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>

            <div className="mt-3 h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    interval={volumeGranularity === "week" ? 1 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", radius: 4 }}
                    formatter={(value: number) => [
                      `${Math.round(value).toLocaleString()}`,
                      "Volume",
                    ]}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="volume" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <SectionLabel>Cardio</SectionLabel>
          <CardioSummary workouts={workouts ?? []} />

          <SectionLabel>Milestones</SectionLabel>
          <Milestones workouts={workouts ?? []} totalPRs={allPRs?.length ?? 0} />
        </>
      )}
    </div>
  );
}
