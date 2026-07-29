import { useMemo } from "react";
import { Flame, CalendarRange, Trophy } from "lucide-react";
import type { Workout } from "@/lib/db";
import { SummaryStat } from "@/features/history/SummaryStat";

// Workout-count thresholds worth celebrating. Deliberately one-directional:
// once reached, a milestone stays unlocked forever — nothing on this page
// can regress.
const WORKOUT_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

interface MilestonesProps {
  workouts: Workout[];
  totalPRs: number;
}

/**
 * Milestones celebrate the journey, not a single measure of strength —
 * a PR is one entry among equals here (Longest streak, Months trained,
 * PRs celebrated, workout-count badges), not a dominant category.
 */
export function Milestones({ workouts, totalPRs }: MilestonesProps) {
  const stats = useMemo(() => computeMilestoneStats(workouts), [workouts]);

  if (workouts.length === 0) return null;

  const unlockedThresholds = WORKOUT_MILESTONES.filter((t) => stats.totalSessions >= t);
  const nextThreshold = WORKOUT_MILESTONES.find((t) => stats.totalSessions < t);

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Milestones</h2>

      <div className="grid grid-cols-3 gap-3">
        <SummaryStat
          icon={<Flame className="h-4 w-4" />}
          label="Longest streak"
          value={`${stats.longestStreak} ${stats.longestStreak === 1 ? "day" : "days"}`}
        />
        <SummaryStat
          icon={<CalendarRange className="h-4 w-4" />}
          label="Months trained"
          value={stats.monthsTrained.toLocaleString()}
        />
        <SummaryStat
          icon={<Trophy className="h-4 w-4" />}
          label="PRs celebrated"
          value={totalPRs.toLocaleString()}
        />
      </div>

      {unlockedThresholds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {unlockedThresholds.map((t) => (
            <span
              key={t}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              🏅 {t} workouts
            </span>
          ))}
        </div>
      )}

      {nextThreshold && (
        <p className="mt-2 text-xs text-muted-foreground">
          {nextThreshold - stats.totalSessions}{" "}
          {nextThreshold - stats.totalSessions === 1 ? "workout" : "workouts"} to your next
          milestone
        </p>
      )}
    </section>
  );
}

interface MilestoneStats {
  totalSessions: number;
  longestStreak: number;
  monthsTrained: number;
}

function computeMilestoneStats(workouts: Workout[]): MilestoneStats {
  const totalSessions = workouts.length;

  const dayMs = 86400000;
  const dayOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const days = Array.from(new Set(workouts.map((w) => dayOf(w.startedAt)))).sort(
    (a, b) => a - b,
  );

  let longestStreak = days.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === dayMs) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  const monthsTrained = new Set(
    workouts.map((w) => {
      const d = new Date(w.startedAt);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  ).size;

  return { totalSessions, longestStreak, monthsTrained };
}
