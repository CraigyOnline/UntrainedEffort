import { useMemo, type ReactNode } from "react";
import { Dumbbell, TrendingUp, CalendarDays, Clock } from "lucide-react";
import type { Workout } from "@/lib/db";
import { computeWorkoutStats } from "@/lib/workoutStats";

interface LifetimeSummaryProps {
  workouts: Workout[];
}

/**
 * Cumulative, all-time totals — deliberately never time-boxed and never
 * compared against a prior period. This is "how much have I invested",
 * not "how am I trending", so every number here can only ever go up.
 */
export function LifetimeSummary({ workouts }: LifetimeSummaryProps) {
  const stats = useMemo(() => computeLifetimeStats(workouts), [workouts]);

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Lifetime Summary</h2>
      <div className="grid grid-cols-2 gap-3">
        <LifetimeStat
          icon={<Dumbbell className="h-4 w-4" />}
          label="Total workouts"
          value={stats.totalSessions.toLocaleString()}
        />
        <LifetimeStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total volume"
          value={`${Math.round(stats.totalVolume).toLocaleString()} kg`}
        />
        <LifetimeStat
          icon={<CalendarDays className="h-4 w-4" />}
          label="Active days"
          value={stats.totalActiveDays.toLocaleString()}
        />
        <LifetimeStat
          icon={<Clock className="h-4 w-4" />}
          label="Training for"
          value={stats.trainingDuration}
        />
      </div>
    </section>
  );
}

function LifetimeStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

interface LifetimeStats {
  totalSessions: number;
  totalVolume: number;
  totalActiveDays: number;
  trainingDuration: string;
}

function computeLifetimeStats(workouts: Workout[]): LifetimeStats {
  const totalSessions = workouts.length;

  const totalVolume = workouts.reduce(
    (acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume,
    0,
  );

  const totalActiveDays = new Set(
    workouts.map((w) => {
      const d = new Date(w.startedAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  ).size;

  const firstWorkoutAt = workouts.length
    ? Math.min(...workouts.map((w) => w.startedAt))
    : Date.now();

  return {
    totalSessions,
    totalVolume,
    totalActiveDays,
    trainingDuration: formatTrainingDuration(firstWorkoutAt, Date.now()),
  };
}

/** Whole-months-and-years elapsed since the first workout, phrased as a
 *  duration ("8 months", "1 year, 2 months") rather than a date — this is
 *  about how long the user has been showing up, not when they started. */
function formatTrainingDuration(startMs: number, nowMs: number): string {
  const start = new Date(startMs);
  const now = new Date(nowMs);

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 1) return "Just started";

  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"}`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  return `${years} ${years === 1 ? "year" : "years"}, ${remainingMonths} ${
    remainingMonths === 1 ? "month" : "months"
  }`;
}
