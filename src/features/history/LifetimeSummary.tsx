import { useMemo } from "react";
import { Dumbbell, TrendingUp, Timer, Clock } from "lucide-react";
import type { Workout } from "@/lib/db";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { formatTimeTrained } from "@/features/history/duration";
import { SummaryStat } from "@/features/history/SummaryStat";

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
        <SummaryStat
          icon={<Dumbbell className="h-4 w-4" />}
          label="Total workouts"
          value={stats.totalSessions.toLocaleString()}
          footnote="Every workout counts."
        />
        <SummaryStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total volume"
          value={`${Math.round(stats.totalVolume).toLocaleString()} kg`}
          footnote="Weight moved, workout after workout."
        />
        <SummaryStat
          icon={<Timer className="h-4 w-4" />}
          label="Time trained"
          value={stats.timeTrained}
          footnote="Time invested in yourself."
        />
        <SummaryStat
          icon={<Clock className="h-4 w-4" />}
          label="Training for"
          value={stats.trainingDuration}
          footnote="However long it's been, you showed up."
        />
      </div>
    </section>
  );
}

interface LifetimeStats {
  totalSessions: number;
  totalVolume: number;
  timeTrained: string;
  trainingDuration: string;
}

function computeLifetimeStats(workouts: Workout[]): LifetimeStats {
  const totalSessions = workouts.length;

  const totalVolume = workouts.reduce(
    (acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume,
    0,
  );

  const totalSeconds = workouts.reduce((acc, w) => acc + (w.durationSec ?? 0), 0);

  const firstWorkoutAt = workouts.length
    ? Math.min(...workouts.map((w) => w.startedAt))
    : Date.now();

  return {
    totalSessions,
    totalVolume,
    timeTrained: formatTimeTrained(totalSeconds),
    trainingDuration: formatTrainingDuration(firstWorkoutAt, Date.now()),
  };
}

/** Elapsed time since the first workout, phrased as a duration ("2
 *  weeks", "8 months", "1 year, 2 months") rather than a date — this is
 *  about how long the user has been showing up, not when they started.
 *  Below a month gets week-level granularity so a real fortnight of
 *  training doesn't collapse into "Just started" alongside day one. */
function formatTrainingDuration(startMs: number, nowMs: number): string {
  const start = new Date(startMs);
  const now = new Date(nowMs);

  const dayMs = 86400000;
  const days = Math.floor((nowMs - startMs) / dayMs);

  if (days < 7) return "Just started";

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 1) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }

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
