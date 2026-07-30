import { useMemo } from "react";
import { Dumbbell, TrendingUp, Timer } from "lucide-react";
import type { Workout } from "@/lib/db";
import { computeWorkoutStats } from "@/lib/workoutStats";
import { formatTimeTrained } from "@/features/history/duration";
import { SummaryStat } from "@/features/history/SummaryStat";

interface CurrentYearSummaryProps {
  workouts: Workout[];
}

/**
 * This-year totals — same "only counts up, never compared" spirit as
 * Lifetime Summary, just scoped to the current calendar year.
 *
 * Deliberately renders nothing unless training actually spans into a
 * second calendar year: if every workout happened this year, this
 * section would just repeat Lifetime Summary's numbers back at the
 * user, which adds noise rather than a new sense of progress.
 */
export function CurrentYearSummary({ workouts }: CurrentYearSummaryProps) {
  const currentYear = new Date().getFullYear();

  const spansMultipleYears = useMemo(
    () => workouts.some((w) => new Date(w.startedAt).getFullYear() < currentYear),
    [workouts, currentYear],
  );

  const stats = useMemo(
    () => computeYearStats(workouts, currentYear),
    [workouts, currentYear],
  );

  if (!spansMultipleYears) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">{currentYear} So Far</h2>
      <div className="grid grid-cols-3 gap-3">
        <SummaryStat
          icon={<Dumbbell className="h-4 w-4" />}
          label="Workouts"
          value={stats.sessions.toLocaleString()}
          footnote="Every session counts."
        />
        <SummaryStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Volume"
          value={`${Math.round(stats.volume).toLocaleString()} kg`}
          footnote="Building up all year."
        />
        <SummaryStat
          icon={<Timer className="h-4 w-4" />}
          label="Time trained"
          value={stats.timeTrained}
          footnote="Time invested this year."
        />
      </div>
    </section>
  );
}

interface YearStats {
  sessions: number;
  volume: number;
  timeTrained: string;
}

function computeYearStats(workouts: Workout[], year: number): YearStats {
  const thisYear = workouts.filter((w) => new Date(w.startedAt).getFullYear() === year);

  const sessions = thisYear.length;

  const volume = thisYear.reduce(
    (acc, w) => acc + computeWorkoutStats(w.exercises).totalVolume,
    0,
  );

  const totalSeconds = thisYear.reduce((acc, w) => acc + (w.durationSec ?? 0), 0);

  return { sessions, volume, timeTrained: formatTimeTrained(totalSeconds) };
}
