import { useMemo } from "react";
import type { Workout } from "@/lib/db";
import { computeWorkoutStats } from "@/lib/workoutStats";

interface MonthlySummariesProps {
  workouts: Workout[];
}

interface MonthGroup {
  key: string;
  label: string;
  sessionCount: number;
  activeDays: number;
  volume: number;
}

/**
 * Reverse-chronological monthly recap cards. Deliberately built from a
 * pure grouping of actual workouts, never from a full calendar range —
 * a month with zero workouts (whether before the user's first-ever
 * workout, or just a quiet gap) never gets a bucket at all, so there's
 * no "0 workouts this month" card to word carefully around. Silence is
 * the correct treatment for a rest month, not a muted card.
 */
export function MonthlySummaries({ workouts }: MonthlySummariesProps) {
  const months = useMemo(() => groupByMonth(workouts), [workouts]);

  if (months.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Monthly Summaries</h2>
      <div className="flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.key} className="rounded-2xl bg-card p-4">
            <p className="font-semibold">{m.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {m.sessionCount} {m.sessionCount === 1 ? "workout" : "workouts"} ·{" "}
              {m.activeDays} active {m.activeDays === 1 ? "day" : "days"}
              {m.volume > 0 && ` · ${Math.round(m.volume).toLocaleString()} kg`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByMonth(workouts: Workout[]): MonthGroup[] {
  const buckets = new Map<string, Workout[]>();

  for (const w of workouts) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(w);
    else buckets.set(key, [w]);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1)) // key is "YYYY-MM", so string sort is chronological
    .map(([key, monthWorkouts]) => {
      const [year, month] = key.split("-").map(Number);

      const activeDays = new Set(
        monthWorkouts.map((w) => {
          const d = new Date(w.startedAt);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }),
      ).size;

      const volume = monthWorkouts.reduce(
        (acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume,
        0,
      );

      return {
        key,
        label: new Date(year, month, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        }),
        sessionCount: monthWorkouts.length,
        activeDays,
        volume,
      };
    });
}
